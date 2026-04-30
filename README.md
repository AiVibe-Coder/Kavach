# 🔐 TodoVault

A lightweight, local-first **Todo + Password Manager** for macOS with iOS browser access.

## Features

- **📋 Todo Manager** — add, edit, complete, filter by today/pending/all. Priority levels, due dates, tags.
- **🔐 Password Vault** — AES-256-GCM encrypted password storage. Copy with one click. Password generator. Categories.
- **📌 Menu Bar** — scrolling ticker of today's pending todos in the macOS menu bar.
- **🔔 Notifications** — daily digest at a set time, reminders 15 min before due todos.
- **📱 iOS Access** — built-in web server. Open `http://<mac-ip>:3847` in Safari on iOS. Add to Home Screen for app feel.
- **🔒 Security** — PBKDF2 key derivation (310k iterations), AES-256-GCM, session key in memory only, auto-lock.

## Quick Start

```bash
cd TodoVault
./setup.sh        # install deps + build native modules
npm start         # launch app
```

> Requires **Node.js 18+** and **Xcode Command Line Tools** (for native SQLite module).

## iOS Setup

1. Make sure your Mac and iPhone are on the **same WiFi**.
2. Open TodoVault → Dashboard — you'll see your iOS access URL.
3. Open that URL in **Safari** on iPhone.
4. Tap Share → **Add to Home Screen** for an app-like experience.

## Data Storage

All data is stored at `~/.todovault/`:
- `todos.json` — your todos
- `vault.json` — AES-256 encrypted passwords
- `settings.json` — preferences

To use a **NAS or custom location**, set the path in Settings. The folder will be used instead of `~/.todovault`.

## Security Notes

- Your master password is **never stored** — only a PBKDF2 hash for verification.
- The AES-256-GCM encryption key is derived from your master password and held **in memory only**.
- Locking the app clears the key from memory.
- Clipboard is **auto-cleared after 30 seconds** after copying a password.
- Data files are stored with `600` permissions (owner read/write only).

## Architecture

```
Electron (main process)
  ├── Tray icon (scrolling todos)
  ├── Notifications (node-cron + Electron Notification API)
  ├── IPC handlers (todos, vault, auth, settings)
  ├── HTTP server (Express, port 3847) ← iOS access
  └── SQLite-free JSON file storage

React (renderer process)
  ├── Auth screen (master password setup/login)
  ├── Dashboard (stats + today's todos + iOS URL)
  ├── Todo Panel (full CRUD with filters)
  ├── Vault Panel (password CRUD with generator)
  └── Settings (notifications, storage, iOS)
```
