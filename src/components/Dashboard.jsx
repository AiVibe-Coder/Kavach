import { useState, useEffect } from 'react'

const api = window.vault

export default function Dashboard({ showToast, onNavigate, refreshCount }) {
  const [todos, setTodos] = useState([])
  const [vaultCount, setVaultCount] = useState(0)
  const [httpInfo, setHttpInfo] = useState(null)
  const [copied, setCopied] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [allTodos, passwords, info] = await Promise.all([
      api.todos.getAll(),
      api.passwords.getAll(),
      api.util.getHttpInfo()
    ])
    setTodos(allTodos)
    setVaultCount(Array.isArray(passwords) ? passwords.length : 0)
    setHttpInfo(info)
  }

  const pending = todos.filter(t => !t.completed)
  const todayTodos = todos.filter(t => !t.completed && t.dueDate && t.dueDate <= today)
  const overdue = todos.filter(t => !t.completed && t.dueDate && t.dueDate < today)
  const completed = todos.filter(t => t.completed)

  async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id)
    await api.todos.update(id, { completed: !todo.completed })
    await load()
    refreshCount()
  }

  function copyUrl() {
    if (!httpInfo) return
    navigator.clipboard.writeText(`http://${httpInfo.ip}:${httpInfo.port}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('iOS URL copied!')
  }

  const statCards = [
    { label: 'Pending', value: pending.length, icon: '📋', color: 'var(--accent)', tab: 'todos' },
    { label: 'Due Today', value: todayTodos.length, icon: '📅', color: 'var(--orange)', tab: 'todos' },
    { label: 'Overdue', value: overdue.length, icon: '⚠️', color: 'var(--red)', tab: 'todos' },
    { label: 'Passwords', value: vaultCount, icon: '🔑', color: 'var(--green)', tab: 'vault' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">Dashboard</div>
          <div className="panel-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="scroll-area" style={{ padding: '20px 28px', gap: 20, display: 'flex', flexDirection: 'column' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {statCards.map(s => (
            <div
              key={s.label}
              className="card"
              style={{ cursor: 'pointer', textAlign: 'center', padding: '16px 12px' }}
              onClick={() => onNavigate(s.tab)}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Today's Todos */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {todayTodos.length > 0 ? `📅 Due Today (${todayTodos.length})` : '✅ Nothing due today!'}
            </span>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={() => onNavigate('todos')}>
              View all →
            </button>
          </div>
          {todayTodos.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 600 }}>You're all caught up!</div>
            </div>
          ) : (
            todayTodos.map(todo => (
              <TodoRow key={todo.id} todo={todo} today={today} onToggle={() => toggleTodo(todo.id)} />
            ))
          )}
        </div>

        {/* Overdue */}
        {overdue.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--red)' }}>
              ⚠️ Overdue ({overdue.length})
            </div>
            {overdue.map(todo => (
              <TodoRow key={todo.id} todo={todo} today={today} onToggle={() => toggleTodo(todo.id)} overdue />
            ))}
          </div>
        )}

        {/* iOS Access Card */}
        {httpInfo && (
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(124,106,247,0.1), rgba(78,205,196,0.1))', borderColor: 'rgba(124,106,247,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 32 }}>📱</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>iOS Access</div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--accent)', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>
                  http://{httpInfo.ip}:{httpInfo.port}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Open in Safari on same WiFi • Add to Home Screen for app feel</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={copyUrl}>
                {copied ? '✓ Copied' : '⎘ Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TodoRow({ todo, today, onToggle, overdue }) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
        padding: '12px 16px',
        borderLeft: overdue ? '3px solid var(--red)' : '3px solid var(--accent)'
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: '2px solid var(--accent)', background: 'none',
          cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{todo.title}</div>
        {todo.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{todo.notes}</div>}
      </div>
      {todo.dueTime && <div style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text-muted)' }}>🕐 {todo.dueTime}</div>}
      <PriorityBadge priority={todo.priority} />
    </div>
  )
}

function PriorityBadge({ priority }) {
  return <span className={`priority priority-${priority}`}>{priority}</span>
}
