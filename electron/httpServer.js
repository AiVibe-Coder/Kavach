const express = require('express')
const cors = require('cors')
const path = require('path')
const os = require('os')
const fs = require('fs')

let serverInstance = null
let _apiToken = null
let _getVaultEntries = null   // set after login, cleared on logout

function setVaultAccess(getEntries, apiToken) {
  _getVaultEntries = getEntries
  _apiToken = apiToken
}

function clearVaultAccess() {
  _getVaultEntries = null
}

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

function startHttpServer(db, cryptoModule, getSessionKey, port = 3847) {
  if (serverInstance) return { port, ip: getLocalIP() }

  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/', (req, res) => res.send(getMobileHTML()))

  // Serve jsQR locally — avoids CDN dependency on local network
  app.get('/jsqr.js', (req, res) => {
    const jsqrPath = path.join(__dirname, '../node_modules/jsqr/dist/jsQR.js')
    if (fs.existsSync(jsqrPath)) {
      res.setHeader('Content-Type', 'application/javascript')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.sendFile(jsqrPath)
    } else {
      res.status(404).send('not found')
    }
  })

  // ── API Routes ──────────────────────────────────────────────────────────────

  app.get('/api/todos', (req, res) => {
    res.json(db.getTodos())
  })

  app.post('/api/todos', (req, res) => {
    const todo = db.addTodo(req.body)
    res.json(todo)
  })

  app.put('/api/todos/:id', (req, res) => {
    const todo = db.updateTodo(req.params.id, req.body)
    res.json(todo)
  })

  app.delete('/api/todos/:id', (req, res) => {
    db.deleteTodo(req.params.id)
    res.json({ ok: true })
  })

  // Vault requires session PIN (separate from master password, for mobile)
  app.post('/api/vault/unlock', (req, res) => {
    const key = getSessionKey()
    if (!key) return res.status(401).json({ error: 'App locked' })
    const entries = db.getVaultEntries().map(e => {
      const pwd = cryptoModule.decryptPassword(e.encryptedPassword, e.iv, e.authTag, key)
      return { ...e, encryptedPassword: undefined, iv: undefined, authTag: undefined, password: pwd }
    })
    res.json(entries)
  })

  // ── Settings API ────────────────────────────────────────────────────────────
  app.get('/api/settings', (req, res) => {
    const s = db.getSettings()
    res.json({
      touchIdEnabled: s.touchIdEnabled || false,
      notificationsEnabled: s.notificationsEnabled,
      notificationTime: s.notificationTime || '09:00',
      notifyEmail: s.notifyEmail || '',
      nasPath: s.nasPath || '',
      httpPort: s.httpPort || 3847,
      apiToken: _apiToken || null
    })
  })

  app.put('/api/settings', (req, res) => {
    db.saveSettings(req.body)
    res.json({ ok: true })
  })

  // ── Journal API ─────────────────────────────────────────────────────────────
  app.get('/api/journal', (req, res) => {
    res.json(db.getJournalEntries())
  })

  app.get('/api/journal/:date', (req, res) => {
    const entry = db.getJournalEntry(req.params.date)
    res.json(entry || null)
  })

  app.post('/api/journal', (req, res) => {
    const entry = db.saveJournalEntry(req.body)
    res.json(entry)
  })

  // ── TOTP API ────────────────────────────────────────────────────────────────
  app.get('/api/totp', (req, res) => {
    const key = getSessionKey()
    if (!key) return res.status(401).json({ error: 'App locked' })
    const accounts = db.getTotpAccounts().map(a => {
      try {
        const secret = cryptoModule.decryptPassword(a.encryptedSecret, a.iv, a.authTag, key)
        return { id: a.id, name: a.name, issuer: a.issuer, secret }
      } catch { return null }
    }).filter(Boolean)
    res.json(accounts)
  })

  app.post('/api/totp', (req, res) => {
    const key = getSessionKey()
    if (!key) return res.status(401).json({ error: 'App locked' })
    const { name, issuer, secret } = req.body
    if (!name || !secret) return res.status(400).json({ error: 'name and secret required' })
    const { encrypted, iv, authTag } = cryptoModule.encryptPassword(secret.toUpperCase().replace(/\s/g,''), key)
    const account = db.addTotpAccount({ name, issuer: issuer || '', encryptedSecret: encrypted, iv, authTag })
    res.json(account)
  })

  app.delete('/api/totp/:id', (req, res) => {
    db.deleteTotpAccount(req.params.id)
    res.json({ ok: true })
  })

  // ── Extension API (localhost only, Bearer token required) ───────────────────

  function extAuth(req, res, next) {
    if (!_apiToken) return res.status(503).json({ error: 'KaVach locked' })
    const auth = req.headers['authorization'] || ''
    if (auth !== `Bearer ${_apiToken}`) return res.status(401).json({ error: 'Invalid token' })
    next()
  }

  // Ping — lets extension check if KaVach is running + unlocked
  app.get('/api/ext/ping', extAuth, (req, res) => {
    res.json({ ok: true, unlocked: !!_getVaultEntries })
  })

  // Search vault by domain
  app.get('/api/ext/search', extAuth, (req, res) => {
    if (!_getVaultEntries) return res.status(503).json({ error: 'KaVach locked' })
    const domain = (req.query.domain || '').toLowerCase()
    const all = _getVaultEntries()
    const matches = all.filter(e => {
      if (!domain) return true
      const url = (e.url || '').toLowerCase()
      const title = (e.title || '').toLowerCase()
      // Match if domain appears in URL or title
      return url.includes(domain) || title.includes(domain) ||
        domain.includes(title.replace(/\s+/g, '').toLowerCase())
    })
    res.json(matches.map(e => ({
      id: e.id, title: e.title, username: e.username,
      password: e.password, url: e.url, category: e.category
    })))
  })

  serverInstance = app.listen(port, '0.0.0.0')
  console.log(`[HTTP] Mobile server on http://${getLocalIP()}:${port}`)
  return { port, ip: getLocalIP() }
}

