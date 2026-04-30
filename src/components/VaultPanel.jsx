import { useState, useEffect, useRef } from 'react'

const api = window.vault

const CATEGORIES = ['general', 'social', 'banking', 'email', 'work', 'shopping']
const CAT_ICONS = { general: '🔑', social: '🌐', banking: '🏦', email: '✉️', work: '💼', shopping: '🛍️' }

// Guess category from URL/title
function guessCategory(title = '', url = '') {
  const t = (title + ' ' + url).toLowerCase()
  if (/bank|credit|debit|finance|invest|trading|zerodha|groww|paytm|upi|neft/.test(t)) return 'banking'
  if (/gmail|yahoo|outlook|hotmail|mail|email|proton/.test(t)) return 'email'
  if (/instagram|twitter|facebook|linkedin|reddit|tiktok|snapchat|whatsapp|telegram/.test(t)) return 'social'
  if (/slack|notion|jira|github|gitlab|bitbucket|aws|azure|figma|zoom/.test(t)) return 'work'
  if (/amazon|flipkart|myntra|nykaa|shop|store|ebay|etsy/.test(t)) return 'shopping'
  return 'general'
}

// Parse Apple Passwords CSV export
// Columns: Title,URL,Username,Password,Notes,OTPAuth
function parseAppleCSV(text) {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const idx = {
    title: header.indexOf('title'),
    url: header.indexOf('url'),
    username: header.indexOf('username'),
    password: header.indexOf('password'),
    notes: header.indexOf('notes'),
  }
  const results = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    // Handle quoted CSV fields properly
    const cols = []
    let cur = '', inQ = false
    for (let c = 0; c < lines[i].length; c++) {
      const ch = lines[i][c]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = '' }
      else cur += ch
    }
    cols.push(cur)
    const get = (i) => (i >= 0 && i < cols.length ? cols[i].trim() : '')
    const title = get(idx.title) || get(idx.url) || 'Imported'
    const password = get(idx.password)
    if (!password) continue
    const url = get(idx.url)
    const username = get(idx.username)
    results.push({
      title,
      username,
      password,
      url,
      notes: get(idx.notes),
      category: guessCategory(title, url)
    })
  }
  return results
}

