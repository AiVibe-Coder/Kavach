// Listens for fill commands from the popup (via background worker)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'FILL') return

  const pwField = findPasswordField()
  const userField = pwField ? findUsernameField(pwField) : null

  if (userField && msg.username) {
    setNativeValue(userField, msg.username)
  }
  if (pwField && msg.password) {
    setNativeValue(pwField, msg.password)
  }
})

function findPasswordField() {
  // Prefer visible password fields
  const fields = [...document.querySelectorAll('input[type="password"]')]
  return fields.find(f => isVisible(f)) || fields[0] || null
}

function findUsernameField(pwField) {
  // Walk backwards from password field to find email/username input
  const inputs = [...document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"])')]
  const visible = inputs.filter(isVisible)
  const idx = visible.indexOf(visible.find(i => i.compareDocumentPosition(pwField) & Node.DOCUMENT_POSITION_FOLLOWING))

  // Check for email/username type fields first
  const emailField = visible.find(i =>
    /email|user|login|phone/i.test(i.type + i.name + i.id + i.autocomplete + i.placeholder)
  )
  if (emailField) return emailField

  // Otherwise take the last visible text/email input before the password field
  const pwIdx = visible.findIndex(i => i === pwField || (i.compareDocumentPosition(pwField) & Node.DOCUMENT_POSITION_FOLLOWING))
  return pwIdx > 0 ? visible[pwIdx - 1] : visible[0] || null
}

function isVisible(el) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    getComputedStyle(el).display !== 'none'
}

// React/Vue-friendly value setter — triggers change events properly
function setNativeValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value)
  } else {
    el.value = value
  }
  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.focus()
}
