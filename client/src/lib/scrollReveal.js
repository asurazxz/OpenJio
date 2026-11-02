// App-wide scroll reveal. Sections and cards that start below the fold fade in and rise 12px the
// first time they scroll into view; whatever is on screen when it appears is left alone, so pages
// never open blank. Elements found later (data loading, filters, tabs) are picked up as they mount.
//
// Pages with their own reveal (`v-reveal`, the landing page) keep it: anything already marked
// `data-reveal`, or inside a marked element, is skipped. Reduced motion turns the whole thing off.
const CANDIDATES = 'section, article, .card-x, .cards > li, .wait-list > li, .story-step'
// Floating, scrolling or interactive surfaces that must never be hidden or moved.
const SKIP = 'details:not([open]), dialog, [role="dialog"], .leaflet-container, .map-col, .rail, .people-pop, .app-header, .bottom-nav, .toast-host, .no-reveal'
const STAGGER_MS = 70
const MAX_STAGGER = 4

export function startScrollReveal(root) {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  document.documentElement.classList.add('reveal-ready')

  const observer = new IntersectionObserver((entries) => {
    let batch = 0
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const el = entry.target
      el.style.setProperty('--reveal-delay', `${Math.min(batch++, MAX_STAGGER) * STAGGER_MS}ms`)
      el.classList.add('is-revealed')
      observer.unobserve(el)
    }
  }, { threshold: 0 })

  function consider(el) {
    if (el.hasAttribute('data-reveal') || el.closest(SKIP) || el.parentElement?.closest('[data-reveal]')) return
    // Only content below the fold animates in; what is already visible stays put.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return
    el.setAttribute('data-reveal', 'auto')
    observer.observe(el)
  }
  function scan(node) {
    if (!(node instanceof Element)) return
    if (node.matches(CANDIDATES)) consider(node)
    for (const el of node.querySelectorAll(CANDIDATES)) consider(el)
  }

  const mutations = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) scan(node)
  })
  mutations.observe(root, { childList: true, subtree: true })
  scan(root)
  return () => { mutations.disconnect(); observer.disconnect() }
}