export default function VaultPanel({ showToast }) {
  const [entries, setEntries] = useState([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [selectedCat, setSelectedCat] = useState('all')
  const [revealedIds, setRevealedIds] = useState(new Set())
  const [importPreview, setImportPreview] = useState(null) // { parsed, fileName }
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const data = await api.passwords.getAll()
    if (Array.isArray(data)) setEntries(data)
  }

  async function handleDelete(id) {
    await api.passwords.delete(id)
    showToast('Entry deleted')
    await load()
  }

  async function handleFavorite(id, current) {
    await api.passwords.update(id, { favorite: !current })
    await load()
  }

  function toggleReveal(id) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function copyToClipboard(text, label) {
    await navigator.clipboard.writeText(text)
    showToast(`${label} copied!`)
    setTimeout(() => navigator.clipboard.writeText(''), 30000)
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseAppleCSV(ev.target.result)
      if (parsed.length === 0) {
        showToast('No passwords found in file — check format', 'error')
      } else {
        setImportPreview({ parsed, fileName: file.name })
      }
    }
    reader.readAsText(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  async function handleImport() {
    if (!importPreview) return
    setImporting(true)
    const result = await api.passwords.import(importPreview.parsed)
    setImporting(false)
    setImportPreview(null)
    if (result.ok) {
      showToast(`Imported ${result.imported} passwords${result.skipped ? `, ${result.skipped} skipped (duplicates)` : ''}`)
      await load()
    } else {
      showToast(result.error || 'Import failed', 'error')
    }
  }

  const filtered = entries
    .filter(e => {
      const matchSearch = !search ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.url || '').toLowerCase().includes(search.toLowerCase())
      const matchCat = selectedCat === 'all' || e.category === selectedCat
      return matchSearch && matchCat
    })
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return a.title.localeCompare(b.title)
    })

  const catCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = entries.filter(e => e.category === cat).length
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="panel-title">Password Vault</div>
          <div className="panel-subtitle">{entries.length} entries · AES-256-GCM encrypted</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} title="Import from Apple Passwords CSV">
            ↓ Import
          </button>
          <button className="btn btn-primary" onClick={() => { setEditEntry(null); setShowAdd(true) }}>
            + Add Entry
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
      </div>

      <div style={{ padding: '12px 28px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          className="form-input"
          placeholder="🔍 Search vault..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      {/* Category filter */}
      <div style={{ padding: '10px 28px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${selectedCat === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSelectedCat('all')}
        >
          All ({entries.length})
        </button>
        {CATEGORIES.filter(c => catCounts[c] > 0).map(cat => (
          <button
            key={cat}
            className={`btn btn-sm ${selectedCat === cat ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedCat(cat)}
          >
            {CAT_ICONS[cat]} {cat} ({catCounts[cat]})
          </button>
        ))}
      </div>

      <div className="scroll-area" style={{ padding: '12px 28px 20px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>No passwords stored</h3>
            <p>Add your first password entry to get started.</p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>
              + Add Entry
            </button>
          </div>
        ) : (
          filtered.map(entry => (
            <VaultEntry
              key={entry.id}
              entry={entry}
              revealed={revealedIds.has(entry.id)}
              onReveal={() => toggleReveal(entry.id)}
              onCopyPwd={() => copyToClipboard(entry.password, 'Password')}
              onCopyUser={() => copyToClipboard(entry.username, 'Username')}
              onEdit={() => { setEditEntry(entry); setShowAdd(true) }}
              onDelete={() => handleDelete(entry.id)}
              onFavorite={() => handleFavorite(entry.id, entry.favorite)}
            />
          ))
        )}
      </div>

      {showAdd && (
        <AddEditModal
          entry={editEntry}
          onClose={() => { setShowAdd(false); setEditEntry(null) }}
          onSave={async (data) => {
            if (editEntry) {
              await api.passwords.update(editEntry.id, data)
              showToast('Entry updated')
            } else {
              await api.passwords.add(data)
              showToast('Entry added!')
            }
            setShowAdd(false)
            setEditEntry(null)
            await load()
          }}
          showToast={showToast}
        />
      )}

      {importPreview && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setImportPreview(null)}>
          <div className="modal" style={{ width: 500 }}>
            <div className="modal-header">
              <h2>Import Passwords</h2>
              <button className="modal-close" onClick={() => setImportPreview(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>📄 {importPreview.fileName}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{importPreview.parsed.length}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>passwords ready to import</div>
              </div>

              {/* Category breakdown */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Categories detected:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CATEGORIES.map(cat => {
                    const count = importPreview.parsed.filter(p => p.category === cat).length
                    if (!count) return null
                    return (
                      <span key={cat} style={{ fontSize: 12, background: 'var(--bg)', padding: '4px 10px', borderRadius: 20, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {CAT_ICONS[cat]} {cat} ({count})
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Preview list (first 5) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Preview:</div>
                {importPreview.parsed.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg)', borderRadius: 8, marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{CAT_ICONS[p.category]}</span>
                    <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{p.username}</span>
                  </div>
                ))}
                {importPreview.parsed.length > 5 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                    +{importPreview.parsed.length - 5} more...
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '10px 12px', background: 'rgba(245,166,35,0.08)', borderRadius: 8, border: '1px solid rgba(245,166,35,0.2)' }}>
                ⚠️ Duplicate entries (same title + username) will be skipped automatically.
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setImportPreview(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : `Import ${importPreview.parsed.length} Passwords`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VaultEntry({ entry, revealed, onReveal, onCopyPwd, onCopyUser, onEdit, onDelete, onFavorite }) {
  return (
    <div className="card" style={{ marginBottom: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
        }}>
          {CAT_ICONS[entry.category] || '🔑'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {entry.title}
            {entry.favorite && <span style={{ color: 'var(--yellow)' }}>★</span>}
          </div>
          {entry.username && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {entry.username}</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 10 }} onClick={onCopyUser}>copy</button>
            </div>
          )}
          {entry.url && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🔗 {entry.url}
            </div>
          )}
        </div>

        {/* Password */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{
            fontFamily: 'monospace', fontSize: 13,
            background: 'var(--bg)', padding: '4px 10px', borderRadius: 8,
            color: 'var(--accent)', minWidth: 80, textAlign: 'center',
            letterSpacing: revealed ? 1 : 3
          }}>
            {revealed ? (entry.password || '???') : '••••••••'}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onReveal} title="Show/hide">
            {revealed ? '🙈' : '👁'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onCopyPwd} title="Copy password">
            ⎘
          </button>
        </div>

        {/* Menu */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onFavorite} title="Favorite">
            {entry.favorite ? '★' : '☆'}
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} title="Edit">✏</button>
          <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>

      {entry.notes && (
        <>
          <hr className="divider" style={{ margin: '10px 0 8px' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📝 {entry.notes}</div>
        </>
      )}
    </div>
  )
}

function AddEditModal({ entry, onClose, onSave, showToast }) {
  const [form, setForm] = useState({
    title: entry?.title || '',
    username: entry?.username || '',
    password: entry?.password || '',
    url: entry?.url || '',
    notes: entry?.notes || '',
    category: entry?.category || 'general'
  })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [genOpts, setGenOpts] = useState({ length: 20, upper: true, lower: true, numbers: true, symbols: true })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function generatePw() {
    const pw = await api.util.generatePassword(genOpts)
    set('password', pw)
    setShowPw(true)
    showToast('Strong password generated!')
  }

  async function handleSave() {
    if (!form.title.trim() || !form.password) return
    setSaving(true)
    await onSave({ ...form, title: form.title.trim() })
    setSaving(false)
  }

  const strength = getStrength(form.password)

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-header">
          <h2>{entry ? 'Edit Entry' : 'New Password Entry'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="e.g. Gmail, Netflix..." value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Username / Email</label>
              <input className="form-input" placeholder="user@example.com" value={form.username} onChange={e => set('username', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Password *</label>
              <div className="pw-wrapper" style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    className="form-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Password"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
                <button className="btn btn-secondary" onClick={generatePw} title="Generate password" style={{ flexShrink: 0 }}>
                  ⚡ Generate
                </button>
              </div>
              {form.password && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Strength</span>
                    <span style={{ fontSize: 11, color: strength.color }}>{strength.label}</span>
                  </div>
                  <div className="strength-bar">
                    <div className="strength-fill" style={{ width: strength.pct + '%', background: strength.color }} />
                  </div>
                </div>
              )}
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Website URL</label>
              <input className="form-input" placeholder="https://example.com" value={form.url} onChange={e => set('url', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" placeholder="Optional notes..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>

          {/* Generator options */}
          <details style={{ marginBottom: 12 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 8 }}>
              ⚡ Generator options
            </summary>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Length:
                <input
                  type="number" min={8} max={64}
                  value={genOpts.length}
                  onChange={e => setGenOpts(g => ({ ...g, length: parseInt(e.target.value) || 20 }))}
                  style={{ width: 50, marginLeft: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', color: 'var(--text)', fontSize: 12 }}
                />
              </label>
              {['upper', 'lower', 'numbers', 'symbols'].map(opt => (
                <label key={opt} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={genOpts[opt]} onChange={e => setGenOpts(g => ({ ...g, [opt]: e.target.checked }))} />
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </label>
              ))}
            </div>
          </details>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.title.trim() || !form.password}>
              {saving ? 'Saving...' : entry ? 'Update' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getStrength(password) {
  if (!password) return { label: '', pct: 0, color: 'transparent' }
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 14) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong']
  const colors = ['#f5535d', '#f5535d', '#ffaa40', '#ffd166', '#43d68a', '#43d68a']
  return { label: labels[score], pct: (score / 5) * 100, color: colors[score] }
}