function stopHttpServer() {
  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
  }
}

function getMobileHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<title>KaVach</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--bg:#0f0f13;--surface:#1a1a24;--card:#22223a;--accent:#7c6af7;--accent2:#4ecdc4;--text:#f0f0f7;--muted:#888;--red:#f44336;--orange:#ff9800;--green:#4caf50}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;min-height:100vh;overflow-x:hidden}

/* ── Topbar ── */
.topbar{position:fixed;top:0;left:0;right:0;z-index:200;height:calc(env(safe-area-inset-top,0px) + 56px);padding:env(safe-area-inset-top,0px) 16px 0;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;gap:12px;backdrop-filter:blur(20px)}
.hamburger{width:40px;height:40px;display:flex;flex-direction:column;justify-content:center;gap:5px;cursor:pointer;flex-shrink:0;padding:4px}
.hamburger span{display:block;height:2px;background:var(--text);border-radius:2px;transition:all .3s}
.topbar-title{font-size:20px;font-weight:700}
.topbar-title .ka{color:var(--text)}.topbar-title .v{color:var(--accent)}
.topbar-sub{font-size:12px;color:var(--muted);margin-left:auto;padding-right:4px}

/* ── Drawer ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0);z-index:300;pointer-events:none;transition:background .3s}
.overlay.open{background:rgba(0,0,0,.6);pointer-events:all}
.drawer{position:fixed;top:0;left:0;bottom:0;width:72vw;max-width:280px;z-index:400;background:var(--surface);transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
.drawer.open{transform:translateX(0)}
.drawer-header{padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
.drawer-logo{font-size:22px;font-weight:800}.drawer-logo .ka{color:var(--text)}.drawer-logo .v{color:var(--accent)}
.drawer-sub{font-size:11px;color:var(--muted);margin-top:2px}
.drawer-label{font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.8px;text-transform:uppercase;padding:16px 20px 6px}
.nav-item{display:flex;align-items:center;gap:14px;padding:13px 20px;cursor:pointer;transition:background .15s;font-size:15px;font-weight:500;color:rgba(240,240,247,.7)}
.nav-item:hover,.nav-item.active{background:rgba(124,106,247,.12);color:var(--text)}
.nav-item.active{border-left:3px solid var(--accent)}
.nav-item .icon{font-size:18px;width:22px;text-align:center}
.drawer-footer{margin-top:auto;border-top:1px solid rgba(255,255,255,.06);padding:8px 0 calc(env(safe-area-inset-bottom,0px) + 8px)}

/* ── Main content ── */
.main{padding-top:calc(env(safe-area-inset-top,0px) + 56px);padding-bottom:calc(env(safe-area-inset-bottom,0px) + 80px);min-height:100vh}
.content{padding:16px;max-width:480px;margin:0 auto}

