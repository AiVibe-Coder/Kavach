const KAVACH_URL = 'http://127.0.0.1:3847'

// Called by popup to search vault for matching credentials
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEARCH') {
    handleSearch(msg.domain).then(sendResponse).catch(e => sendResponse({ error: e.message }))
    return true // keep channel open for async response
  }
  if (msg.type === 'FILL') {
    // Forward fill command to the active tab's content script
    chrome.tabs.sendMessage(msg.tabId, { type: 'FILL', username: msg.username, password: msg.password })
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'PING') {
    handlePing().then(sendResponse).catch(() => sendResponse({ ok: false }))
    return true
  }
})

async function getToken() {
  const { apiToken } = await chrome.storage.local.get('apiToken')
  return apiToken || null
}

async function handlePing() {
  const token = await getToken()
  if (!token) return { ok: false, reason: 'no_token' }
  const res = await fetch(`${KAVACH_URL}/api/ext/ping`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return { ok: false, reason: 'locked' }
  return await res.json()
}

async function handleSearch(domain) {
  const token = await getToken()
  if (!token) return { error: 'no_token', results: [] }
  const res = await fetch(`${KAVACH_URL}/api/ext/search?domain=${encodeURIComponent(domain)}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (res.status === 503) return { error: 'locked', results: [] }
  if (!res.ok)            return { error: 'error', results: [] }
  const results = await res.json()
  return { results }
}
