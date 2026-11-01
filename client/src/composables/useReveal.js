// Scroll-reveal for marketing sections. `v-reveal` or `v-reveal="90"` (delay in ms) marks an element
// that fades in and rises 16px once, the first time it scrolls into view, then stops observing it.
//
// Content is never hidden by default: an element only gets its hidden look through the page's
// `reveal-ready` class, which the page adds after mount (so no JS means everything shows). If
// IntersectionObserver is missing or the visitor prefers reduced motion, the element is revealed
// immediately. The hidden and transition styles live in the page stylesheet, keyed on `[data-reveal]`.
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches
}

export const vReveal = {
  mounted(el, binding) {
    el.setAttribute('data-reveal', '')
    const delay = Number(binding.value) || 0
    if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`)

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-revealed')
      return
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' })
    el.__revealObserver = observer
    observer.observe(el)
  },
  unmounted(el) {
    el.__revealObserver?.disconnect()
    delete el.__revealObserver
  },
}
