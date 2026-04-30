const crypto = require('crypto')
const { spawnSync } = require('child_process')
const os = require('os')

const SERVICE_NAME = 'tijori-vault'
const ACCOUNT_NAME = os.userInfo().username

// ─── MAC SYSTEM PASSWORD AUTH ─────────────────────────────────────────────────

function verifyMacPassword(password) {
  const username = os.userInfo().username
  const result = spawnSync('dscl', ['.', '-authonly', username, password], {
    stdio: 'pipe',
    encoding: 'utf8'
  })
  return result.status === 0
}

// ─── KEYCHAIN KEY STORAGE ─────────────────────────────────────────────────────
// The AES-256 vault key is a random 32-byte key stored in macOS Keychain.
// Mac password just gates access — the key itself never touches disk unprotected.

function getVaultKeyFromKeychain() {
  const result = spawnSync(
    'security',
    ['find-generic-password', '-a', ACCOUNT_NAME, '-s', SERVICE_NAME, '-w'],
    { stdio: 'pipe', encoding: 'utf8' }
  )
  if (result.status !== 0) return null
  const hex = result.stdout.trim()
  return hex ? Buffer.from(hex, 'hex') : null
}

function storeVaultKeyInKeychain(keyBuffer) {
  const hex = keyBuffer.toString('hex')
  // Delete existing entry first (ignore errors)
  spawnSync('security', ['delete-generic-password', '-a', ACCOUNT_NAME, '-s', SERVICE_NAME], { stdio: 'pipe' })
  // Store new key
  const result = spawnSync(
    'security',
    ['add-generic-password', '-a', ACCOUNT_NAME, '-s', SERVICE_NAME, '-w', hex],
    { stdio: 'pipe', encoding: 'utf8' }
  )
  return result.status === 0
}

function getOrCreateVaultKey() {
  let key = getVaultKeyFromKeychain()
  if (!key) {
    key = crypto.randomBytes(32)
    storeVaultKeyInKeychain(key)
  }
  return key
}

// ─── AES-256-GCM ENCRYPT / DECRYPT ───────────────────────────────────────────

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  }
}

function decrypt(encrypted, iv, authTag, key) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(authTag, 'hex'))
    let out = decipher.update(encrypted, 'hex', 'utf8')
    out += decipher.final('utf8')
    return out
  } catch { return null }
}

function encryptPassword(plainPassword, key) {
  return encrypt(plainPassword, key)
}

function decryptPassword(encryptedPassword, iv, authTag, key) {
  return decrypt(encryptedPassword, iv, authTag, key)
}

// ─── PASSWORD GENERATOR ───────────────────────────────────────────────────────

function generatePassword(length = 20, opts = {}) {
  const { upper = true, lower = true, numbers = true, symbols = true } = opts
  let chars = ''
  if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (lower) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (numbers) chars += '0123456789'
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz'

  let password = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length]
  }
  return password
}

module.exports = {
  verifyMacPassword,
  getOrCreateVaultKey,
  encryptPassword,
  decryptPassword,
  generatePassword
}