/* ── Common ── */
.section-title{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px}
.card{background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,255,255,.06)}
.empty{text-align:center;padding:40px 20px;color:var(--muted)}
.empty .emoji{font-size:48px;display:block;margin-bottom:12px}
.pill{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600}
.p-high{background:rgba(244,67,54,.15);color:var(--red)}
.p-medium{background:rgba(255,152,0,.15);color:var(--orange)}
.p-low{background:rgba(76,175,80,.15);color:var(--green)}
.btn{flex:1;padding:14px;border-radius:14px;border:none;font-size:15px;font-weight:600;cursor:pointer}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.btn-cancel{background:var(--card);color:var(--muted)}
.btn-row{display:flex;gap:10px;margin-top:4px}
input,select,textarea{width:100%;background:var(--card);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;color:var(--text);font-size:15px;outline:none;margin-bottom:12px;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
select option{background:var(--card)}

/* ── Dashboard ── */
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.stat-card{background:var(--card);border-radius:14px;padding:14px;text-align:center}
.stat-num{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:12px;color:var(--muted);margin-top:2px}

/* ── Todos ── */
.todo-item{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--card);border-radius:14px;margin-bottom:8px;border:1px solid rgba(255,255,255,.06)}
.todo-item.done{opacity:.5}
.check{width:24px;height:24px;border-radius:50%;border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .2s}
.check.checked{background:var(--accent);border-color:var(--accent)}
.check.checked::after{content:'✓';color:#fff;font-size:13px;font-weight:700}
.todo-text{flex:1}
.todo-title{font-size:15px;font-weight:500}
.todo-due{font-size:12px;color:var(--muted);margin-top:2px}
.todo-due.overdue{color:var(--red)}

/* ── Vault ── */
.vault-item{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--card);border-radius:14px;margin-bottom:8px}
.vault-icon{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.vault-info{flex:1;min-width:0}
.vault-title{font-size:15px;font-weight:600}
.vault-user{font-size:12px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vault-copy{padding:8px 14px;background:var(--accent);border-radius:8px;border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer}

/* ── Journal ── */
.journal-entry{background:var(--card);border-radius:14px;padding:16px;margin-bottom:10px;border:1px solid rgba(255,255,255,.06)}
.journal-date{font-size:12px;color:var(--muted);margin-bottom:6px}
.journal-body{font-size:14px;line-height:1.6;color:rgba(240,240,247,.8);white-space:pre-wrap;word-break:break-word}
.mood-row{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.mood-btn{padding:8px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:var(--card);color:var(--text);font-size:14px;cursor:pointer;transition:all .2s}
.mood-btn.selected{background:var(--accent);border-color:var(--accent)}

/* ── Authenticator ── */
.totp-item{background:var(--card);border-radius:14px;padding:16px;margin-bottom:10px;display:flex;align-items:center;gap:14px}
.totp-info{flex:1}
.totp-name{font-size:15px;font-weight:600}
.totp-issuer{font-size:12px;color:var(--muted);margin-top:2px}
.totp-code{font-size:26px;font-weight:700;letter-spacing:4px;color:var(--accent2);font-variant-numeric:tabular-nums}
.totp-timer{width:32px;height:32px;flex-shrink:0}
.totp-timer circle{fill:none;stroke:rgba(255,255,255,.1);stroke-width:3}
.totp-timer .prog{stroke:var(--accent2);stroke-width:3;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset .9s linear}

/* ── FAB ── */
.fab{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);right:20px;width:56px;height:56px;border-radius:28px;background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff;font-size:28px;cursor:pointer;box-shadow:0 8px 32px rgba(124,106,247,.5);display:flex;align-items:center;justify-content:center;z-index:100}

/* ── Modals ── */
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:500;align-items:flex-end;backdrop-filter:blur(8px)}
.modal.open{display:flex}
.modal-body{background:var(--surface);border-radius:24px 24px 0 0;padding:24px;width:100%;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 24px)}
.modal-body h2{font-size:20px;font-weight:700;margin-bottom:20px}

/* ── QR Scanner ── */
.qr-wrap{position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:4/3}
.qr-wrap video{width:100%;display:block}
.qr-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.qr-box{width:180px;height:180px;border:2px solid var(--accent2);border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.5)}
.qr-hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:13px;color:rgba(255,255,255,.8)}

/* ── Settings toggles ── */
.setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.setting-label{font-size:15px;font-weight:500}
.setting-sub{font-size:12px;color:var(--muted);margin-top:2px}
.toggle{position:relative;display:inline-block;width:44px;height:26px;flex-shrink:0}
.toggle input{display:none}
.toggle .knob{position:absolute;inset:0;background:var(--card);border-radius:26px;border:1px solid rgba(255,255,255,.12);cursor:pointer;transition:.2s}
.toggle .knob::after{content:'';position:absolute;width:20px;height:20px;background:#fff;border-radius:50%;top:2px;left:2px;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.toggle input:checked + .knob{background:var(--accent);border-color:var(--accent)}
.toggle input:checked + .knob::after{left:20px}

/* ── Toast ── */
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;opacity:0;transition:opacity .3s;z-index:600;white-space:nowrap}
.toast.show{opacity:1}
</style>
</head>
<body>

<!-- Topbar -->
<div class="topbar">
  <div class="hamburger" onclick="toggleDrawer()" id="hamburger">
    <span id="h1"></span><span id="h2"></span><span id="h3"></span>
  </div>
  <div class="topbar-title"><span class="ka">Ka</span><span class="v">V</span><span class="ka">ach</span></div>
  <div class="topbar-sub" id="dateStr"></div>
