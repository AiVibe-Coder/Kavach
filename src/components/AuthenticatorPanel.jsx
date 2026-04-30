import { useState, useEffect, useRef, useCallback } from 'react'
import jsQR from 'jsqr'

const api = window.vault

export default function AuthenticatorPanel({ showToast }) {
  const [accounts, setAccounts] = useState([])
  const [codes, setCodes] = useState({})       // { id: { code, remaining } }
  const [showAdd, setShowAdd] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    loadAccounts()
    return () => clearInterval(timerRef.current)
  }, [])

  async function loadAccounts() {
    const data = await api.totp.getAll()
    if (Array.isArray(data)) {
      setAccounts(data)
      refreshCodes(data)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => refreshCodes(data), 1000)
    }
  }

  async function refreshCodes(accs) {
    const fresh = {}
    for (const a of accs) {
      const result = await api.totp.generate(a.secret, a.digits || 6, a.period || 30)
      if (!result.error) fresh[a.id] = result
    }
    setCodes(fresh)
  }

  async function handleDelete(id) {
    await api.totp.delete(id)
    showToast('Account removed')
    await loadAccounts()
  }

  async function copyCode(id) {
    const c = codes[id]?.code
    if (!c) return
    await navigator.clipboard.writeText(c)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    showToast('Code copied!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="panel-title">Authenticator</div>
          <div className="panel-subtitle">{accounts.length} accounts · TOTP codes refresh every 30s</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Account</button>
      </div>

      <div className="scroll-area" style={{ padding: '16px 28px' }}>
        {accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔑</div>
            <h3>No authenticator accounts</h3>
            <p>Add accounts by scanning or pasting the secret key from any TOTP-compatible service.</p>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>+ Add Account</button>
          </div>
        ) : accounts.map(account => (
          <AuthCard
            key={account.id}
            account={account}
            code={codes[account.id]}
            copied={copiedId === account.id}
            onCopy={() => copyCode(account.id)}
            onDelete={() => handleDelete(account.id)}
          />
        ))}
      </div>

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onSave={async (acc) => {
            await api.totp.add(acc)
            setShowAdd(false)
            showToast('Account added!')
            await loadAccounts()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function AuthCard({ account, code, copied, onCopy, onDelete }) {
  const remaining = code?.remaining || 30
  const pct = (remaining / (account.period || 30)) * 100
  const urgent = remaining <= 5

  // Format code with a space in the middle for readability
  const displayCode = code?.code
    ? code.code.slice(0, 3) + ' ' + code.code.slice(3)
    : '--- ---'

  return (
    <div className="card" style={{ marginBottom: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${stringToColor(account.issuer || account.name)}, ${stringToColor(account.name)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, color: '#fff'
        }}>
          {(account.issuer || account.name).charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{account.issuer || account.name}</div>
          {account.issuer && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.name}</div>}
        </div>

        {/* Code */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'monospace', fontSize: 28, fontWeight: 700, letterSpacing: 3,
            color: urgent ? 'var(--red)' : 'var(--accent)',
            transition: 'color 0.3s'
          }}>
            {displayCode}
          </div>
          {/* Countdown bar */}
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: pct + '%',
              background: urgent ? 'var(--red)' : remaining <= 10 ? 'var(--orange)' : 'var(--green)',
              transition: 'width 1s linear, background 0.3s'
            }} />
          </div>
          <div style={{ fontSize: 11, color: urgent ? 'var(--red)' : 'var(--text-muted)', marginTop: 3 }}>
            {remaining}s
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, marginLeft: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onCopy}>
            {copied ? '✓' : '⎘'}
          </button>
          <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} title="Remove">✕</button>
        </div>
      </div>
    </div>
  )
}

// Parse otpauth://totp/label?secret=...&issuer=...
function parseOtpAuth(uri) {
  try {
    if (!uri.startsWith('otpauth://totp/')) return null
    const url = new URL(uri)
    const label = decodeURIComponent(url.pathname.replace('/totp/', ''))
    const secret = url.searchParams.get('secret') || ''
    const issuer = url.searchParams.get('issuer') || ''
    // label is often "Issuer:account" or just "account"
    const [labelIssuer, labelAccount] = label.includes(':') ? label.split(':') : ['', label]
    return {
      name: labelAccount.trim() || label.trim(),
      issuer: issuer || labelIssuer.trim(),
      secret: secret.toUpperCase().replace(/\s/g, ''),
      digits: parseInt(url.searchParams.get('digits') || '6'),
      period: parseInt(url.searchParams.get('period') || '30'),
    }
  } catch { return null }
}

function QRScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          scan()
        }
      } catch (e) {
        onClose('Camera access denied — allow camera in System Settings → Privacy → Camera')
      }
    }
    start()
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function scan() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan); return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(img.data, img.width, img.height)
    if (result?.data?.startsWith('otpauth://')) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      onDetected(result.data)
      return
    }
    rafRef.current = requestAnimationFrame(scan)
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
      <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* Targeting overlay */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
      }}>
        <div style={{
          width: 180, height: 180, border: '2px solid var(--accent2)', borderRadius: 16,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
        }} />
      </div>
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center',
        fontSize: 13, color: 'rgba(255,255,255,0.8)'
      }}>
        Point camera at QR code
      </div>
    </div>
  )
}

function AddAccountModal({ onClose, onSave, showToast }) {
  const [form, setForm] = useState({ name: '', issuer: '', secret: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uriDetected, setUriDetected] = useState(false)
  const [scanning, setScanning] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  function handleQRDetected(uri) {
    const parsed = parseOtpAuth(uri)
    if (parsed) {
      setForm({ name: parsed.name, issuer: parsed.issuer, secret: parsed.secret })
      setUriDetected(true)
      setScanning(false)
      showToast('QR code scanned!')
    } else {
      setScanning(false)
      setError('QR code found but not a valid 2FA code')
    }
  }

  function handleSecretChange(v) {
    setError('')
    // Auto-detect otpauth:// URI paste
    const trimmed = v.trim()
    if (trimmed.startsWith('otpauth://')) {
      const parsed = parseOtpAuth(trimmed)
      if (parsed) {
        setForm({ name: parsed.name, issuer: parsed.issuer, secret: parsed.secret })
        setUriDetected(true)
        return
      }
    }
    setUriDetected(false)
    setForm(f => ({ ...f, secret: v }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.secret.trim()) { setError('Name and secret are required'); return }
    const clean = form.secret.trim().toUpperCase().replace(/\s/g, '')
    if (!/^[A-Z2-7]+=*$/.test(clean)) { setError('Secret must be a valid Base32 key (letters A-Z, digits 2-7)'); return }
    const test = await api.totp.generate(clean, 6, 30)
    if (test.error) { setError('Invalid secret key — could not generate a code'); return }
    setSaving(true)
    await onSave({ name: form.name.trim(), issuer: form.issuer.trim(), secret: clean })
    setSaving(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Authenticator Account</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* QR Scanner */}
          {scanning ? (
            <div style={{ marginBottom: 16 }}>
              <QRScanner
                onDetected={handleQRDetected}
                onClose={(err) => { setScanning(false); if (err) setError(err) }}
              />
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => setScanning(false)}>
                Cancel scan
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: 16, fontSize: 15 }}
              onClick={() => { setError(''); setScanning(true) }}
            >
              📷 Scan QR Code
            </button>
          )}

          {/* otpauth URI paste zone */}
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 16, border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Paste an <code style={{ fontSize: 11, background: 'var(--card)', padding: '1px 5px', borderRadius: 4 }}>otpauth://</code> URI or QR code text to auto-fill:
            </div>
            <input
              className="form-input"
              placeholder="otpauth://totp/GitHub:user@email.com?secret=ABC123..."
              style={{ fontFamily: 'monospace', fontSize: 11 }}
              onChange={e => handleSecretChange(e.target.value)}
            />
            {uriDetected && (
              <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>
                ✓ URI detected — fields auto-filled below
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Account name *</label>
            <input className="form-input" placeholder="e.g. john@gmail.com" value={form.name} onChange={e => set('name', e.target.value)} autoFocus={!uriDetected} />
          </div>
          <div className="form-group">
            <label className="form-label">Service / Issuer</label>
            <input className="form-input" placeholder="e.g. Google, GitHub, Twitter..." value={form.issuer} onChange={e => set('issuer', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Secret key *</label>
            <input
              className="form-input"
              placeholder="Paste base32 key from app's 2FA setup page"
              value={form.secret}
              onChange={e => set('secret', e.target.value)}
              style={{ fontFamily: 'monospace', letterSpacing: 1 }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              On any website's 2FA setup page, tap "can't scan QR code" to get the text secret key.
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.secret}>
              {saving ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const colors = ['#7c6af7', '#4ecdc4', '#f562c0', '#ffaa40', '#43d68a', '#f5535d', '#5b8af5']
  return colors[Math.abs(hash) % colors.length]
}
