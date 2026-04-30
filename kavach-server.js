#!/usr/bin/env node
/**
 * KaVach standalone background server
 * Serves mobile PWA + API without the Electron UI running.
 * Vault & TOTP still require Electron (session key lives there).
 * Start: node kavach-server.js
 * Auto-start: installed via install-server.sh to ~/Library/LaunchAgents
 */

const express = require('express')
const cors    = require('cors')
const os      = require('os')
const path    = require('path')
const fs      = require('fs')

const db = require('./electron/database')

// Try to load the mobile HTML generator from httpServer — reuse it directly
const { getMobileHTML, startHttpServer } = (() => {
  try { return require('./electron/httpServer') } catch { return {} }
})()

const PORT = 3849

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return 'localhost'
}

const app = express()
app.use(cors())
app.use(express.json())

// ── Mobile UI ────────────────────────────────────────────────────────────────
if (typeof getMobileHTML === 'function') {
  app.get('/', (req, res) => res.send(getMobileHTML()))
}

// ── Todos ────────────────────────────────────────────────────────────────────
app.get('/api/todos',          (req, res) => res.json(db.getTodos()))
app.post('/api/todos',         (req, res) => res.json(db.addTodo(req.body)))
app.put('/api/todos/:id',      (req, res) => res.json(db.updateTodo(req.params.id, req.body)))
app.delete('/api/todos/:id',   (req, res) => { db.deleteTodo(req.params.id); res.json({ ok: true }) })

// ── Journal ──────────────────────────────────────────────────────────────────
app.get('/api/journal',        (req, res) => res.json(db.getJournalEntries()))
app.get('/api/journal/:date',  (req, res) => res.json(db.getJournalEntry(req.params.date) || null))
app.post('/api/journal',       (req, res) => res.json(db.saveJournalEntry(req.body)))

// ── Settings (read-only sensitive fields stripped) ───────────────────────────
app.get('/api/settings', (req, res) => {
  const s = db.getSettings()
  res.json({
    touchIdEnabled:        s.touchIdEnabled || false,
    notificationsEnabled:  s.notificationsEnabled,
    notificationTime:      s.notificationTime || '09:00',
    notifyEmail:           s.notifyEmail || '',
    nasPath:               s.nasPath || '',
    httpPort:              s.httpPort || 3847,
    apiToken:              null   // only available when Electron is running
  })
})
app.put('/api/settings', (req, res) => { db.saveSettings(req.body); res.json({ ok: true }) })

// ── Vault & TOTP — proxy to Electron server (3847) when running ──────────────
const http = require('http')

function proxyToElectron(req, res, path, method) {
  const options = {
    hostname: '127.0.0.1', port: 3847,
    path, method: method || req.method,
    headers: { 'Content-Type': 'application/json' }
  }
  const proxy = http.request(options, (r) => {
    res.status(r.statusCode)
    r.pipe(res)
  })
  proxy.on('error', () =>
    res.status(503).json({ error: 'Open and unlock KaVach on Mac first' })
  )
  if (req.body && Object.keys(req.body).length) {
    proxy.write(JSON.stringify(req.body))
  }
  proxy.end()
}

app.post('/api/vault/unlock', (req, res) => proxyToElectron(req, res, '/api/vault/unlock', 'POST'))
app.get('/api/totp',          (req, res) => proxyToElectron(req, res, '/api/totp', 'GET'))
app.post('/api/totp',         (req, res) => proxyToElectron(req, res, '/api/totp', 'POST'))
app.delete('/api/totp/:id',   (req, res) => proxyToElectron(req, res, `/api/totp/${req.params.id}`, 'DELETE'))

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[KaVach server] http://${getLocalIP()}:${PORT}`)
})