</div>

<!-- Drawer overlay -->
<div class="overlay" id="overlay" onclick="closeDrawer()"></div>

<!-- Drawer -->
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <div class="drawer-logo"><span class="ka">Ka</span><span class="v">V</span><span class="ka">ach</span></div>
    <div class="drawer-sub">कवच · Personal Security Vault</div>
  </div>
  <div class="drawer-label">Menu</div>
  <div class="nav-item active" id="nav-dashboard" onclick="showTab('dashboard')"><span class="icon">◆</span> Dashboard</div>
  <div class="nav-item" id="nav-todos" onclick="showTab('todos')"><span class="icon">✓</span> Todos</div>
  <div class="nav-item" id="nav-vault" onclick="showTab('vault')"><span class="icon">⊞</span> Vault</div>
  <div class="nav-item" id="nav-journal" onclick="showTab('journal')"><span class="icon">📔</span> Journal</div>
  <div class="nav-item" id="nav-authenticator" onclick="showTab('authenticator')"><span class="icon">🔑</span> Authenticator</div>
  <div class="nav-item" id="nav-settings" onclick="showTab('settings')"><span class="icon">⚙️</span> Settings</div>
  <div class="drawer-footer">
    <div class="nav-item" style="color:var(--red)" onclick="showToast('Lock KaVach on your Mac')"><span class="icon">⊗</span> Lock App</div>
  </div>
</div>

<!-- Main -->
<div class="main">
  <div class="content">

    <!-- DASHBOARD -->
    <div id="tab-dashboard">
      <div class="stats">
        <div class="stat-card"><div class="stat-num" id="stat-pending">0</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-num" id="stat-today">0</div><div class="stat-label">Due Today</div></div>
        <div class="stat-card"><div class="stat-num" id="stat-overdue">0</div><div class="stat-label">Overdue</div></div>
        <div class="stat-card"><div class="stat-num" id="stat-passwords">0</div><div class="stat-label">Passwords</div></div>
      </div>
      <div class="section-title">Due Today</div>
      <div id="dash-today"></div>
    </div>

    <!-- TODOS -->
    <div id="tab-todos" style="display:none">
      <div id="todos-list"></div>
    </div>

    <!-- VAULT -->
    <div id="tab-vault" style="display:none">
      <div class="card" style="text-align:center;padding:20px" id="vault-unlock-card">
        <div style="font-size:36px;margin-bottom:8px">🔐</div>
        <div style="font-weight:600;margin-bottom:4px">Password Vault</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:16px">KaVach must be unlocked on Mac first</div>
        <button class="btn btn-primary" style="max-width:200px;margin:0 auto;display:block" onclick="loadVault()">Load Passwords</button>
      </div>
      <div id="vault-list"></div>
    </div>

    <!-- JOURNAL -->
    <div id="tab-journal" style="display:none">
      <button class="btn btn-primary" style="margin-bottom:16px" onclick="openJournalModal()">+ New Entry</button>
      <div id="journal-list"></div>
    </div>

    <!-- AUTHENTICATOR -->
    <div id="tab-authenticator" style="display:none">
      <button class="btn btn-primary" style="margin-bottom:16px;width:100%" onclick="openTotpModal()">+ Add Account</button>
      <div id="totp-list"></div>
    </div>

    <!-- SETTINGS -->
    <div id="tab-settings" style="display:none">
      <div id="settings-body"></div>
    </div>

  </div>
</div>

<!-- FAB (todos only) -->
<button class="fab" onclick="openAddModal()" id="fab" style="display:none">+</button>

<!-- ADD TODO MODAL -->
<div class="modal" id="add-modal">
  <div class="modal-body">
    <h2>New Todo</h2>
    <input type="text" id="todo-title" placeholder="What needs to be done?"/>
    <input type="text" id="todo-notes" placeholder="Notes (optional)"/>
    <input type="date" id="todo-date"/>
    <input type="time" id="todo-time"/>
    <select id="todo-priority">
      <option value="high">High Priority</option>
      <option value="medium" selected>Medium Priority</option>
      <option value="low">Low Priority</option>
    </select>
    <div class="btn-row">
      <button class="btn btn-cancel" onclick="closeModal('add-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveTodo()">Save</button>
    </div>
  </div>
</div>

