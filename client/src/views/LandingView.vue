<script setup>
import LandingMap from '../components/LandingMap.vue'
</script>

<template>
  <div class="landing-page">
    <section class="landing-hero" aria-labelledby="landing-heading">
      <div class="landing-copy">
        <h1 id="landing-heading">From “free this weekend?” to “see you there.”</h1>
        <p>Discover places, find a common time, and plan your next jio.</p>
        <div class="landing-actions">
          <RouterLink :to="{ name: 'signin', query: { mode: 'signup', next: '/' } }" class="btn btn-primary">Get started</RouterLink>
          <RouterLink to="/discover" class="btn btn-secondary">Explore the map</RouterLink>
        </div>
      </div>
      <LandingMap />
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
.landing-copy p { font-size: 1.1rem; line-height: 1.65; color: var(--ink-2); max-width: 31ch; margin-bottom: 28px; }
.landing-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.landing-actions .btn { min-height: 48px; }
.landing-footer { display: flex; justify-content: space-between; gap: 16px; padding-top: 24px; color: var(--ink-2); font-size: .85rem; }
.landing-footer a { color: var(--ink-2); }
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
}
</style>
