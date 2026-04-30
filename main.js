const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, systemPreferences, dialog } = require('electron')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const db = require('./electron/database')
const cryptoModule = require('./electron/crypto')
const totpModule = require('./electron/totp')
const { startHttpServer, stopHttpServer, getLocalIP, setVaultAccess, clearVaultAccess } = require('./electron/httpServer')
const crypto = require('crypto')
const { createDockIcon, createTrayIcon, createAppIcon } = require('./electron/iconGen')

const isDev = process.env.ELECTRON_DEV === 'true'

// Set app name — fixes "Electron" showing in dock tooltip / about menu
app.setName('KaVach')

let mainWindow = null
let tray = null
let sessionKey = null        // AES key, in memory only
let partialAuth = false      // first factor passed, waiting for TOTP
let scrollInterval = null
let scrollTodos = []
let scrollIndex = 0
let httpInfo = null

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setDockIcon()
  createTray()
  createWindow()
  startScrolling()
  scheduleNotifications()
  const settings = db.getSettings()
  httpInfo = startHttpServer(db, cryptoModule, () => sessionKey, settings.httpPort || 3847)
})

app.on('window-all-closed', () => { /* keep alive in menu bar */ })

app.on('activate', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) createWindow()
  else { mainWindow.show(); mainWindow.focus() }
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopHttpServer()
  sessionKey = null
  partialAuth = false
})

// ─── WINDOW ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 680, minWidth: 800, minHeight: 580,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f13',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false,
    vibrancy: 'under-window',
    visualEffectState: 'active'
  })

  isDev ? mainWindow.loadURL('http://localhost:5173') : mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))

  mainWindow.once('ready-to-show', () => mainWindow.show())
  // Red X hides the window (app keeps running in menu bar + Dock)
  // Quit from Dock right-click or menu bar → Quit to fully exit
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

// ─── TRAY ─────────────────────────────────────────────────────────────────────

function createTray() {
  // Use a simple 16x16 solid icon — guaranteed to work on all macOS versions
  // The real visibility comes from the title text we always set
  let trayImg
  try {
    const buf = createTrayIcon(16)
    trayImg = nativeImage.createFromBuffer(buf, { scaleFactor: 1 })
    trayImg.setTemplateImage(true)
  } catch {
    // Absolute fallback — 16x16 black square
    trayImg = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAC0lEQVQ4y2NgAAIABQAABjwHNAAAAAAASUVORK5CYII='
    )
    trayImg.setTemplateImage(true)
  }

  tray = new Tray(trayImg)
  tray.setTitle('  🔐') // Always show something immediately
  tray.setToolTip('KaVach — कवच')
  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

function setDockIcon() {
  if (!app.dock) return
  const dockImgBuf = createAppIcon(512)
  const dockImg = nativeImage.createFromBuffer(dockImgBuf)
  app.dock.setIcon(dockImg)
}