<!-- JOURNAL MODAL -->
<div class="modal" id="journal-modal">
  <div class="modal-body">
    <h2>Journal Entry</h2>
    <input type="date" id="journal-date"/>
    <div class="mood-row" id="mood-row">
      <button class="mood-btn" data-mood="😊" onclick="selectMood(this)">😊</button>
      <button class="mood-btn" data-mood="😐" onclick="selectMood(this)">😐</button>
      <button class="mood-btn" data-mood="😔" onclick="selectMood(this)">😔</button>
      <button class="mood-btn" data-mood="😤" onclick="selectMood(this)">😤</button>
      <button class="mood-btn" data-mood="🤩" onclick="selectMood(this)">🤩</button>
    </div>
    <textarea id="journal-body" placeholder="Write your thoughts..." rows="5" style="resize:none"></textarea>
    <div class="btn-row">
      <button class="btn btn-cancel" onclick="closeModal('journal-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveJournal()">Save</button>
    </div>
  </div>
</div>

<!-- ADD TOTP MODAL -->
<div class="modal" id="totp-modal">
  <div class="modal-body">
    <h2>Add 2FA Account</h2>
    <canvas id="qr-canvas" style="display:none"></canvas>
    <input type="file" id="qr-file-input" accept="image/*" capture="environment" style="display:none" onchange="handleQRFile(this)"/>
    <button class="btn btn-primary" id="qr-btn" style="width:100%;margin-bottom:14px" onclick="startQR()">📷 Scan QR Code</button>
    <input type="text" id="totp-name" placeholder="Account name (e.g. john@gmail.com)"/>
    <input type="text" id="totp-issuer" placeholder="Service (e.g. Google, GitHub)"/>
    <input type="text" id="totp-secret" placeholder="Secret key (Base32)" style="font-family:monospace"/>
    <div id="totp-err" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none"></div>
    <div class="btn-row">
      <button class="btn btn-cancel" onclick="closeTotpModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTotp()">Add</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let todos = [], totpAccounts = [], totpInterval = null
const today = new Date().toISOString().split('T')[0]
document.getElementById('dateStr').textContent = new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
document.getElementById('todo-date').value = today
document.getElementById('journal-date').value = today

// ── Drawer ──────────────────────────────────────────────────────────────────
function toggleDrawer() {
  const open = document.getElementById('drawer').classList.toggle('open')
  document.getElementById('overlay').classList.toggle('open', open)
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open')
  document.getElementById('overlay').classList.remove('open')
}

// ── Tab switching ─────────────────────────────────────────────────────────────
const TABS = ['dashboard','todos','vault','journal','authenticator','settings']
function showTab(tab) {
  TABS.forEach(t => document.getElementById('tab-' + t).style.display = t === tab ? '' : 'none')
  TABS.forEach(t => document.getElementById('nav-' + t).classList.toggle('active', t === tab))
  document.getElementById('fab').style.display = tab === 'todos' ? 'flex' : 'none'
  closeDrawer()
  if (tab === 'authenticator') startTOTP()
  else stopTOTP()
  if (tab === 'settings') loadSettings()
}

// ── Todos ────────────────────────────────────────────────────────────────────
async function loadTodos() {
  try {
    const res = await fetch('/api/todos')
    todos = await res.json()
    renderTodos(); renderDash()
  } catch(e) { console.error(e) }
}

