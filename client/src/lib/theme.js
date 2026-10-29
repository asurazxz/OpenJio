// Light/dark preference. "system" follows the OS; the choice is a per-browser convenience.
const KEY = 'openjio:theme'

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(value) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* ignore */
  }
  applySavedTheme()
}

export function applySavedTheme() {
  const t = getTheme()
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
