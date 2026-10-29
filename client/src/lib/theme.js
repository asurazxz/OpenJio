// Light/dark preference. "system" follows the OS; the choice is a per-browser convenience.
// data-theme drives the OpenJio tokens; data-bs-theme keeps Bootstrap components in step.
const KEY = 'openjio:theme'
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

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
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'system' && !!media?.matches)
  root.setAttribute('data-bs-theme', dark ? 'dark' : 'light')
}

media?.addEventListener?.('change', () => {
  if (getTheme() === 'system') applySavedTheme()
})
