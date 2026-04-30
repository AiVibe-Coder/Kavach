let currentTabId = null
let allResults   = []

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTabId = tab?.id

  const domain = getDomain(tab?.url || '')
  document.getElementById('domain-label').textContent = domain || 'No domain'

  // Check KaVach connection
  const ping = await chrome.runtime.sendMessage({ type: 'PING' })

  if (ping?.reason === 'no_token') {
    setStatus('grey', 'Not set up')
    showSetup()
    return
  }
  if (!ping?.ok || ping?.reason === 'locked') {
    setStatus('red', 'KaVach is locked — unlock it first')
    document.getElementById('results-list').innerHTML =
      `<div class="empty"><span class="icon">🔐</span>Open KaVach and unlock it first.</div>`
    return
  }

  setStatus('green', 'Connected to KaVach')

  // Search for matching credentials
  const { results, error } = await chrome.runtime.sendMessage({ type: 'SEARCH', domain })

  if (error === 'locked') {
    setStatus('red', 'KaVach locked')
    return
  }

  allResults = results || []
  renderResults(allResults)

  if (allResults.length > 0) {
    document.getElementById('search-box').style.display = ''
    document.getElementById('search-input').addEventListener('input', e => {
      const q = e.target.value.toLowerCase()
      renderResults(allResults.filter(r =>
        r.title.toLowerCase().includes(q) || (r.username || '').toLowerCase().includes(q)
      ))
    })
  }
}

function renderResults(items) {
  const list = document.getElementById('results-list')

  if (!items.length) {
    list.innerHTML = `<div class="empty">
      <span class="icon">🔑</span>
      No matching passwords found.<br>
      <small style="color:#666">Try searching above or add an entry in KaVach.</small>
    </div>`
    return
  }

  list.innerHTML = items.map((r, i) => `
    <div class="item" data-idx="${i}">
      <div class="item-icon">${(r.title || '?')[0].toUpperCase()}</div>
      <div class="item-info">
        <div class="item-title">${esc(r.title)}</div>
        <div class="item-user">${esc(r.username || r.url || '')}</div>
      </div>
      <button class="fill-btn" data-idx="${i}">Fill</button>
    </div>
  `).join('')

  list.querySelectorAll('.fill-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const r = items[parseInt(btn.dataset.idx)]
      await chrome.runtime.sendMessage({
        type: 'FILL', tabId: currentTabId,
        username: r.username, password: r.password
      })
      btn.textContent = '✓'
      btn.classList.add('copied')
      setTimeout(() => { btn.textContent = 'Fill'; btn.classList.remove('copied') }, 1500)
      // Close popup after short delay
      setTimeout(() => window.close(), 800)
    })
  })
}

function showSetup() {
  document.getElementById('main-content').innerHTML = `
    <div class="setup-box">
      <span style="font-size:32px;display:block;margin-bottom:10px">🔐</span>
      <strong style="color:#f0f0f7">Connect to KaVach</strong><br>
      Open KaVach → Settings → Browser Extension<br>
      and paste your API token here.<br><br>
      <a href="#" id="open-options">Open extension settings →</a>
    </div>`
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
    window.close()
  })
}

function setStatus(color, text) {
  document.getElementById('status-dot').className = `dot ${color}`
  document.getElementById('status-text').textContent = text
}

function getDomain(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch { return '' }
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
  window.close()
})

init()
