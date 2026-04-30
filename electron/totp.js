const crypto = require('crypto')
const { spawnSync } = require('child_process')
const os = require('os')

const APP_TOTP_SERVICE = 'tijori-app-totp'
const ACCOUNT = os.userInfo().username

// ─── BASE32 ───────────────────────────────────────────────────────────────────

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(str) {
  str = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0, value = 0
  const output = []
  for (const char of str) {
    const idx = B32_CHARS.indexOf(char)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

function base32Encode(buffer) {
  let bits = 0, value = 0, output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31]
  return output
}

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

function generateTOTP(secret, digits = 6, period = 30, offset = 0) {
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / period) + offset
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const pos = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[pos] & 0x7f) << 24) |
    ((hmac[pos + 1] & 0xff) << 16) |
    ((hmac[pos + 2] & 0xff) << 8) |
    (hmac[pos + 3] & 0xff)
  ) % Math.pow(10, digits)
  return code.toString().padStart(digits, '0')
}

function verifyTOTP(secret, code) {
  // Accept codes from ±1 period window to allow clock drift
  for (const offset of [0, -1, 1]) {
    if (generateTOTP(secret, 6, 30, offset) === code.toString()) return true
  }
  return false
}

function secondsRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period)
}

// ─── GENERATE A NEW APP TOTP SECRET ──────────────────────────────────────────

function generateSecret() {
  return base32Encode(crypto.randomBytes(20))
}

function getTotpUri(secret, label = 'Kavach', issuer = 'Kavach') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

// ─── KEYCHAIN STORAGE FOR APP TOTP SECRET ────────────────────────────────────

function getAppTotpSecret() {
  const r = spawnSync('security', ['find-generic-password', '-a', ACCOUNT, '-s', APP_TOTP_SERVICE, '-w'], { stdio: 'pipe', encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

function storeAppTotpSecret(secret) {
  spawnSync('security', ['delete-generic-password', '-a', ACCOUNT, '-s', APP_TOTP_SERVICE], { stdio: 'pipe' })
  const r = spawnSync('security', ['add-generic-password', '-a', ACCOUNT, '-s', APP_TOTP_SERVICE, '-w', secret], { stdio: 'pipe' })
  return r.status === 0
}

function deleteAppTotpSecret() {
  spawnSync('security', ['delete-generic-password', '-a', ACCOUNT, '-s', APP_TOTP_SERVICE], { stdio: 'pipe' })
}

module.exports = {
  generateTOTP,
  verifyTOTP,
  secondsRemaining,
  generateSecret,
  getTotpUri,
  getAppTotpSecret,
  storeAppTotpSecret,
  deleteAppTotpSecret
}
