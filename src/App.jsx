import { useState, useEffect, useCallback } from 'react'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import TodoPanel from './components/TodoPanel'
import VaultPanel from './components/VaultPanel'
import JournalPanel from './components/JournalPanel'
import AuthenticatorPanel from './components/AuthenticatorPanel'
import Settings from './components/Settings'

const api = window.vault

export default function App() {
  const [authStatus, setAuthStatus] = useState(null) // null = loading
  const [activeTab, setActiveTab] = useState('dashboard')
  const [pendingCount, setPendingCount] = useState(0)
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const checkAuth = useCallback(async () => {
    const status = await api.auth.status()
    setAuthStatus(status)
  }, [])

  const refreshPendingCount = useCallback(async () => {
    const todos = await api.todos.getAll()
    setPendingCount(todos.filter(t => !t.completed).length)
  }, [])

  useEffect(() => {
    checkAuth()
    // Listen for tray quick-add
    api.on('focus-add-todo', () => setActiveTab('todos'))
    return () => api.off('focus-add-todo', () => {})
  }, [])

  useEffect(() => {
    if (authStatus?.loggedIn) refreshPendingCount()
  }, [authStatus, activeTab])

  if (authStatus === null) {
    return <div className="app" style={{ background: 'var(--bg)' }} />
  }

  if (!authStatus.loggedIn) {
    return (
      <Auth
        onSuccess={() => checkAuth()}
        showToast={showToast}
      />
    )
  }

  const nav = [
    { id: 'dashboard', icon: '◈', label: 'Dashboard' },
    { id: 'todos', icon: '✓', label: 'Todos', badge: pendingCount > 0 ? pendingCount : null },
    { id: 'vault', icon: '⊞', label: 'Vault' },
    { id: 'journal', icon: '📔', label: 'Journal' },
    { id: 'authenticator', icon: '🔑', label: 'Authenticator' },
    { id: 'settings', icon: '⊙', label: 'Settings' }
  ]

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">Ka<span style={{color:'#F5A623'}}>V</span>ach</span>
      </div>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-icon">🔐</div>
            <div style={{ lineHeight: 1.25 }}>
              <div className="logo-text" style={{ fontSize: 16 }}>
                Ka<span style={{ color: '#F5A623' }}>V</span>ach
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5 }}>कवच</div>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-label">Menu</div>
            {nav.map(item => (
              <div
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </div>
            ))}
          </div>

          <div className="sidebar-bottom">
            <div
              className="nav-item"
              onClick={() => { api.auth.logout(); checkAuth() }}
            >
              <span className="nav-icon">⊗</span>
              <span>Lock App</span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="content-area">
          {activeTab === 'dashboard' && (
            <Dashboard
              showToast={showToast}
              onNavigate={setActiveTab}
              refreshCount={refreshPendingCount}
            />
          )}
          {activeTab === 'todos' && (
            <TodoPanel
              showToast={showToast}
              onCountChange={refreshPendingCount}
            />
          )}
          {activeTab === 'vault' && (
            <VaultPanel showToast={showToast} />
          )}
          {activeTab === 'journal' && (
            <JournalPanel showToast={showToast} />
          )}
          {activeTab === 'authenticator' && (
            <AuthenticatorPanel showToast={showToast} />
          )}
          {activeTab === 'settings' && (
            <Settings showToast={showToast} />
          )}
        </div>
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' && '✓'}
            {t.type === 'error' && '✕'}
            {t.type === 'info' && 'ℹ'}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
