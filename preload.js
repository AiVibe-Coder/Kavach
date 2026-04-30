const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vault', {
  auth: {
    login: (password) => ipcRenderer.invoke('auth:login', password),
    touchId: () => ipcRenderer.invoke('auth:touchid'),
    verifyTotp: (code) => ipcRenderer.invoke('auth:verifyTotp', code),
    logout: () => ipcRenderer.invoke('auth:logout'),
    status: () => ipcRenderer.invoke('auth:status'),
    touchIdAvailable: () => ipcRenderer.invoke('auth:touchIdAvailable'),
    setupAppTotp: () => ipcRenderer.invoke('auth:setupAppTotp'),
    disableAppTotp: () => ipcRenderer.invoke('auth:disableAppTotp'),
    hasAppTotp: () => ipcRenderer.invoke('auth:hasAppTotp')
  },
  todos: {
    getAll: () => ipcRenderer.invoke('todos:getAll'),
    add: (todo) => ipcRenderer.invoke('todos:add', todo),
    update: (id, updates) => ipcRenderer.invoke('todos:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('todos:delete', id),
    getToday: () => ipcRenderer.invoke('todos:getToday')
  },
  passwords: {
    getAll: () => ipcRenderer.invoke('vault:getAll'),
    add: (entry) => ipcRenderer.invoke('vault:add', entry),
    update: (id, entry) => ipcRenderer.invoke('vault:update', { id, entry }),
    delete: (id) => ipcRenderer.invoke('vault:delete', id),
    import: (entries) => ipcRenderer.invoke('vault:import', entries)
  },
  journal: {
    getAll: () => ipcRenderer.invoke('journal:getAll'),
    get: (date) => ipcRenderer.invoke('journal:get', date),
    save: (date, content, mood) => ipcRenderer.invoke('journal:save', { date, content, mood }),
    delete: (date) => ipcRenderer.invoke('journal:delete', date)
  },
  totp: {
    getAll: () => ipcRenderer.invoke('totp:getAll'),
    add: (account) => ipcRenderer.invoke('totp:add', account),
    delete: (id) => ipcRenderer.invoke('totp:delete', id),
    generate: (secret, digits, period) => ipcRenderer.invoke('totp:generate', { secret, digits, period })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (updates) => ipcRenderer.invoke('settings:save', updates),
    getApiToken: () => ipcRenderer.invoke('auth:getApiToken')
  },
  util: {
    generatePassword: (opts) => ipcRenderer.invoke('util:generatePassword', opts),
    getHttpInfo: () => ipcRenderer.invoke('util:getHttpInfo'),
    sendNotification: (title, body) => ipcRenderer.invoke('util:sendNotification', { title, body })
  },
  on: (event, cb) => ipcRenderer.on(event, (_, ...args) => cb(...args)),
  off: (event, cb) => ipcRenderer.removeListener(event, cb)
})
