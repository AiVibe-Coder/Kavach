const path = require('path')
const fs = require('fs')
const os = require('os')

const OLD_DATA_DIR = path.join(os.homedir(), '.todovault')
const DATA_DIR = path.join(os.homedir(), '.kavach')
const TODOS_FILE = path.join(DATA_DIR, 'todos.json')
const VAULT_FILE = path.join(DATA_DIR, 'vault.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const JOURNAL_FILE = path.join(DATA_DIR, 'journal.json')
const TOTP_FILE = path.join(DATA_DIR, 'totp.json')

function ensureDataDir() {
  // Migrate old ~/.todovault → ~/.kavach on first run
  if (fs.existsSync(OLD_DATA_DIR) && !fs.existsSync(DATA_DIR)) {
    fs.renameSync(OLD_DATA_DIR, DATA_DIR)
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  }
}

function readJSON(file, defaultVal) {
  try {
    if (!fs.existsSync(file)) return defaultVal
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch { return defaultVal }
}

function writeJSON(file, data) {
  ensureDataDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
}

// ─── TODOS ───────────────────────────────────────────────────────────────────

function getTodos() {
  return readJSON(TODOS_FILE, [])
}

function saveTodos(todos) {
  writeJSON(TODOS_FILE, todos)
}

function addTodo(todo) {
  const todos = getTodos()
  const newTodo = {
    id: Date.now().toString(),
    title: todo.title,
    notes: todo.notes || '',
    dueDate: todo.dueDate || null,
    dueTime: todo.dueTime || null,
    priority: todo.priority || 'medium',
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    tags: todo.tags || []
  }
  todos.push(newTodo)
  saveTodos(todos)
  return newTodo
}

function updateTodo(id, updates) {
  const todos = getTodos()
  const idx = todos.findIndex(t => t.id === id)
  if (idx === -1) return null
  todos[idx] = { ...todos[idx], ...updates }
  if (updates.completed && !todos[idx].completedAt) {
    todos[idx].completedAt = new Date().toISOString()
  }
  saveTodos(todos)
  return todos[idx]
}

function deleteTodo(id) {
  const todos = getTodos().filter(t => t.id !== id)
  saveTodos(todos)
}

function getTodayTodos() {
  const today = new Date().toISOString().split('T')[0]
  return getTodos().filter(t => {
    if (t.completed) return false
    if (!t.dueDate) return false
    return t.dueDate <= today
  })
}

function getPendingTodos() {
  return getTodos().filter(t => !t.completed)
}

// ─── VAULT ───────────────────────────────────────────────────────────────────

function getVaultEntries() {
  return readJSON(VAULT_FILE, [])
}

function saveVaultEntries(entries) {
  writeJSON(VAULT_FILE, entries)
}

function addVaultEntry(entry) {
  const entries = getVaultEntries()
  const newEntry = {
    id: Date.now().toString(),
    title: entry.title,
    username: entry.username || '',
    encryptedPassword: entry.encryptedPassword,
    iv: entry.iv,
    authTag: entry.authTag,
    url: entry.url || '',
    notes: entry.notes || '',
    category: entry.category || 'general',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: false
  }
  entries.push(newEntry)
  saveVaultEntries(entries)
  return newEntry
}

function updateVaultEntry(id, updates) {
  const entries = getVaultEntries()
  const idx = entries.findIndex(e => e.id === id)
  if (idx === -1) return null
  entries[idx] = { ...entries[idx], ...updates, updatedAt: new Date().toISOString() }
  saveVaultEntries(entries)
  return entries[idx]
}

function deleteVaultEntry(id) {
  const entries = getVaultEntries().filter(e => e.id !== id)
  saveVaultEntries(entries)
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function getSettings() {
  return readJSON(SETTINGS_FILE, {
    masterPasswordHash: null,
    masterPasswordSalt: null,
    theme: 'dark',
    notificationsEnabled: true,
    notificationTime: '09:00',
    nasPath: null,
    httpPort: 3847,
    setupComplete: false
  })
}

function saveSettings(updates) {
  const settings = getSettings()
  writeJSON(SETTINGS_FILE, { ...settings, ...updates })
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────────

function getJournalEntries() {
  return readJSON(JOURNAL_FILE, [])
}

function saveJournalEntries(entries) {
  writeJSON(JOURNAL_FILE, entries)
}

function getJournalEntry(date) {
  return getJournalEntries().find(e => e.date === date) || null
}

function saveJournalEntry(date, content, mood) {
  const entries = getJournalEntries()
  const idx = entries.findIndex(e => e.date === date)
  const entry = {
    id: date,
    date,
    content: content || '',
    mood: mood || 'neutral',
    updatedAt: new Date().toISOString(),
    createdAt: idx === -1 ? new Date().toISOString() : entries[idx].createdAt
  }
  if (idx === -1) entries.push(entry)
  else entries[idx] = entry
  saveJournalEntries(entries)
  return entry
}

function deleteJournalEntry(date) {
  saveJournalEntries(getJournalEntries().filter(e => e.date !== date))
}

// ─── TOTP ACCOUNTS (for authenticator) ───────────────────────────────────────

function getTotpAccounts() {
  return readJSON(TOTP_FILE, [])
}

function saveTotpAccounts(accounts) {
  writeJSON(TOTP_FILE, accounts)
}

function addTotpAccount(account) {
  const accounts = getTotpAccounts()
  const newAcc = {
    id: Date.now().toString(),
    name: account.name,
    issuer: account.issuer || '',
    encryptedSecret: account.encryptedSecret,
    iv: account.iv,
    authTag: account.authTag,
    digits: account.digits || 6,
    period: account.period || 30,
    createdAt: new Date().toISOString()
  }
  accounts.push(newAcc)
  saveTotpAccounts(accounts)
  return newAcc
}

function deleteTotpAccount(id) {
  saveTotpAccounts(getTotpAccounts().filter(a => a.id !== id))
}

module.exports = {
  getTodos, addTodo, updateTodo, deleteTodo, getTodayTodos, getPendingTodos,
  getVaultEntries, addVaultEntry, updateVaultEntry, deleteVaultEntry,
  getSettings, saveSettings,
  getJournalEntries, getJournalEntry, saveJournalEntry, deleteJournalEntry,
  getTotpAccounts, addTotpAccount, deleteTotpAccount,
  DATA_DIR
}
