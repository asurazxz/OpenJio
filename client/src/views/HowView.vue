<script setup>
import { ref, onMounted } from 'vue'
import { runItineraryEvaluation, runSlotEvaluation } from '../lib/algo/evaluate.js'
import { WEIGHTS } from '../lib/algo/itinerary.js'
import { fmtRange } from '../lib/time.js'

const itin = ref([])
const slots = ref([])
onMounted(() => {
  // Runs the same code the app uses, in your browser, on fixed sample cases.
  itin.value = runItineraryEvaluation()
  slots.value = runSlotEvaluation()
})
const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`)
const num = (x, d = 2) => (x == null ? '-' : x.toFixed(d))
const better = (a, b, higher = true) => a != null && b != null && (higher ? a > b + 1e-9 : a < b - 1e-9)
</script>

<template>
  <div class="page">
    <header class="page-head">
      <p class="small-caps m-0">Under the hood</p>
      <h1>How OpenJio plans</h1>
      <p>Two pieces of logic do the heavy lifting: finding a time that works, and building an outing that fits it. Both explain their choices, and both are compared against simpler methods below.</p>
    </header>

    <section class="steps-grid" aria-label="Steps">
      <article class="card-x step">
        <span class="num">1</span>
        <h2 class="h3">Finding a time</h2>
        <p>Everyone marks the hours they would actually go out. People who have not replied count as <strong>unknown</strong>, never free. Required people must be free; after that, slots are ranked by how many can come, whether the time sits in sociable hours (11 am to 10 pm), usable length and weekends.</p>
        <p class="small muted m-0">Calendar import removes clashes from the hours you marked. Busy time is rounded outwards and free time inwards, so rounding never invents availability. Only totals are shown to the group.</p>
      </article>
      <article class="card-x step">
        <span class="num">2</span>
        <h2 class="h3">Building the outing</h2>
        <p>Nearby places, events and deals are checked against hard rules: opening hours, event times, deal days and hours, travel time between stops, and the end of the slot. Places with <strong>unknown hours are skipped</strong>, not assumed open. A meal is required only if the slot spans lunch or dinner.</p>
        <p class="small muted m-0">A beam search keeps the 12 best partial plans at each step and extends them, instead of grabbing whatever looks best first.</p>
      </article>
      <article class="card-x step">
        <span class="num">3</span>
        <h2 class="h3">Agreeing and joining</h2>
        <p>Members vote on each stop. Votes belong to a specific version of a stop, so changing it resets them. Swaps are re-timed before they are offered. Late joiners get the first stop they can reach with at least 20 minutes to spare, using travel time, not just the clock.</p>
        <p class="small muted m-0">Locations are the published schedule, never live tracking.</p>
      </article>
    </section>

    <section class="card-x mt-4" aria-labelledby="score-h">
      <h2 id="score-h" class="h3">How a plan is scored</h2>
      <p class="muted">Each part is scaled to 0 to 1 before weighting. Group satisfaction blends the average member (60%) with the least happy member (40%), so one person is not sacrificed for the rest.</p>
      <div class="weights">
        <div v-for="(w, k) in WEIGHTS" :key="k" class="w" :class="{ neg: ['travel', 'wait'].includes(k) }">
          <span class="w-val">{{ ['travel', 'wait'].includes(k) ? '-' : '+' }}{{ w }}</span>
          <span class="w-key">{{ { satisfaction: 'Group satisfaction', variety: 'Variety', deal: 'Verified deals', coverage: 'Uses the slot', meal: 'Meal covered', travel: 'Travel time', wait: 'Waiting' }[k] }}</span>
        </div>
      </div>
      <p class="small muted mb-0">Conditional deals add a small bonus but are never counted as guaranteed savings.</p>
    </section>

    <section class="mt-5" aria-labelledby="eval-h">
      <h2 id="eval-h">Does it beat the simple approach?</h2>
      <p class="muted">Live results from this browser, using the sample listings. The baseline repeatedly picks the most interesting stop that fits next, ignoring travel cost and meals. Bold marks the better value. Cases where the baseline wins are left in.</p>

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
      <p class="small muted mt-2">Reading it honestly: the beam search matches or beats greedy on overall score in every feasible case and never breaks the meal rule. Greedy sometimes travels a little less, and in one case keeps the least happy member happier, because it chases interest alone. The weights above decide that trade-off; they were tuned on these same cases, so treat them as a design choice rather than a proven optimum.</p>

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

    <section class="mt-5 card-x" aria-labelledby="data-h">
      <h2 id="data-h" class="h3">Where listings come from</h2>
      <ul class="mb-2">
        <li><strong>Sample data:</strong> real public places with approximate hours, and made-up events and deals, so the demo works offline. Marked "Sample data" everywhere.</li>
        <li><strong>Public posts:</strong> a pipeline reads public Singapore Telegram channels and confirmgood.com, extracts outlet, dates, times and conditions with an AI model (or pattern matching), and leaves anything unclear blank. A reviewer checks every draft before it appears in Discover.</li>
        <li><strong>Open jios:</strong> public hangouts created by people on OpenJio.</li>
      </ul>
      <p class="small muted mb-0">Public APIs used: OneMap (maps, address search, routing), NEA two-hour forecast from data.gov.sg, and Google Calendar free/busy (optional).</p>
    </section>
  </div>
</template>

<style scoped>
.steps-grid { display: grid; gap: 14px; }
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
</style>
