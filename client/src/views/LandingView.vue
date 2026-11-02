<script setup>
import { onMounted, ref } from 'vue'
import LandingMap from '../components/LandingMap.vue'
import DemoTime from '../components/landing/DemoTime.vue'
import DemoPlan from '../components/landing/DemoPlan.vue'
import DemoGo from '../components/landing/DemoGo.vue'
import { vReveal } from '../composables/useReveal.js'

// Hidden starting states apply only after mount, so content stays visible without JS.
const ready = ref(false)
onMounted(() => { ready.value = true })

// "See how it works" scrolls to the steps section; instant under reduced motion.
function scrollToHow(event) {
  const target = document.getElementById('how-jio')
  if (!target) return
  event.preventDefault()
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}
</script>

<template>
  <div class="landing-page" :class="{ 'reveal-ready': ready }">
    <section class="landing-hero" aria-labelledby="landing-heading">
      <div class="landing-copy">
        <h1 id="landing-heading" class="hero-in" style="--in-delay: 0ms"><span class="h1-lead">From <span class="q">“free this weekend?”</span></span> <span class="h1-tail">to <span class="q">“see you there.”</span></span></h1>
        <p class="hero-in" style="--in-delay: 70ms">Discover places, find a common time, and plan your next jio.</p>
        <div class="landing-actions hero-in" style="--in-delay: 140ms">
          <RouterLink :to="{ name: 'signin', query: { mode: 'signup', next: '/' } }" class="btn btn-primary">Get started</RouterLink>
          <RouterLink to="/discover" class="btn btn-secondary">Explore the map</RouterLink>
        </div>
        <a href="#how-jio" class="see-how hero-in" style="--in-delay: 210ms" @click="scrollToHow">See how it works <span class="see-how-arrow" aria-hidden="true">↓</span></a>
      </div>
      <LandingMap />
    </section>

    <section id="how-jio" class="how-section" aria-labelledby="how-heading">
      <div class="how-head" v-reveal>
        <h2 id="how-heading">How a jio comes together</h2>
        <p>Three short examples on a loop. They use made-up people and places, not live data.</p>
      </div>
      <ol class="how-steps">
        <li class="how-step" v-reveal="0">
          <p class="step-no">Step 1</p>
          <h3>Find a time</h3>
          <p class="how-caption">Everyone marks when they are free, and the best overlap rises to the top.</p>
          <DemoTime />
        </li>
        <li class="how-step" v-reveal="90">
          <p class="step-no">Step 2</p>
          <h3>Shape the plan</h3>
          <p class="how-caption">Keep the stops everyone likes, swap the ones they don’t, and confirm when the group agrees.</p>
          <DemoPlan />
        </li>
        <li class="how-step" v-reveal="180">
          <p class="step-no">Step 3</p>
          <h3>On the day</h3>
          <p class="how-caption">Joining later? See when you reach the group and how long you will have together.</p>
          <DemoGo />
        </li>
      </ol>
    </section>

    <section class="cta-strip" aria-labelledby="cta-heading" v-reveal>
      <div class="cta-copy">
        <h2 id="cta-heading">Ready to plan one?</h2>
        <p>Start a jio in a few taps, or look around the map first.</p>
      </div>
      <div class="landing-actions">
        <RouterLink :to="{ name: 'signin', query: { mode: 'signup', next: '/' } }" class="btn btn-primary">Get started</RouterLink>
        <RouterLink to="/discover" class="btn btn-secondary">Explore the map</RouterLink>
      </div>
    </section>

    <footer class="landing-footer"><span>Good company. A plan that works.</span><RouterLink to="/how">How OpenJio works</RouterLink></footer>
  </div>
</template>

