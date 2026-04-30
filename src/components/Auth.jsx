import { useState, useEffect, useRef } from 'react'

const api = window.vault

export default function Auth({ onSuccess, showToast }) {
  const [step, setStep] = useState('password')  // 'password' | 'totp'
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)
  const totpRef = useRef(null)

  useEffect(() => {
    api.auth.touchIdAvailable().then(setTouchIdAvailable)
  }, [])

  // Auto-focus TOTP input when step changes
  useEffect(() => {
    if (step === 'totp') setTimeout(() => totpRef.current?.focus(), 100)
  }, [step])

  // Auto-submit when 6 digits entered for TOTP
  useEffect(() => {
    if (totpCode.length === 6) handleTotpSubmit()
  }, [totpCode])

  async function handlePasswordSubmit(e) {
    e?.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const result = await api.auth.login(password)
      if (result.ok && result.needsTotp) {
        setStep('totp')
        setPassword('')
      } else if (result.ok) {
        onSuccess()
      } else {
        setError(result.error || 'Incorrect password')
        setPassword('')
      }
    } catch { setError('Authentication failed') }
    setLoading(false)
  }

  async function handleTouchId() {
    setLoading(true)
    setError('')
    try {
      const result = await api.auth.touchId()
      if (result.ok && result.needsTotp) {
        setStep('totp')
      } else if (result.ok) {
        onSuccess()
      } else {
        setError(result.error || 'Touch ID failed')
      }
    } catch { setError('Touch ID error') }
    setLoading(false)
  }

  async function handleTotpSubmit() {
    if (totpCode.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const result = await api.auth.verifyTotp(totpCode)
      if (result.ok) {
        onSuccess()
      } else {
        setError(result.error || 'Invalid code')
        setTotpCode('')
      }
    } catch { setError('Verification failed') }
    setLoading(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>
          <div className="auth-logo">🔐</div>
          <h1 className="auth-title" style={{ marginBottom: 0 }}>
            Ka<span style={{ color: '#F5A623', textShadow: '0 0 14px rgba(245,166,35,0.6)' }}>V</span>ach
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', letterSpacing: 3, marginTop: 2 }}>कवच</p>
        </div>

        {step === 'password' ? (
          <>
            <p className="auth-sub">Enter your Mac login password</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <div className="pw-wrapper">
                  <input
                    className="form-input"
                    type={show ? 'text' : 'password'}
                    placeholder="Mac login password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    autoFocus
                    style={{ textAlign: 'center', letterSpacing: password && !show ? 4 : 0 }}
                  />
                  <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>
                    {show ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

              <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', height: 46, fontSize: 15 }} disabled={loading || !password}>
                {loading ? 'Verifying...' : 'Unlock'}
              </button>
            </form>

            {touchIdAvailable && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <button
                  className="btn btn-secondary w-full"
                  style={{ justifyContent: 'center', height: 46, fontSize: 15, gap: 10 }}
                  onClick={handleTouchId}
                  disabled={loading}
                >
                  <span style={{ fontSize: 22 }}>👆</span> Use Touch ID
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p className="auth-sub">Enter 6-digit code from Google Authenticator</p>

            {/* 6-box TOTP input */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '20px 0' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  width: 44, height: 52, borderRadius: 10,
                  background: 'var(--bg)',
                  border: `2px solid ${totpCode[i] ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
                  color: 'var(--accent)', transition: 'border-color 0.15s'
                }}>
                  {totpCode[i] || ''}
                </div>
              ))}
            </div>

            {/* Hidden input captures keystrokes */}
            <input
              ref={totpRef}
              value={totpCode}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setTotpCode(v)
                setError('')
              }}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            <button
              onClick={() => totpRef.current?.focus()}
              className="btn btn-secondary w-full"
              style={{ justifyContent: 'center', marginBottom: 12 }}
            >
              Tap to type code
            </button>

            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

            {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Verifying...</div>}

            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={() => { setStep('password'); setTotpCode(''); setError('') }}
            >
              ← Back
            </button>
          </>
        )}

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
          🔒 Verified via macOS · Key in Keychain · Never uploaded
        </p>
      </div>
    </div>
  )
}