function todoHTML(t) {
  const isOverdue = t.dueDate && t.dueDate < today && !t.completed
  return \`<div class="todo-item \${t.completed ? 'done' : ''}">
    <div class="check \${t.completed ? 'checked' : ''}" onclick="toggleTodo('\${t.id}')"></div>
    <div class="todo-text">
      <div class="todo-title">\${t.title}</div>
      \${t.dueDate ? \`<div class="todo-due\${isOverdue ? ' overdue' : ''}">\${isOverdue ? '⚠️ ' : '📅 '}\${t.dueDate}\${t.dueTime ? ' ' + t.dueTime : ''}</div>\` : ''}
    </div>
    <span class="pill p-\${t.priority || 'medium'}">\${t.priority || 'medium'}</span>
  </div>\`
}

function renderTodos() {
  const el = document.getElementById('todos-list')
  const pending = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed).slice(0,5)
  if (!todos.length) { el.innerHTML = '<div class="empty"><span class="emoji">✅</span>No todos yet.<br>Tap + to add one!</div>'; return }
  let html = ''
  if (pending.length) { html += '<div class="section-title">Pending (' + pending.length + ')</div>'; pending.forEach(t => html += todoHTML(t)) }
  if (done.length) { html += '<div class="section-title">Completed</div>'; done.forEach(t => html += todoHTML(t)) }
  el.innerHTML = html
}

function renderDash() {
  const pending = todos.filter(t => !t.completed)
  const due = todos.filter(t => !t.completed && t.dueDate === today)
  const overdue = todos.filter(t => !t.completed && t.dueDate && t.dueDate < today)
  document.getElementById('stat-pending').textContent = pending.length
  document.getElementById('stat-today').textContent = due.length
  document.getElementById('stat-overdue').textContent = overdue.length
  const dashToday = document.getElementById('dash-today')
  dashToday.innerHTML = due.length ? due.map(t => todoHTML(t)).join('') : '<div class="empty" style="padding:20px"><span class="emoji">🎉</span>All clear for today!</div>'
}

async function toggleTodo(id) {
  const t = todos.find(x => x.id === id)
  if (!t) return
  await fetch('/api/todos/' + id, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:!t.completed})})
  await loadTodos()
}

function openAddModal() {
  document.getElementById('add-modal').classList.add('open')
  setTimeout(() => document.getElementById('todo-title').focus(), 300)
}

async function saveTodo() {
  const title = document.getElementById('todo-title').value.trim()
  if (!title) return
  await fetch('/api/todos', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    title, notes: document.getElementById('todo-notes').value,
    dueDate: document.getElementById('todo-date').value || null,
    dueTime: document.getElementById('todo-time').value || null,
    priority: document.getElementById('todo-priority').value
  })})
  closeModal('add-modal')
  showToast('Todo added!')
  await loadTodos()
}

// ── Vault ────────────────────────────────────────────────────────────────────
async function loadVault() {
  try {
    const res = await fetch('/api/vault/unlock', {method:'POST'})
    if (!res.ok) { showToast('Unlock KaVach on Mac first'); return }
    const entries = await res.json()
    document.getElementById('vault-unlock-card').style.display = 'none'
    document.getElementById('stat-passwords').textContent = entries.length
    const icons = {social:'🌐',banking:'🏦',email:'✉️',work:'💼',shopping:'🛍️',general:'🔑'}
    document.getElementById('vault-list').innerHTML = entries.length
      ? entries.map(e => \`<div class="vault-item">
          <div class="vault-icon">\${icons[e.category]||'🔑'}</div>
          <div class="vault-info"><div class="vault-title">\${e.title}</div><div class="vault-user">\${e.username||e.url||''}</div></div>
          <button class="vault-copy" onclick="copyPwd('\${(e.password||'').replace(/'/g,'\\\\'+'\\'')}')">Copy</button>
        </div>\`).join('')
      : '<div class="empty"><span class="emoji">🔑</span>No passwords saved yet.</div>'
  } catch { showToast('Could not connect') }
}

function copyPwd(pwd) {
  navigator.clipboard.writeText(pwd).then(() => showToast('Copied!')).catch(() => showToast('Could not copy'))
}

// ── Journal ──────────────────────────────────────────────────────────────────
async function loadJournal() {
  try {
    const res = await fetch('/api/journal')
    const entries = await res.json()
    const el = document.getElementById('journal-list')
    if (!entries.length) { el.innerHTML = '<div class="empty"><span class="emoji">📔</span>No entries yet.</div>'; return }
    el.innerHTML = entries.sort((a,b) => b.date.localeCompare(a.date)).map(e => \`
      <div class="journal-entry">
        <div class="journal-date">\${e.date}\${e.mood ? '  ' + e.mood : ''}</div>
        <div class="journal-body">\${e.content || e.body || ''}</div>
      </div>\`).join('')
  } catch(e) { console.error(e) }
}

let selectedMood = ''
function selectMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'))
  btn.classList.add('selected')
  selectedMood = btn.dataset.mood
}

function openJournalModal() {
  selectedMood = ''
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'))
  document.getElementById('journal-body').value = ''
  document.getElementById('journal-date').value = today
  document.getElementById('journal-modal').classList.add('open')
}

async function saveJournal() {
  const body = document.getElementById('journal-body').value.trim()
  if (!body) return
  await fetch('/api/journal', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    date: document.getElementById('journal-date').value,
    content: body, mood: selectedMood
  })})
  closeModal('journal-modal')
  showToast('Entry saved!')
  loadJournal()
}

// ── Authenticator ─────────────────────────────────────────────────────────────
function totp(secret, ts) {
  // RFC 6238 TOTP using SubtleCrypto
  const base32 = secret.toUpperCase().replace(/=+$/,'')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = '', bytes = []
  for (const c of base32) { const i = chars.indexOf(c); if (i>=0) bits += i.toString(2).padStart(5,'0') }
  for (let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2))
  const key = new Uint8Array(bytes)
  const counter = Math.floor((ts||Date.now()/1000)/30)
  const msg = new Uint8Array(8)
  let c = counter
  for (let i=7;i>=0;i--) { msg[i] = c & 0xff; c >>= 8 }
  return crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-1'},false,['sign'])
    .then(k => crypto.subtle.sign('HMAC',k,msg))
    .then(sig => {
      const h = new Uint8Array(sig)
      const o = h[19] & 0xf
      const code = ((h[o]&0x7f)<<24|(h[o+1]&0xff)<<16|(h[o+2]&0xff)<<8|(h[o+3]&0xff)) % 1000000
      return code.toString().padStart(6,'0')
    })
}

async function startTOTP() {
  stopTOTP()
  try {
    const res = await fetch('/api/totp')
    if (!res.ok) { document.getElementById('totp-list').innerHTML = '<div class="empty"><span class="emoji">🔒</span>Unlock KaVach on Mac first.</div>'; return }
    totpAccounts = await res.json()
    if (!totpAccounts.length) { document.getElementById('totp-list').innerHTML = '<div class="empty"><span class="emoji">🔑</span>No 2FA accounts yet.</div>'; return }
    await renderTOTP()
    totpInterval = setInterval(renderTOTP, 1000)
  } catch(e) { document.getElementById('totp-list').innerHTML = '<div class="empty"><span class="emoji">⚠️</span>Could not load accounts.</div>' }
}

async function renderTOTP() {
  const now = Date.now() / 1000
  const remaining = 30 - (Math.floor(now) % 30)
  const circumference = 2 * Math.PI * 13
  const offset = circumference * (1 - remaining / 30)
  const codes = await Promise.all(totpAccounts.map(a => totp(a.secret)))
  document.getElementById('totp-list').innerHTML = totpAccounts.map((a,i) => \`
    <div class="totp-item">
      <div class="totp-info">
        <div class="totp-name">\${a.name}</div>
        \${a.issuer ? \`<div class="totp-issuer">\${a.issuer}</div>\` : ''}
        <div class="totp-code" onclick="copyPwd('\${codes[i]}')">\${codes[i].slice(0,3)} \${codes[i].slice(3)}</div>
      </div>
      <svg class="totp-timer" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13"/>
        <circle class="prog" cx="16" cy="16" r="13" stroke-dasharray="\${circumference}" stroke-dashoffset="\${offset}"/>
      </svg>
    </div>\`).join('')
}

function stopTOTP() {
  if (totpInterval) { clearInterval(totpInterval); totpInterval = null }
}

// ── Modals & Toast ────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open')
}

document.getElementById('add-modal').addEventListener('click', function(e) { if(e.target===this) closeModal('add-modal') })
document.getElementById('journal-modal').addEventListener('click', function(e) { if(e.target===this) closeModal('journal-modal') })

function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2500)
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/settings')
    const s = await res.json()
    document.getElementById('settings-body').innerHTML = \`
      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px">🔐 Security</div>
        <div class="setting-row">
          <div><div class="setting-label">Touch ID</div><div class="setting-sub">Fingerprint unlock</div></div>
          <label class="toggle"><input type="checkbox" \${s.touchIdEnabled?'checked':''} onchange="saveSetting('touchIdEnabled',this.checked)"><span class="knob"></span></label>
        </div>
        <div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:10px;font-size:12px;color:var(--muted);line-height:1.7">
          ✓ AES-256-GCM encrypted &nbsp;·&nbsp; ✓ Key in Keychain &nbsp;·&nbsp; ✓ Never uploaded
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px">📧 Security Alert Email</div>
        <div class="setting-label" style="margin-bottom:6px">Alert email when vault opens</div>
        <input type="email" placeholder="you@icloud.com" value="\${s.notifyEmail}" onblur="saveSetting('notifyEmail',this.value)" style="margin-bottom:4px"/>
        <div style="font-size:11px;color:var(--muted)">Sent via Mail.app — requires Mail.app configured on your Mac.</div>
      </div>

      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px">🔔 Notifications</div>
        <div class="setting-row" style="margin-bottom:14px">
          <div><div class="setting-label">Enable reminders</div><div class="setting-sub">Due date & daily digest</div></div>
          <label class="toggle"><input type="checkbox" \${s.notificationsEnabled?'checked':''} onchange="saveSetting('notificationsEnabled',this.checked)"><span class="knob"></span></label>
        </div>
        <div class="setting-label" style="margin-bottom:6px">Daily digest time</div>
        <input type="time" value="\${s.notificationTime}" onchange="saveSetting('notificationTime',this.value)" style="margin-bottom:0;width:140px"/>
      </div>

      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px">🧩 Browser Extension</div>
        \${s.apiToken ? \`
          <div class="setting-label" style="margin-bottom:6px">API Token</div>
          <div style="display:flex;gap:8px;align-items:center;background:var(--bg);border-radius:10px;padding:10px 12px;margin-bottom:10px">
            <div style="font-family:monospace;font-size:11px;color:var(--accent);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${s.apiToken}</div>
            <button class="vault-copy" onclick="copyPwd('\${s.apiToken}')">Copy</button>
          </div>
          <div style="font-size:12px;color:var(--muted);line-height:1.8">Paste into the KaVach extension → Settings in Chrome / Firefox / Edge / Brave.</div>
        \` : '<div style="font-size:13px;color:var(--muted)">Unlock KaVach on Mac to see your token.</div>'}
      </div>

      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px">💾 Storage</div>
        <div style="background:var(--bg);border-radius:10px;padding:12px;margin-bottom:12px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Data location</div>
          <div style="font-family:monospace;font-size:12px;color:var(--text)">~/.kavach/</div>
        </div>
        <div class="setting-label" style="margin-bottom:6px">NAS / Custom path (optional)</div>
        <input placeholder="/Volumes/NAS/Kavach" value="\${s.nasPath}" onblur="saveSetting('nasPath',this.value||null)" style="margin-bottom:0"/>
      </div>

      <div class="card" style="text-align:center;padding:20px">
        <div style="font-size:24px;margin-bottom:6px">🔐</div>
        <div style="font-weight:700">KaVach v1.1</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">कवच · Local-first · Secure · Private</div>
      </div>
    \`
  } catch(e) { console.error(e) }
}

async function saveSetting(key, value) {
  await fetch('/api/settings', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:value})})
  showToast('Saved')
}

// ── Add TOTP ─────────────────────────────────────────────────────────────────
let qrStream = null, qrRaf = null

function openTotpModal() {
  document.getElementById('totp-name').value = ''
  document.getElementById('totp-issuer').value = ''
  document.getElementById('totp-secret').value = ''
  document.getElementById('totp-err').style.display = 'none'
  document.getElementById('totp-modal').classList.add('open')
}

function closeTotpModal() {
  stopQR()
  document.getElementById('totp-modal').classList.remove('open')
}

async function saveTotp() {
  const name = document.getElementById('totp-name').value.trim()
  const issuer = document.getElementById('totp-issuer').value.trim()
  const secret = document.getElementById('totp-secret').value.trim().toUpperCase().replace(/\\s/g,'')
  const errEl = document.getElementById('totp-err')
  if (!name || !secret) { errEl.textContent = 'Name and secret are required'; errEl.style.display = ''; return }
  if (!/^[A-Z2-7]+=*$/.test(secret)) { errEl.textContent = 'Invalid Base32 secret'; errEl.style.display = ''; return }
  try {
    const res = await fetch('/api/totp', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,issuer,secret})})
    if (!res.ok) { const e = await res.json(); errEl.textContent = e.error || 'Failed'; errEl.style.display = ''; return }
    closeTotpModal()
    showToast('Account added!')
    await startTOTP()
  } catch { errEl.textContent = 'Could not connect'; errEl.style.display = '' }
}

function parseOtpAuth(uri) {
  try {
    if (!uri.startsWith('otpauth://totp/')) return null
    const url = new URL(uri)
    const label = decodeURIComponent(url.pathname.replace('/totp/',''))
    const secret = url.searchParams.get('secret') || ''
    const issuer = url.searchParams.get('issuer') || ''
    const [li, la] = label.includes(':') ? label.split(':') : ['', label]
    return { name: (la||label).trim(), issuer: issuer||li.trim(), secret: secret.toUpperCase().replace(/\\s/g,'') }
  } catch { return null }
}

async function startQR() {
  // Use file input with camera capture — works on iOS Safari over HTTP, no permission prompt
  document.getElementById('qr-file-input').click()
}

async function handleQRFile(input) {
  const file = input.files[0]
  if (!file) return
  input.value = ''

  // Load jsQR from local server
  if (!window.jsQR) {
    await new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = '/jsqr.js'
      s.onload = res; s.onerror = rej
      document.head.appendChild(s)
    })
  }

  const img = new Image()
  img.onload = () => {
    const canvas = document.getElementById('qr-canvas')
    // Scale down large images — iPhone photos are 12MP+, jsQR works best under 1000px
    const MAX = 800
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = window.jsQR(data.data, data.width, data.height)
    if (result?.data?.startsWith('otpauth://')) {
      const parsed = parseOtpAuth(result.data)
      if (parsed) {
        document.getElementById('totp-name').value = parsed.name
        document.getElementById('totp-issuer').value = parsed.issuer
        document.getElementById('totp-secret').value = parsed.secret
        showToast('QR scanned!')
        return
      }
    }
    showToast('No valid QR code — try again')
  }
  img.src = URL.createObjectURL(file)
}

function stopQR() {}

document.getElementById('totp-modal').addEventListener('click', function(e) { if(e.target===this) closeTotpModal() })

// ── Init ──────────────────────────────────────────────────────────────────────
loadTodos()
loadJournal()
</script>
</body>
</html>`
}

module.exports = { startHttpServer, stopHttpServer, getLocalIP, setVaultAccess, clearVaultAccess, getMobileHTML }