function updateTrayMenu() {
  const pending = db.getPendingTodos()
  const todayTodos = db.getTodayTodos()
  const today = new Date().toISOString().split('T')[0]

  const todoItems = pending.slice(0, 8).map(t => ({
    label: (t.dueDate && t.dueDate <= today ? '⚠️ ' : '• ') + t.title,
    click: () => { if (mainWindow) mainWindow.show() }
  }))

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Kavach', enabled: false },
    { type: 'separator' },
    { label: `📋 ${pending.length} pending  |  📅 ${todayTodos.length} today`, enabled: false },
    { type: 'separator' },
    ...(todoItems.length ? todoItems : [{ label: '✅ All clear!', enabled: false }]),
    { type: 'separator' },
    { label: '➕ Add Todo', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.webContents.send('focus-add-todo') } } },
    {
      label: '📱 iOS Access', click: () => {
        const ip = httpInfo ? httpInfo.ip : getLocalIP()
        const port = httpInfo ? httpInfo.port : 3847
        dialog.showMessageBox({ type: 'info', title: 'iOS Access', message: 'Open in Safari on iOS:', detail: `http://${ip}:${port}\n\nMust be on same WiFi.`, buttons: ['Copy URL', 'OK'] })
          .then(r => { if (r.response === 0) require('electron').clipboard.writeText(`http://${ip}:${port}`) })
      }
    },
    { type: 'separator' },
    { label: '🔓 Open Kavach', click: () => { if (mainWindow) mainWindow.show(); else createWindow() } },
    {
      label: app.getLoginItemSettings().openAtLogin ? '✓ Launch at Login' : '  Launch at Login',
      click: () => {
        const current = app.getLoginItemSettings().openAtLogin
        app.setLoginItemSettings({ openAtLogin: !current })
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    { label: 'Quit KaVach', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
}

// ─── SCROLLING TRAY TITLE ─────────────────────────────────────────────────────

function startScrolling() {
  updateTicker() // show immediately on launch
  scrollInterval = setInterval(updateTicker, 3500)
}

function updateTicker() {
  const pending = db.getPendingTodos()
  const todayDue = db.getTodayTodos()

  if (todayDue.length > 0) {
    // Scroll titles but keep them short to fit crowded menu bars
    if (scrollIndex >= todayDue.length) scrollIndex = 0
    const todo = todayDue[scrollIndex]
    const title = todo.title.length > 22 ? todo.title.substring(0, 20) + '…' : todo.title
    tray.setTitle(`  📌 ${title}`)
    scrollIndex++
  } else if (pending.length > 0) {
    tray.setTitle(`  🔐 ${pending.length} pending`)
  } else {
    tray.setTitle('  🔐 All clear')
  }
  updateTrayMenu()
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function scheduleNotifications() {
  setInterval(() => {
    if (!db.getSettings().notificationsEnabled) return
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    if (timeStr === (db.getSettings().notificationTime || '09:00')) sendDailyDigest()
    const soon = new Date(now.getTime() + 15 * 60 * 1000)
    const soonDate = soon.toISOString().split('T')[0]
    const soonTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
    db.getPendingTodos().forEach(todo => {
      if (todo.dueDate === soonDate && todo.dueTime === soonTime)
        sendNotification(`⏰ Due in 15 min: ${todo.title}`, todo.notes || 'Click to view')
    })
  }, 60000)

  setTimeout(() => {
    const today = db.getTodayTodos()
    if (today.length > 0) sendNotification(`📅 ${today.length} todo${today.length > 1 ? 's' : ''} due today`, today.slice(0, 3).map(t => `• ${t.title}`).join('\n'))
  }, 3000)
}

function sendDailyDigest() {
  const today = db.getTodayTodos()
  const pending = db.getPendingTodos()
  if (!pending.length) return
  sendNotification(`Good morning! ${today.length} due today, ${pending.length} pending`, today.slice(0, 3).map(t => `• ${t.title}`).join('\n') || 'Click to view')
}

function sendNotification(title, body) {
  if (!Notification.isSupported()) return
  const notif = new Notification({ title, body })
  notif.on('click', () => { if (mainWindow) mainWindow.show() })
  notif.show()
}

// ─── EMAIL NOTIFICATION via Mail.app ─────────────────────────────────────────

function sendVaultOpenEmail(email) {
  if (!email) return
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' })
  const script = `
    tell application "Mail"
      set m to make new outgoing message with properties {¬
        subject:"🔐 Kavach Vault Opened", ¬
        content:"Your Kavach vault was unlocked on\\n\\n" & "${timestamp}" & "\\n\\nIf this wasn't you, change your Mac password immediately.", ¬
        visible:false}
      tell m
        make new to recipient at end of to recipients with properties {address:"${email}"}
      end tell
      send m
    end tell`
  try {
    spawnSync('osascript', ['-e', script], { stdio: 'pipe', timeout: 8000 })
  } catch { /* Mail.app might not be configured — silently ignore */ }
}

// ─── IPC: AUTH ────────────────────────────────────────────────────────────────

function finalizeLogin() {
  sessionKey = cryptoModule.getOrCreateVaultKey()
  partialAuth = false
  // Generate API token for browser extension (once, persisted)
  let settings = db.getSettings()
  if (!settings.apiToken) {
    settings = db.saveSettings({ apiToken: crypto.randomBytes(32).toString('hex') })
  }
  // Give HTTP server access to decrypted vault entries
  setVaultAccess(() => db.getVaultEntries().map(e => ({
    ...e,
    password: cryptoModule.decryptPassword(e.encryptedPassword, e.iv, e.authTag, sessionKey),
    encryptedPassword: undefined, iv: undefined, authTag: undefined
  })), settings.apiToken)
  updateTrayMenu()
  if (settings.notifyEmail) sendVaultOpenEmail(settings.notifyEmail)
}

// Step 1: Mac password
ipcMain.handle('auth:login', (_, password) => {
  const valid = cryptoModule.verifyMacPassword(password)
  if (!valid) return { ok: false, error: 'Incorrect Mac password' }
  const appTotpSecret = totpModule.getAppTotpSecret()
  if (appTotpSecret) {
    partialAuth = true
    return { ok: true, needsTotp: true }
  }
  finalizeLogin()
  return { ok: true, needsTotp: false }
})

ipcMain.handle('auth:setup', (_, password) => doLogin(password))

// Step 1 alt: Touch ID
ipcMain.handle('auth:touchid', async () => {
  if (!systemPreferences.canPromptTouchID()) return { ok: false, error: 'Touch ID not available' }
  try {
    await systemPreferences.promptTouchID('unlock Kavach')
    const appTotpSecret = totpModule.getAppTotpSecret()
    if (appTotpSecret) {
      partialAuth = true
      return { ok: true, needsTotp: true }
    }
    finalizeLogin()
    return { ok: true, needsTotp: false }
  } catch {
    return { ok: false, error: 'Touch ID failed or cancelled' }
  }
})

// Step 2: TOTP code
ipcMain.handle('auth:verifyTotp', (_, code) => {
  if (!partialAuth) return { ok: false, error: 'Not in TOTP step' }
  const secret = totpModule.getAppTotpSecret()
  if (!secret) { finalizeLogin(); return { ok: true } }
  if (totpModule.verifyTOTP(secret, code)) {
    finalizeLogin()
    return { ok: true }
  }
  return { ok: false, error: 'Invalid code' }
})

ipcMain.handle('auth:logout', () => {
  sessionKey = null; partialAuth = false
  clearVaultAccess()
  return { ok: true }
})
ipcMain.handle('auth:getApiToken', () => db.getSettings().apiToken || null)
ipcMain.handle('auth:status', () => ({ loggedIn: sessionKey !== null }))

ipcMain.handle('auth:touchIdAvailable', () => systemPreferences.canPromptTouchID())

// App TOTP setup (for Settings)
ipcMain.handle('auth:setupAppTotp', () => {
  const secret = totpModule.generateSecret()
  totpModule.storeAppTotpSecret(secret)
  return { secret, uri: totpModule.getTotpUri(secret) }
})
ipcMain.handle('auth:disableAppTotp', () => { totpModule.deleteAppTotpSecret(); return { ok: true } })
ipcMain.handle('auth:hasAppTotp', () => !!totpModule.getAppTotpSecret())

// ─── IPC: TODOS ───────────────────────────────────────────────────────────────

ipcMain.handle('todos:getAll', () => db.getTodos())
ipcMain.handle('todos:add', (_, todo) => { const r = db.addTodo(todo); updateTrayMenu(); return r })
ipcMain.handle('todos:update', (_, { id, updates }) => { const r = db.updateTodo(id, updates); updateTrayMenu(); return r })
ipcMain.handle('todos:delete', (_, id) => { db.deleteTodo(id); updateTrayMenu(); return { ok: true } })
ipcMain.handle('todos:getToday', () => db.getTodayTodos())

// ─── IPC: VAULT ───────────────────────────────────────────────────────────────

ipcMain.handle('vault:getAll', () => {
  if (!sessionKey) return { error: 'Not authenticated' }
  return db.getVaultEntries().map(e => ({
    ...e,
    password: cryptoModule.decryptPassword(e.encryptedPassword, e.iv, e.authTag, sessionKey),
    encryptedPassword: undefined, iv: undefined, authTag: undefined
  }))
})
ipcMain.handle('vault:add', (_, entry) => {
  if (!sessionKey) return { error: 'Not authenticated' }
  const { encrypted, iv, authTag } = cryptoModule.encryptPassword(entry.password, sessionKey)
  return db.addVaultEntry({ ...entry, encryptedPassword: encrypted, iv, authTag })
})
ipcMain.handle('vault:update', (_, { id, entry }) => {
  if (!sessionKey) return { error: 'Not authenticated' }
  const updates = { ...entry }
  if (entry.password) {
    const { encrypted, iv, authTag } = cryptoModule.encryptPassword(entry.password, sessionKey)
    Object.assign(updates, { encryptedPassword: encrypted, iv, authTag })
    delete updates.password
  }
  return db.updateVaultEntry(id, updates)
})
ipcMain.handle('vault:delete', (_, id) => { db.deleteVaultEntry(id); return { ok: true } })

ipcMain.handle('vault:import', (_, entries) => {
  if (!sessionKey) return { error: 'Not authenticated' }
  let imported = 0, skipped = 0
  const existing = db.getVaultEntries()
  for (const entry of entries) {
    if (!entry.password) { skipped++; continue }
    // Skip exact duplicates (same title + username)
    const dup = existing.find(e => e.title === entry.title && e.username === entry.username)
    if (dup) { skipped++; continue }
    const { encrypted, iv, authTag } = cryptoModule.encryptPassword(entry.password, sessionKey)
    db.addVaultEntry({ ...entry, encryptedPassword: encrypted, iv, authTag })
    imported++
  }
  return { ok: true, imported, skipped }
})

// ─── IPC: JOURNAL ─────────────────────────────────────────────────────────────

ipcMain.handle('journal:getAll', () => db.getJournalEntries())
ipcMain.handle('journal:get', (_, date) => db.getJournalEntry(date))
ipcMain.handle('journal:save', (_, { date, content, mood }) => db.saveJournalEntry(date, content, mood))
ipcMain.handle('journal:delete', (_, date) => { db.deleteJournalEntry(date); return { ok: true } })

// ─── IPC: TOTP AUTHENTICATOR ──────────────────────────────────────────────────

ipcMain.handle('totp:getAll', () => {
  if (!sessionKey) return { error: 'Not authenticated' }
  return db.getTotpAccounts().map(a => ({
    ...a,
    secret: cryptoModule.decryptPassword(a.encryptedSecret, a.iv, a.authTag, sessionKey),
    encryptedSecret: undefined, iv: undefined, authTag: undefined
  }))
})
ipcMain.handle('totp:add', (_, account) => {
  if (!sessionKey) return { error: 'Not authenticated' }
  const { encrypted, iv, authTag } = cryptoModule.encryptPassword(account.secret, sessionKey)
  return db.addTotpAccount({ ...account, encryptedSecret: encrypted, iv, authTag })
})
ipcMain.handle('totp:delete', (_, id) => { db.deleteTotpAccount(id); return { ok: true } })
ipcMain.handle('totp:generate', (_, { secret, digits, period }) => {
  try { return { code: totpModule.generateTOTP(secret, digits || 6, period || 30), remaining: totpModule.secondsRemaining(period || 30) }
  } catch { return { error: 'Invalid secret' } }
})

// ─── IPC: SETTINGS & UTILS ───────────────────────────────────────────────────

ipcMain.handle('settings:get', () => db.getSettings())
ipcMain.handle('settings:save', (_, updates) => { db.saveSettings(updates); return { ok: true } })
ipcMain.handle('util:generatePassword', (_, opts) => cryptoModule.generatePassword(opts?.length || 20, opts))
ipcMain.handle('util:getHttpInfo', () => ({ ip: httpInfo ? httpInfo.ip : getLocalIP(), port: httpInfo ? httpInfo.port : 3847 }))
ipcMain.handle('util:sendNotification', (_, { title, body }) => { sendNotification(title, body); return { ok: true } })

