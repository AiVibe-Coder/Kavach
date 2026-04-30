import { useState, useEffect, useRef } from 'react'

const api = window.vault

const FILTERS = ['all', 'today', 'pending', 'completed']
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

export default function TodoPanel({ showToast, onCountChange }) {
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTodo, setEditTodo] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { load() }, [])

  async function load() {
    const data = await api.todos.getAll()
    setTodos(data)
    onCountChange()
  }

  async function handleToggle(id) {
    const todo = todos.find(t => t.id === id)
    await api.todos.update(id, { completed: !todo.completed })
    await load()
  }

  async function handleDelete(id) {
    await api.todos.delete(id)
    showToast('Todo deleted')
    await load()
  }

  const filtered = todos
    .filter(t => {
      if (search) return t.title.toLowerCase().includes(search.toLowerCase())
      if (filter === 'today') return !t.completed && t.dueDate && t.dueDate <= today
      if (filter === 'pending') return !t.completed
      if (filter === 'completed') return t.completed
      return true
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      if (!a.completed && !b.completed) {
        // overdue first
        const aOver = a.dueDate && a.dueDate < today
        const bOver = b.dueDate && b.dueDate < today
        if (aOver !== bOver) return aOver ? -1 : 1
        return (PRIORITY_ORDER[a.priority] || 1) - (PRIORITY_ORDER[b.priority] || 1)
      }
      return new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
    })

  const counts = {
    all: todos.length,
    today: todos.filter(t => !t.completed && t.dueDate && t.dueDate <= today).length,
    pending: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="panel-title">Todos</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {counts[f] > 0 && <span style={{ marginLeft: 4, opacity: 0.8 }}>({counts[f]})</span>}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTodo(null); setShowAdd(true) }}>
          + Add Todo
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 28px 0' }}>
        <input
          className="form-input"
          placeholder="🔍 Search todos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="scroll-area" style={{ padding: '12px 28px 20px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{filter === 'completed' ? '🏆' : '✅'}</div>
            <h3>{filter === 'completed' ? 'No completed todos yet' : 'All clear!'}</h3>
            <p>{filter === 'pending' ? 'No pending todos. Time to relax!' : 'Nothing here yet.'}</p>
            {filter !== 'completed' && (
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>
                + Add your first todo
              </button>
            )}
          </div>
        ) : (
          filtered.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              today={today}
              onToggle={() => handleToggle(todo.id)}
              onEdit={() => { setEditTodo(todo); setShowAdd(true) }}
              onDelete={() => handleDelete(todo.id)}
            />
          ))
        )}
      </div>

      {showAdd && (
        <AddEditModal
          todo={editTodo}
          onClose={() => { setShowAdd(false); setEditTodo(null) }}
          onSave={async (data) => {
            if (editTodo) {
              await api.todos.update(editTodo.id, data)
              showToast('Todo updated')
            } else {
              await api.todos.add(data)
              showToast('Todo added!')
            }
            setShowAdd(false)
            setEditTodo(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function TodoItem({ todo, today, onToggle, onEdit, onDelete }) {
  const isOverdue = !todo.completed && todo.dueDate && todo.dueDate < today
  const isDueToday = !todo.completed && todo.dueDate && todo.dueDate === today

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 8,
        padding: '13px 16px',
        opacity: todo.completed ? 0.55 : 1,
        borderLeft: isOverdue ? '3px solid var(--red)' : isDueToday ? '3px solid var(--orange)' : '3px solid transparent',
        transition: 'all 0.15s'
      }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        style={{
          marginTop: 1,
          width: 20, height: 20,
          borderRadius: '50%',
          border: `2px solid ${todo.completed ? 'var(--green)' : 'var(--accent)'}`,
          background: todo.completed ? 'var(--green)' : 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
          transition: 'all 0.15s'
        }}
      >
        {todo.completed && '✓'}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          textDecoration: todo.completed ? 'line-through' : 'none',
          color: todo.completed ? 'var(--text-muted)' : 'var(--text)'
        }}>
          {todo.title}
        </div>
        {todo.notes && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {todo.notes}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          <span className={`priority priority-${todo.priority}`}>{todo.priority}</span>
          {todo.dueDate && (
            <span style={{ fontSize: 11, color: isOverdue ? 'var(--red)' : isDueToday ? 'var(--orange)' : 'var(--text-muted)' }}>
              {isOverdue ? '⚠️ ' : isDueToday ? '📅 ' : '🗓 '}
              {todo.dueDate}{todo.dueTime ? ' ' + todo.dueTime : ''}
            </span>
          )}
          {todo.tags?.map(tag => <span key={tag} className="tag">{tag}</span>)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} title="Edit">✏</button>
        <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} title="Delete">✕</button>
      </div>
    </div>
  )
}

function AddEditModal({ todo, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    title: todo?.title || '',
    notes: todo?.notes || '',
    dueDate: todo?.dueDate || today,
    dueTime: todo?.dueTime || '',
    priority: todo?.priority || 'medium',
    tags: todo?.tags?.join(', ') || ''
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    await onSave({ ...form, title: form.title.trim(), tags, dueDate: form.dueDate || null, dueTime: form.dueTime || null })
    setSaving(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{todo ? 'Edit Todo' : 'New Todo'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-input" placeholder="What needs to be done?" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" placeholder="Additional notes..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Due Time</label>
              <input className="form-input" type="time" value={form.dueTime} onChange={e => set('dueTime', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="high">⚡ High</option>
              <option value="medium">● Medium</option>
              <option value="low">○ Low</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tags (comma separated)</label>
            <input className="form-input" placeholder="work, personal, urgent..." value={form.tags} onChange={e => set('tags', e.target.value)} />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : todo ? 'Update' : 'Add Todo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
