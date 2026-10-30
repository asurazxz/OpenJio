// Light/dark preference. "system" follows the OS; the choice is a per-browser convenience.
// data-theme drives the OpenJio tokens; data-bs-theme keeps Bootstrap components in step.
const KEY = 'openjio:theme'
const CHOICES = ['system', 'light', 'dark']
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    return CHOICES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(value) {
  value = CHOICES.includes(value) ? value : 'system'
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
  const dark = t === 'dark' || (t === 'system' && !!media?.matches)
  const resolved = dark ? 'dark' : 'light'
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-theme-choice', t)
  root.setAttribute('data-bs-theme', resolved)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = dark ? '#1C1917' : '#FFF8F1'
  window.dispatchEvent(new CustomEvent('openjio:theme-change'))
}

media?.addEventListener?.('change', () => {
  if (getTheme() === 'system') applySavedTheme()
})

if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === KEY || event.key === null) applySavedTheme()
})
