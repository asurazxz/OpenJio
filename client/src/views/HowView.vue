<script setup>
import { ref, onMounted } from 'vue'
import { vReveal } from '../composables/useReveal.js'
import { runItineraryEvaluation, runSlotEvaluation } from '../lib/algo/evaluate.js'
import { WEIGHTS } from '../lib/algo/itinerary.js'
import { fmtRange } from '../lib/time.js'

// As on the landing page: starting states apply only after mount, so content shows without JS.
const ready = ref(false)
onMounted(() => { ready.value = true })

const itin = ref([])
const slots = ref([])
const evaluated = ref(false)
function evaluate(event) {
  if (!event.target.open || evaluated.value) return
  itin.value = runItineraryEvaluation()
  slots.value = runSlotEvaluation()
  evaluated.value = true
}
const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`)
const num = (x, d = 2) => (x == null ? '-' : x.toFixed(d))
const better = (a, b, higher = true) => a != null && b != null && (higher ? a > b + 1e-9 : a < b - 1e-9)
</script>

<template>
  <div class="page how-page" :class="{ 'reveal-ready': ready }">
    <header class="page-head">
      <h1 class="hero-in" style="--in-delay: 0ms">How OpenJio plans</h1>
      <p class="hero-in" style="--in-delay: 70ms">A time you can make, a plan you can change, and a clear place to meet.</p>
    </header>

    <section aria-labelledby="journey-heading" data-tour="how-overview">
      <h2 id="journey-heading" class="journey-heading hero-in" style="--in-delay: 140ms">From group chat to going out</h2>
      <div class="steps-grid">
        <article v-reveal="0" class="card-x story-step">
          <h3 class="step-label"><span class="step-number">1</span> Find a time</h3>
          <figure class="availability-example" role="img" aria-label="Example group availability">
            <div class="example-grid"><span></span><span>Fri</span><span>Sat</span><span>Sun</span><span>Mei</span><span class="free" style="--i: 0">✓</span><span class="free best" style="--i: 1">✓</span><span class="unknown" style="--i: 2">?</span><span>Arjun</span><span class="busy" style="--i: 3">—</span><span class="free best" style="--i: 4">✓</span><span class="free" style="--i: 5">✓</span><span>Farah</span><span class="free" style="--i: 6">✓</span><span class="free best" style="--i: 7">✓</span><span class="busy" style="--i: 8">—</span></div>
            <figcaption><span class="tag tag-teal">Saturday · 3 of 3 free</span></figcaption>
          </figure>
          <p>Mark when you would actually go out, and we suggest the best overlap.</p>
        </article>
        <article v-reveal="90" class="card-x story-step">
          <h3 class="step-label"><span class="step-number">2</span> Shape the outing</h3>
          <figure class="timeline-example" role="img" aria-label="Example outing timeline"><ol><li style="--i: 0"><time>2:00</time><span class="example-dot"></span><span><strong>A little art</strong><small>Gallery · 60 min</small></span></li><li class="travel" style="--i: 1"><time></time><span>↓</span><small>20 min travel</small></li><li style="--i: 2"><time>3:20</time><span class="example-dot meal"></span><span><strong>Kopi and a catch-up</strong><small>Cafe · 60 min</small></span></li></ol><figcaption>Opening hours + travel + your interests</figcaption></figure>
          <p>Generate an outing or pick the stops yourself, and preview any swap first.</p>
        </article>
        <article v-reveal="180" class="card-x story-step">
          <h3 class="step-label"><span class="step-number">3</span> Agree and go</h3>
          <figure class="votes-example" role="img" aria-label="Example group voting"><div class="example-stop">Kopi and a catch-up</div><div class="example-votes"><span class="keep">✓ Keep <strong class="keep-count" aria-hidden="true"></strong></span><span class="swap">↻ Swap <strong>0</strong></span></div><div class="confirmed-example">Host confirms the plan <span aria-hidden="true">→</span></div><figcaption>Running late? Find a stop you can still reach.</figcaption></figure>
          <p>Vote on each stop, the host confirms, and late joiners get a reachable meeting point.</p>
        </article>
      </div>
    </section>

    <details v-reveal class="benchmarks" @toggle="evaluate">
      <summary>See the algorithm comparison</summary>
      <p class="small muted mt-3">Optional technical detail. These examples explain the trade-offs; they are not a guarantee of the best possible plan.</p>
    <section class="card-x mt-4" aria-labelledby="score-h">
      <h2 id="score-h" class="h3">How a plan is scored</h2>
      <p class="muted">Each part is scaled to 0 to 1 before weighting. Group satisfaction blends the average member (60%) with the least happy member (40%), to balance the group average with less well-served members.</p>
      <div class="weights">
        <div v-for="(w, k) in WEIGHTS" :key="k" class="w" :class="{ neg: ['travel', 'wait'].includes(k) }">
          <span class="w-val">{{ ['travel', 'wait'].includes(k) ? '-' : '+' }}{{ w }}</span>
          <span class="w-key">{{ { satisfaction: 'Group satisfaction', variety: 'Variety', deal: 'Verified deals', coverage: 'Uses the slot', meal: 'Meal covered', travel: 'Travel time', wait: 'Waiting' }[k] }}</span>
        </div>
      </div>
      <p class="small muted mb-0">Conditional deals add a small bonus but are never counted as guaranteed savings.</p>
    </section>

    <section class="mt-4" aria-labelledby="eval-h">
      <h2 id="eval-h">Does it beat the simple approach?</h2>
      <p class="muted">Live results from this browser, using the sample listings. The baseline repeatedly picks the most interesting stop that fits next. Both methods must satisfy the same timing and meal rules. Bold marks the better value. Cases where the baseline wins are left in.</p>

      <div class="table-wrap card-x p-0">
        <table class="table-x">
          <caption class="visually-hidden">Itinerary generation compared with the greedy baseline</caption>
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Method</th>
              <th scope="col">Stops</th>
              <th scope="col">Rule breaks</th>
              <th scope="col">Travel</th>
              <th scope="col">Avg interest</th>
              <th scope="col">Least happy</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in itin" :key="r.id">
              <tr class="first">
                <th scope="row" rowspan="2">{{ r.label }}</th>
                <td><span class="tag tag-tomato">Beam</span></td>
                <template v-if="r.beam.feasible">
                  <td>{{ r.beam.stops }}</td>
                  <td :class="{ win: better(r.beam.violations, r.greedy.violations, false) }">{{ r.beam.violations }}</td>
                  <td :class="{ win: better(r.beam.travelMins, r.greedy.travelMins, false) }">{{ r.beam.travelMins }} min</td>
                  <td :class="{ win: better(r.beam.avgSat, r.greedy.avgSat) }">{{ pct(r.beam.avgSat) }}</td>
                  <td :class="{ win: better(r.beam.minSat, r.greedy.minSat) }">{{ pct(r.beam.minSat) }}</td>
                  <td :class="{ win: better(r.beam.score, r.greedy.score) }">{{ num(r.beam.score, 3) }}</td>
                </template>
                <td v-else colspan="6" class="muted">No plan: {{ r.beam.note }}</td>
              </tr>
              <tr>
                <td><span class="tag">Greedy</span></td>
                <template v-if="r.greedy.feasible">
                  <td>{{ r.greedy.stops }}</td>
                  <td :class="{ win: better(r.greedy.violations, r.beam.violations, false) }">{{ r.greedy.violations }}<span v-if="r.greedy.violationTypes?.includes('no_meal')" class="small muted"> (no meal)</span></td>
                  <td :class="{ win: better(r.greedy.travelMins, r.beam.travelMins, false) }">{{ r.greedy.travelMins }} min</td>
                  <td :class="{ win: better(r.greedy.avgSat, r.beam.avgSat) }">{{ pct(r.greedy.avgSat) }}</td>
                  <td :class="{ win: better(r.greedy.minSat, r.beam.minSat) }">{{ pct(r.greedy.minSat) }}</td>
                  <td :class="{ win: better(r.greedy.score, r.beam.score) }">{{ num(r.greedy.score, 3) }}</td>
                </template>
                <td v-else colspan="6" class="muted">No plan: {{ r.greedy.note }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p class="small muted mt-2">Read the results as examples, not a benchmark. Scores depend on our chosen weights, and the cases below were used while tuning them. Less travel and higher group satisfaction can favour different plans.</p>

      <h3 class="mt-4">Slot ranking vs earliest common slot</h3>
      <div class="table-wrap card-x p-0">
        <table class="table-x">
          <caption class="visually-hidden">Slot ranking compared with the earliest common slot</caption>
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Method</th>
              <th scope="col">Slot</th>
              <th scope="col">Can come</th>
              <th scope="col">Sociable hours</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in slots" :key="r.id">
              <tr class="first">
                <th scope="row" rowspan="2">{{ r.label }}</th>
                <td><span class="tag tag-tomato">Ranked</span></td>
                <td>{{ r.ranked.found ? fmtRange(r.ranked.start, r.ranked.end) : 'None' }}</td>
                <td>{{ r.ranked.found ? `${r.ranked.attendees} of ${r.ranked.of}` : '-' }}</td>
                <td>{{ r.ranked.found ? pct(r.ranked.prefFraction) : '-' }}</td>
              </tr>
              <tr>
                <td><span class="tag">Earliest</span></td>
                <td>{{ r.baseline.found ? fmtRange(r.baseline.start, r.baseline.end) : 'None (needs everyone)' }}</td>
                <td>{{ r.baseline.found ? `${r.baseline.attendees} of ${r.baseline.of}` : '-' }}</td>
                <td>{{ r.baseline.found ? pct(r.baseline.prefFraction) : '-' }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    </details>

    <section v-reveal class="mt-4 card-x" aria-labelledby="data-h">
      <h2 id="data-h" class="h3">Where listings come from</h2>
      <ul class="mb-2">
        <li><strong>Sample data:</strong> real public places with approximate hours, plus made-up events and deals so the demo works offline. Marked "Sample data".</li>
        <li><strong>Public posts:</strong> deals and events read automatically from public Singapore Telegram channels and confirmgood.com. Each links to its original post, and anything unclear is left blank.</li>
        <li><strong>Open Jios:</strong> public outings hosted by people on OpenJio.</li>
      </ul>
      <p class="small muted mb-0">Public APIs: OneMap, NEA weather via data.gov.sg, and Geoapify place search with OpenStreetMap data.</p>
    </section>
  </div>
</template>

<style scoped>
.journey-heading { margin: 0 0 24px; }
.steps-grid { display: grid; gap: 18px; }
.story-step { padding: 22px; min-width: 0; }
.story-step > p { font-size: .95rem; margin: 20px 0 0; }
.step-label { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 1.2rem; margin: 0; }
.step-number { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--tomato-soft); color: var(--tomato-ink); }
figure { margin: 20px 0 0; min-height: 200px; padding: 18px 14px; background: var(--paper-2); border-radius: 14px; }
figcaption { font-size: .75rem; text-align: center; margin-top: 16px; color: var(--ink-2); }
.example-grid { display: grid; grid-template-columns: 1.2fr repeat(3,1fr); gap: 5px; font-size: .75rem; align-items: center; text-align: center; }
.example-grid span { padding: 5px 0; border-radius: 6px; }
.free { background: var(--teal-soft); color: var(--teal-ink); font-weight: 800; }
.free.best { box-shadow: inset 0 0 0 1px var(--teal); }
.busy { color: var(--ink-2); background: var(--line); }
.unknown { border: 1px dashed var(--line-control); color: var(--ink-2); }
.timeline-example ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.timeline-example li { display: grid; grid-template-columns: 36px 18px 1fr; gap: 8px; align-items: center; font-size: .8rem; }
.timeline-example small { display: block; color: var(--ink-2); }
.example-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--teal); }
.example-dot.meal { background: var(--mustard); }
.travel { color: var(--ink-2); }
.example-stop { font-family: var(--font-display); font-weight: 800; font-size: .95rem; text-align: center; margin: 12px 0 18px; }
.example-votes { display: flex; gap: 8px; justify-content: center; }
.example-votes span { padding: 8px 12px; border-radius: 10px; font-size: .8rem; }
.keep { background: var(--teal-soft); color: var(--teal-ink); }.swap { background: var(--plum-soft); color: var(--plum-ink); }
.confirmed-example { margin-top: 18px; text-align: center; font-size: .8rem; font-weight: 700; }
.benchmarks { margin-top: 28px; border: 1px solid var(--line); border-radius: 18px; padding: 18px 22px; }
.benchmarks > summary { cursor: pointer; font-weight: 800; font-family: var(--font-display); min-height: 26px; }

.step { position: relative; padding-top: 22px; }
.num {
  position: absolute;
  top: -14px;
  left: 16px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--mustard);
  color: var(--on-accent);
  border: 3px solid var(--paper);
  font-family: var(--font-display);
  font-weight: 900;
}
.step h2 { margin-bottom: 8px; }
.step p { font-size: 0.95rem; }
.weights { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.w { display: flex; align-items: baseline; gap: 6px; padding: 6px 12px; border-radius: 999px; background: var(--teal-soft); }
.w.neg { background: var(--tomato-soft); }
.w-val { font-weight: 800; font-variant-numeric: tabular-nums; }
.w-key { font-size: 0.88rem; }
.table-wrap { overflow-x: auto; }
.table-x { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 720px; }
.table-x th, .table-x td { padding: 9px 12px; text-align: left; vertical-align: middle; }
.table-x thead th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); border-bottom: 1.5px solid var(--line); background: var(--paper-2); }
.table-x tbody th { font-weight: 600; max-width: 220px; }
.table-x tr.first > * { border-top: 1.5px solid var(--line); }
.table-x td { font-variant-numeric: tabular-nums; }
.win { font-weight: 800; color: var(--teal); }
@media (min-width: 900px) {
  .steps-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Motion, matching the landing page: the heading rises in on load, cards rise in as they scroll
   into view, and each card's example plays once after its card arrives (--reveal-delay is the
   card's stagger). Nothing is hidden before mount or under reduced motion. */
[data-reveal] { transition: opacity 480ms var(--ease) var(--reveal-delay, 0ms), transform 480ms var(--ease) var(--reveal-delay, 0ms); }
.reveal-ready [data-reveal]:not(.is-revealed) { opacity: 0; transform: translateY(16px); }
.reveal-ready .hero-in { animation: hero-in 480ms var(--ease) var(--in-delay, 0ms) both; }
@keyframes hero-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

.story-step { --play: calc(var(--reveal-delay, 0ms) + 380ms); }
/* 1. Find a time: replies fill in row by row, then the shared Saturday lights up. */
.is-revealed .example-grid [style*='--i'] { animation: cell-in 260ms var(--oj-ease-stamp) calc(var(--play) + var(--i) * 70ms) both; }
.is-revealed .example-grid .best { animation: cell-in 260ms var(--oj-ease-stamp) calc(var(--play) + var(--i) * 70ms) both, best-on 360ms var(--ease) calc(var(--play) + 760ms) both; }
.is-revealed .availability-example figcaption { animation: hero-in 360ms var(--ease) calc(var(--play) + 900ms) both; }
@keyframes cell-in { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
@keyframes best-on { from { box-shadow: inset 0 0 0 0 var(--teal); } to { box-shadow: inset 0 0 0 1px var(--teal); } }
/* 2. Shape the outing: stops slide in in order, with the travel leg between them. */
.is-revealed .timeline-example li { animation: stop-in 380ms var(--ease) calc(var(--play) + var(--i) * 260ms) both; }
.is-revealed .timeline-example .example-dot { animation: cell-in 260ms var(--oj-ease-stamp) calc(var(--play) + var(--i) * 260ms + 120ms) both; }
.is-revealed .timeline-example figcaption { animation: hero-in 360ms var(--ease) calc(var(--play) + 820ms) both; }
@keyframes stop-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
/* 3. Agree and go: votes stamp in, Keep counts up to 3, then the host confirms. */
@property --keep { syntax: '<integer>'; inherits: false; initial-value: 3; }
.keep-count { --keep: 3; counter-reset: keep var(--keep); }
.keep-count::after { content: counter(keep); }
.is-revealed .example-votes span { animation: stamp-in 300ms var(--oj-ease-stamp) var(--play) both; }
.is-revealed .example-votes .swap { animation-delay: calc(var(--play) + 120ms); }
.is-revealed .keep-count { animation: count-up 700ms steps(3, end) calc(var(--play) + 200ms) both; }
.is-revealed .confirmed-example { animation: hero-in 360ms var(--ease) calc(var(--play) + 1000ms) both; }
.is-revealed .votes-example figcaption { animation: hero-in 360ms var(--ease) calc(var(--play) + 1200ms) both; }
@keyframes stamp-in { from { opacity: 0; transform: scale(1.25) rotate(-4deg); } to { opacity: 1; transform: none; } }
@keyframes count-up { from { --keep: 0; } to { --keep: 3; } }

@media (prefers-reduced-motion: reduce) {
  [data-reveal] { transition: none; }
  .reveal-ready .hero-in, .is-revealed :is(.example-grid span, .timeline-example li, .example-dot, figcaption, .example-votes span, .keep-count, .confirmed-example) { animation: none; }
}
</style>
