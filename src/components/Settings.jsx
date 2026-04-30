import { useState, useEffect } from 'react'

const api = window.vault

export default function Settings({ showToast }) {
  const [settings, setSettings] = useState(null)
  const [httpInfo, setHttpInfo] = useState(null)
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)
  const [hasAppTotp, setHasAppTotp] = useState(false)
  const [appTotpSetup, setAppTotpSetup] = useState(null)
  const [copied, setCopied] = useState('')
  const [apiToken, setApiToken] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [s, h, tid, tot, tok] = await Promise.all([
      api.settings.get(), api.util.getHttpInfo(),
      api.auth.touchIdAvailable(), api.auth.hasAppTotp(),
      api.settings.getApiToken()
    ])
    setApiToken(tok)
    setSettings(s)
    setHttpInfo(h)
    setTouchIdAvailable(tid)
    setHasAppTotp(tot)
  }

  async function save(updates) {
    await api.settings.save(updates)
    setSettings(s => ({ ...s, ...updates }))
    showToast('Settings saved')
  }

  async function sendTest() {
    await api.util.sendNotification('Kavach Test', 'Notifications are working! 🎉')
    showToast('Test notification sent!')
  }

  async function setupAppTotp() {
    const result = await api.auth.setupAppTotp()
    setAppTotpSetup(result)
    setHasAppTotp(true)
  }

  async function disableAppTotp() {
    await api.auth.disableAppTotp()
    setHasAppTotp(false)
    setAppTotpSetup(null)
    showToast('Google Authenticator disabled')
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
    showToast(`${label} copied!`)
  }

  if (!settings) return <div style={{ padding: 28, color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <div className="panel-title">Settings</div>
      </div>

      <div className="scroll-area" style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Security ── */}
        <Section title="🔐 Security & Authentication">

          {touchIdAvailable && (
            <Row label="Touch ID" sub="Use fingerprint to unlock Kavach">
              <Toggle checked={settings.touchIdEnabled} onChange={v => save({ touchIdEnabled: v })} />
            </Row>
          )}

          <Row label="Google Authenticator (2FA)" sub="Require a TOTP code after Mac password/Touch ID">
            <Toggle checked={hasAppTotp} onChange={v => v ? setupAppTotp() : disableAppTotp()} />
          </Row>

          {/* Setup flow for app TOTP */}
          {appTotpSetup && (
            <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 16, marginTop: 4 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>📱 Add to Google Authenticator</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Open Google Authenticator → + → Enter setup key manually
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Account name</div>
              <div style={{ fontFamily: 'monospace', background: 'var(--card)', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--accent)' }}>Kavach Vault</span>
                <button className="btn btn-ghost btn-sm" onClick={() => copyText('Kavach Vault', 'Name')}>⎘</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Secret key</div>
              <div style={{ fontFamily: 'monospace', background: 'var(--card)', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--accent)' }}>{appTotpSetup.secret}</span>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, marginLeft: 8 }} onClick={() => copyText(appTotpSetup.secret, 'Secret')}>
                  {copied === 'Secret' ? '✓' : '⎘'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Select <strong>Time-based</strong> when prompted. After adding, test it by locking and unlocking.
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setAppTotpSetup(null)}>Done</button>
            </div>
          )}

          {hasAppTotp && !appTotpSetup && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={setupAppTotp}>Regenerate Key</button>
              <button className="btn btn-danger btn-sm" onClick={disableAppTotp}>Remove 2FA</button>
            </div>
          )}

          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            ✓ AES-256-GCM encrypted vault &nbsp;·&nbsp; ✓ Key in Keychain &nbsp;·&nbsp; ✓ Never uploaded
          </div>
        </Section>

        {/* ── Email Alert ── */}
        <Section title="📧 Security Alert Email">
          <Row label="Notify when vault opens" sub="Sends an email via Mail.app each time Kavach is unlocked">
            <Toggle checked={!!settings.notifyEmail} onChange={v => !v && save({ notifyEmail: '' })} />
          </Row>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Apple ID / Email address</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                type="email"
                placeholder="you@icloud.com"
                value={settings.notifyEmail || ''}
                onChange={e => setSettings(s => ({ ...s, notifyEmail: e.target.value }))}
                onBlur={e => save({ notifyEmail: e.target.value })}
              />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
              Sent via Mail.app — requires Mail.app to be configured with your email.
            </div>
          </div>
        </Section>

        {/* ── Notifications ── */}
        <Section title="🔔 Notifications">
          <Row label="Enable notifications" sub="Daily digest and due date reminders">
            <Toggle checked={settings.notificationsEnabled} onChange={v => save({ notificationsEnabled: v })} />
          </Row>
          <Row label="Daily digest time" sub="Morning summary of pending todos">
            <input type="time" className="form-input" value={settings.notificationTime || '09:00'} onChange={e => save({ notificationTime: e.target.value })} style={{ width: 120 }} />
          </Row>
          <button className="btn btn-secondary btn-sm" onClick={sendTest}>🔔 Send test notification</button>
        </Section>

        {/* ── iOS Access ── */}
        <Section title="📱 Access Kavach on iPhone — It's Already Working!">
          <div style={{ background: 'linear-gradient(135deg, rgba(124,106,247,0.1), rgba(78,205,196,0.1))', borderRadius: 12, padding: 16, border: '1px solid rgba(124,106,247,0.25)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>✅ Your Mac is already serving Kavach to your iPhone</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
              Kavach runs a private web server on your Mac. Open the URL below in Safari on your iPhone (both must be on the same WiFi).
            </div>
            {httpInfo && (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>📡 Your Kavach iPhone URL</div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                  http://{httpInfo.ip}:{httpInfo.port}
                  <button className="btn btn-primary btn-sm" onClick={() => copyText(`http://${httpInfo.ip}:${httpInfo.port}`, 'URL')}>
                    {copied === 'URL' ? '✓ Copied' : '⎘ Copy'}
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {[
                ['1', 'Copy the URL above'],
                ['2', 'Open Safari on iPhone → paste URL → open'],
                ['3', 'Tap Share (□↑) → Add to Home Screen'],
                ['4', 'Name it "Kavach" → Add'],
                ['5', 'You now have a Kavach icon on your iPhone home screen!'],
              ].map(([n, s]) => (
                <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
                  <div style={{ color: 'var(--text-dim)' }}>{s}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'rgba(255,170,64,0.1)', borderRadius: 8, borderLeft: '3px solid var(--orange)' }}>
              ⚠️ Works on home WiFi only. The server runs only while your Mac is on and Kavach is running.
            </div>
          </div>
          <Row label="HTTP Port" sub="Restart app after changing">
            <input type="number" className="form-input" value={settings.httpPort || 3847} onChange={e => save({ httpPort: parseInt(e.target.value) || 3847 })} style={{ width: 100 }} />
          </Row>
        </Section>

        {/* ── Browser Extension ── */}
        <Section title="🧩 Browser Extension (Chrome / Firefox / Edge / Brave)">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 8 }}>
            Fill passwords from KaVach directly in your browser — works in any browser <strong>except Safari</strong> (Safari already has Apple Passwords built in).
          </div>

          {apiToken ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Your API Token</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {copied === 'token' ? '✓ Copied!' : apiToken}
                </div>
                <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => {
                  navigator.clipboard.writeText(apiToken)
                  setCopied('token')
                  setTimeout(() => setCopied(''), 2000)
                  showToast('Token copied!')
                }}>
                  {copied === 'token' ? '✓' : '⎘ Copy Token'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text)' }}>How to install:</strong><br/>
                1. Open Chrome/Firefox → Extensions → Load unpacked<br/>
                2. Select the <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>extension/</code> folder inside <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>~/Developer/Kavach</code><br/>
                3. Click the KaVach extension icon → Extension settings<br/>
                4. Paste the token above → Save &amp; Test
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Unlock KaVach to see your API token.</div>
          )}
        </Section>

        {/* ── Storage ── */}
        <Section title="💾 Storage">
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Data location</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-dim)' }}>~/.kavach/</div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">NAS / Custom path (optional)</label>
            <input className="form-input" placeholder="/Volumes/NAS/Kavach" value={settings.nasPath || ''} onChange={e => save({ nasPath: e.target.value || null })} />
          </div>
        </Section>

        <div className="card" style={{ textAlign: 'center', opacity: 0.6 }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>🔐</div>
          <div style={{ fontWeight: 700 }}>Kavach v1.1</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Local-first · Secure · Private</div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, border: '1px solid var(--border)',
      background: checked ? 'var(--accent)' : 'var(--card)',
      cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0
    }}>
      <div style={{
        position: 'absolute', width: 18, height: 18, borderRadius: '50%', background: '#fff',
        top: 2, left: checked ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)'
      }} />
    </button>
  )
}