<style scoped>
/* Hallmark: Hawker Glow inherited from docs/DESIGN.md; signature: an outing takes shape on the product's map. */
/* Critique: keep the map dominant, the copy brief, and the account action visible without waiting for animation. */
/* Hallmark · waive 26b · Links use the shared .btn interaction states in app.css · This page contains navigation links rather than disabled form controls. */
.landing-page a:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.landing-actions a:active { transform: translateY(1px); }
.landing-page { max-width: 1480px; margin: 0 auto; padding: 32px var(--gutter) 24px; }
.landing-hero { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.6fr); align-items: center; gap: clamp(24px, 4vw, 64px); min-height: min(660px, calc(100svh - var(--header-h) - 100px)); }
.landing-copy { min-width: 0; padding-bottom: 28px; }
.landing-copy h1 { font-size: clamp(2.5rem, 4.5vw, 4.2rem); line-height: 1.08; font-weight: 900; letter-spacing: -.035em; text-wrap: balance; overflow-wrap: break-word; min-width: 0; margin: 0 0 24px; }
.landing-copy h1 .h1-tail { display: block; }
/* Desktop keeps each quoted phrase whole; the copy column and type size leave room for it. */
@media (min-width: 992px) {
  .landing-hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); }
  .landing-copy h1 { font-size: clamp(2.3rem, 3.2vw, 3.3rem); }
  .landing-copy h1 .q { white-space: nowrap; }
}
.landing-copy p { font-size: 1.1rem; line-height: 1.65; color: var(--ink-2); max-width: 31ch; margin-bottom: 28px; }
.landing-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.landing-actions .btn { min-height: 48px; }
.landing-footer { display: flex; justify-content: space-between; gap: 16px; padding-top: 24px; color: var(--ink-2); font-size: .85rem; }
.landing-footer a { color: var(--ink-2); }

.how-section { margin-top: 56px; scroll-margin-top: calc(var(--header-h) + 16px); }
/* A quiet scroll cue, clearly secondary to the two buttons. */
.see-how { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-top: 4px; color: var(--ink-2); font-size: .88rem; font-weight: 600; text-decoration: none; }
.see-how:hover { color: var(--ink); }
.see-how-arrow { display: inline-block; animation: nudge 2.4s ease-in-out infinite; }
@keyframes nudge { 0%, 70%, 100% { transform: translateY(0); } 85% { transform: translateY(3px); } }
.see-how:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }

/* Reveal: hidden only after mount (.reveal-ready), so content never depends on JS. Movement stays at 16px. */
[data-reveal] { transition: opacity 480ms var(--ease) var(--reveal-delay, 0ms), transform 480ms var(--ease) var(--reveal-delay, 0ms); }
.reveal-ready [data-reveal]:not(.is-revealed) { opacity: 0; transform: translateY(16px); }
/* Hero load-in: a gentle 12px rise, staggered by --in-delay. */
.reveal-ready .hero-in { animation: hero-in 480ms var(--ease) var(--in-delay, 0ms) both; }
@keyframes hero-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { transition: none; }
  .reveal-ready .hero-in { animation: none; }
  .see-how-arrow { animation: none; }
}
.how-head h2 { margin: 0 0 8px; font-size: clamp(1.6rem, 3.4vw, 2.2rem); }
.how-head p { margin: 0 0 24px; color: var(--ink-2); max-width: 60ch; }
.how-steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 28px; }
.how-step { min-width: 0; display: grid; gap: 10px; align-content: start; }
.how-step h3 { margin: 0; }
.step-no { margin: 0; font-size: .8rem; font-weight: 800; color: var(--teal-ink); }
.how-caption { margin: 0 0 6px; color: var(--ink-2); font-size: .95rem; max-width: 40ch; }
@media (min-width: 992px) {
  .how-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
}

.cta-strip { margin-top: 56px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 24px; padding: clamp(20px, 3vw, 28px); background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); }
.cta-copy { min-width: 0; }
.cta-copy h2 { margin: 0 0 6px; font-size: clamp(1.4rem, 3vw, 1.8rem); }
.cta-copy p { margin: 0; color: var(--ink-2); }

@media (max-width: 991.98px) {
  .landing-page { padding-top: 32px; }
  .landing-hero { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .landing-copy { padding-bottom: 16px; max-width: 600px; }
  .landing-copy h1 { font-size: clamp(2.35rem, 6vw, 3.4rem); max-width: 17ch; margin-bottom: 16px; }
  .landing-copy p { max-width: 42ch; margin-bottom: 20px; }
}
@media (max-width: 575.98px) {
  .landing-page { padding-top: 24px; }
  .landing-copy h1 { font-size: 2.45rem; }
  .landing-copy p { font-size: 1rem; }
  .landing-actions { gap: 12px; }
  .landing-actions .btn { padding-inline: 16px; }
  .landing-footer { flex-direction: column; gap: 8px; padding-top: 24px; padding-bottom: 16px; }
  .how-section, .cta-strip { margin-top: 40px; }
  .cta-strip .landing-actions { width: 100%; }
  .cta-strip .landing-actions .btn { flex: 1 1 auto; }
}
</style>
