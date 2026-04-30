import { useState, useEffect, useCallback } from 'react'

const api = window.vault

const MOODS = [
  { id: 'great', emoji: '😄', label: 'Great' },
  { id: 'good', emoji: '🙂', label: 'Good' },
  { id: 'neutral', emoji: '😐', label: 'Neutral' },
  { id: 'low', emoji: '😔', label: 'Low' },
  { id: 'stressed', emoji: '😤', label: 'Stressed' }
]

export default function JournalPanel({ showToast }) {
  const [entries, setEntries] = useState([])
  const [selectedDate, setSelectedDate] = useState(today())
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('neutral')
  const [saved, setSaved] = useState(true)
  const [viewMode, setViewMode] = useState('write') // 'write' | 'history'

  function today() { return new Date().toISOString().split('T')[0] }

  const loadEntries = useCallback(async () => {
    const data = await api.journal.getAll()
    setEntries(data.sort((a, b) => b.date.localeCompare(a.date)))
  }, [])

  const loadEntry = useCallback(async (date) => {
    const entry = await api.journal.get(date)
    setContent(entry?.content || '')
    setMood(entry?.mood || 'neutral')
    setSaved(true)
  }, [])

  useEffect(() => { loadEntries(); loadEntry(selectedDate) }, [])

  useEffect(() => { loadEntry(selectedDate) }, [selectedDate])

  async function handleSave() {
    if (!content.trim()) return
    await api.journal.save(selectedDate, content, mood)
    setSaved(true)
    showToast('Journal saved')
    await loadEntries()
  }

  async function handleDelete() {
    await api.journal.delete(selectedDate)
    setContent('')
    setMood('neutral')
    showToast('Entry deleted')
    await loadEntries()
  }

  function handleContentChange(val) {
    setContent(val)
    setSaved(false)
  }

  const currentMood = MOODS.find(m => m.id === mood)
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  const dateLabel = (date) => {
    const d = new Date(date + 'T00:00:00')
    const t = today()
    if (date === t) return 'Today'
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (date === yesterday.toISOString().split('T')[0]) return 'Yesterday'
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="panel-title">Journal</div>
          <div className="panel-subtitle">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · Private & encrypted
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${viewMode === 'write' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('write')}>✏ Write</button>
          <button className={`btn btn-sm ${viewMode === 'history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('history')}>📚 History</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Date sidebar */}
        <div style={{ width: 180, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0, padding: '12px 8px' }}>
          {/* Today button */}
          <div
            className={`nav-item ${selectedDate === today() ? 'active' : ''}`}
            style={{ marginBottom: 12, justifyContent: 'center', flexDirection: 'column', gap: 2, height: 56 }}
            onClick={() => { setSelectedDate(today()); setViewMode('write') }}
          >
            <span style={{ fontSize: 20 }}>✏️</span>
            <span style={{ fontSize: 11 }}>Today</span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px', padding: '0 8px', marginBottom: 6 }}>Past Entries</div>
          {entries.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 8px' }}>No entries yet</div>
          )}
          {entries.map(e => (
            <div
              key={e.date}
              className={`nav-item ${selectedDate === e.date ? 'active' : ''}`}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, height: 'auto', padding: '8px 10px' }}
              onClick={() => { setSelectedDate(e.date); setViewMode('write') }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                <span style={{ fontSize: 13 }}>{MOODS.find(m => m.id === e.mood)?.emoji || '📝'}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{dateLabel(e.date)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', paddingLeft: 2 }}>
                {e.content.substring(0, 40)}...
              </div>
            </div>
          ))}
        </div>

        {/* Main writing area */}
        {viewMode === 'write' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Date bar */}
            <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <input
                type="date"
                className="form-input"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ width: 160 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {MOODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMood(m.id)}
                    title={m.label}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', border: '2px solid',
                      borderColor: mood === m.id ? 'var(--accent)' : 'var(--border)',
                      background: mood === m.id ? 'var(--accent-dim)' : 'var(--card)',
                      cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s'
                    }}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {wordCount} words
                {!saved && <span style={{ color: 'var(--orange)', marginLeft: 8 }}>● unsaved</span>}
              </div>
            </div>

            {/* Writing date label */}
            <div style={{ padding: '16px 24px 8px', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              {currentMood && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Feeling {currentMood.emoji} {currentMood.label}
                </div>
              )}
            </div>

            {/* Textarea */}
            <div style={{ flex: 1, padding: '0 24px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder={`What's on your mind today?\n\nWrite freely — this journal is private and stored only on your device.`}
                style={{
                  flex: 1, width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text)', fontSize: 15, lineHeight: 1.8, resize: 'none',
                  fontFamily: 'Georgia, "Times New Roman", serif'
                }}
              />
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={!content.trim() || saved}>
                {saved ? '✓ Saved' : '💾 Save Entry'}
              </button>
              {entries.find(e => e.date === selectedDate) && (
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
              )}
            </div>
          </div>
        ) : (
          /* History / read mode */
          <div className="scroll-area" style={{ flex: 1, padding: '20px 28px' }}>
            {entries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📔</div>
                <h3>Your journal is empty</h3>
                <p>Start writing today — your first entry awaits.</p>
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setViewMode('write')}>✏ Write Today's Entry</button>
              </div>
            ) : entries.map(e => (
              <div
                key={e.date}
                className="card"
                style={{ marginBottom: 16, cursor: 'pointer', transition: 'all .15s' }}
                onClick={() => { setSelectedDate(e.date); setViewMode('write') }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{MOODS.find(m => m.id === e.mood)?.emoji || '📝'}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {MOODS.find(m => m.id === e.mood)?.label} · {e.content.trim().split(/\s+/).length} words
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                  {e.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
