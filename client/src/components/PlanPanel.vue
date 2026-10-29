<script setup>
import { ref, computed } from 'vue'
import { SOFT_ISSUES, getPlan, generatePlan, setPlanStops, getAlternatives, vote, finalizePlan, listListings, previewStops, removeFromShortlist } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtTime } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE, areaLabel } from '../lib/labels.js'
import { toast, toastError } from '../lib/toast.js'
import PlanTimeline from './PlanTimeline.vue'
import MapView from './MapView.vue'
import AppDialog from './AppDialog.vue'
import EmptyState from './EmptyState.vue'

const props = defineProps({ detail: { type: Object, required: true } })
const emit = defineEmits(['goto'])

const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const solo = computed(() => h.value.mode === 'solo')
const { data: plan, reload } = useLive(() => getPlan(h.value.id))

const busy = ref(false)
const problems = ref(null)
const active = ref(-1)

const ids = computed(() => (plan.value?.stops || []).map((s) => s.listingId))
const blocking = computed(() => (plan.value?.issues || []).filter((i) => !SOFT_ISSUES.includes(i.type)))
const voters = computed(() => props.detail.members.length)

async function generate(relax = null) {
  if (plan.value?.stops.length && !relax && !window.confirm('Replace the current plan with a new one? Votes on changed stops will reset.')) return
  busy.value = true
  problems.value = null
  try {
    const r = await generatePlan(h.value.id, { relax })
    if (!r.ok) problems.value = r.problems
    else toast(solo.value ? 'Plan ready. Tweak it, then save it.' : 'Plan ready. Have a look, then share it.')
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}

async function save(next, message) {
  try {
    await setPlanStops(h.value.id, next)
    if (message) toast(message)
  } catch (e) {
    toastError(e)
  }
}
function move(i, d) {
  const next = ids.value.slice()
  const [x] = next.splice(i, 1)
  next.splice(i + d, 0, x)
  save(next)
}
function remove(i) {
  const next = ids.value.slice()
  next.splice(i, 1)
  save(next, 'Stop removed')
}

async function castVote(stop, value) {
  try {
    await vote(h.value.id, stop.id, stop.myVote === value ? 0 : value)
  } catch (e) {
    toastError(e)
  }
}

async function finalize() {
  busy.value = true
  try {
    await finalizePlan(h.value.id)
    toast(solo.value ? 'Plan saved. Enjoy!' : 'Plan confirmed. Everyone can see the final version.')
    emit('goto', 'go')
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}

/* Swap dialog */
const swapIndex = ref(-1)
const alternatives = ref(null)
async function openSwap(i) {
  swapIndex.value = i
  alternatives.value = null
  try {
    alternatives.value = await getAlternatives(h.value.id, i)
  } catch (e) {
    toastError(e)
    swapIndex.value = -1
  }
}
async function useAlt(alt) {
  const next = ids.value.slice()
  next[swapIndex.value] = alt.listing.id
  swapIndex.value = -1
  await save(next, `Swapped in ${alt.listing.title}`)
}

/* Add-stop dialog */
const addOpen = ref(false)
const allListings = ref([])
const query = ref('')
const kindFilter = ref('all')
const preview = ref(null)
const previewFor = ref(null)
async function openAdd() {
  addOpen.value = true
  preview.value = null
  previewFor.value = null
  if (!allListings.value.length) allListings.value = (await listListings()).filter((l) => l.type !== 'hangout')
}
const shortlistIds = computed(() => new Set((plan.value?.shortlist || []).map((l) => l.id)))
const addResults = computed(() => {
  const q = query.value.trim().toLowerCase()
  return allListings.value
    .filter((l) => !ids.value.includes(l.id))
    .filter((l) => kindFilter.value === 'all' || l.kind === kindFilter.value)
    .filter((l) => !q || l.title.toLowerCase().includes(q) || areaLabel(l.area).toLowerCase().includes(q) || (l.interests || []).some((i) => i.includes(q)))
    .sort((a, b) => Number(shortlistIds.value.has(b.id)) - Number(shortlistIds.value.has(a.id)) || (a.area === h.value.startArea.slug ? -1 : 0) - (b.area === h.value.startArea.slug ? -1 : 0))
    .slice(0, 30)
})
async function check(l) {
  previewFor.value = l.id
  preview.value = await previewStops(h.value.id, [...ids.value, l.id])
}
async function addStop(l) {
  await save([...ids.value, l.id], `Added ${l.title}`)
  if (shortlistIds.value.has(l.id)) removeFromShortlist(h.value.id, l.id).catch(() => {})
  addOpen.value = false
}
const previewIssues = computed(() => (preview.value ? preview.value.issues.filter((i) => i.index === ids.value.length || i.index === -1) : []))

const markers = computed(() =>
  (plan.value?.stops || []).map((s, i) => ({ id: i, lat: s.listing.lat, lng: s.listing.lng, label: String(i + 1), title: s.listing.title, active: active.value === i, tone: s.listing.kind === 'meal' ? 'mustard' : 'tomato' })),
)
const voteSummary = computed(() => {
  const stops = plan.value?.stops || []
  const flagged = stops.filter((s) => s.votes.net < 0).length
  const fully = stops.filter((s) => s.votes.voted >= voters.value).length
  return { flagged, fully, total: stops.length }
})
</script>

<template>
  <div>
    <div v-if="!plan" class="py-5 text-center"><span class="spinner-border" aria-label="Loading plan"></span></div>

    <EmptyState v-else-if="plan.needsSlot" title="Lock a time first" body="Plans are built around a fixed time so every stop is open and reachable." tone="mustard">
      <button type="button" class="btn btn-secondary" @click="emit('goto', 'time')">Go to times</button>
    </EmptyState>

    <div v-else-if="plan.broken" class="notice danger"><p>{{ plan.issues[0].message }}</p></div>

    <template v-else-if="plan.empty">
      <div v-if="problems" class="notice danger mb-3 flex-column">
        <p><strong>No plan fits yet.</strong></p>
        <ul class="mb-1 ps-3">
          <li v-for="p in problems" :key="p.relax">{{ p.cause }}</li>
        </ul>
        <div class="d-flex flex-wrap gap-2">
          <button v-for="p in problems" :key="'r' + p.relax" type="button" class="btn btn-secondary btn-sm" @click="p.relax === 'change_slot' ? emit('goto', 'time') : generate(p.relax)">{{ p.label }}</button>
        </div>
      </div>

      <div v-if="isHost" class="row g-3">
        <div class="col-md-7">
          <div class="choice card-x pop">
            <span class="tag tag-tomato">Recommended</span>
            <h3>Make me a plan</h3>
            <p class="muted">We check opening hours, deals and travel times for {{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}, then balance everyone's interests so nobody is left out.</p>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="generate()">
              <span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ busy ? 'Working it out' : 'Generate plan' }}
            </button>
          </div>
        </div>
        <div class="col-md-5">
          <div class="choice card-x">
            <h3>Build it myself</h3>
            <p class="muted">Pick stops one by one. We still check that each one fits.</p>
            <button type="button" class="btn btn-secondary" @click="openAdd">Add first stop</button>
          </div>
        </div>
      </div>
      <EmptyState v-else title="The host is putting the plan together" body="Found somewhere good? Add it from Discover and the host will see it on the shortlist." tone="teal">
        <RouterLink :to="`/discover?for=${h.id}`" class="btn btn-secondary">Suggest a place</RouterLink>
      </EmptyState>

      <section v-if="plan.shortlist?.length" class="mt-4" aria-labelledby="sl-h">
        <h3 id="sl-h" class="h6 small-caps">Shortlist from the group</h3>
        <div class="chip-row">
          <span v-for="l in plan.shortlist" :key="l.id" class="tag tag-plum">{{ l.title }}</span>
        </div>
      </section>
    </template>

    <template v-else>
      <div v-if="h.planChangedAt && h.stage === 'voting'" class="notice mb-3">
        <p><strong>The plan changed.</strong> Votes on changed stops were reset. {{ isHost ? 'Confirm again when everyone has had a look.' : 'Have another look and vote again.' }}</p>
      </div>
      <div v-if="h.stage === 'final'" class="notice teal mb-3">
        <p><strong>Confirmed.</strong> {{ isHost ? 'Editing a stop will reopen voting for everyone.' : 'This is the final plan.' }}</p>
      </div>
      <div v-if="blocking.length" class="notice danger mb-3">
        <p><strong>{{ blocking.length === 1 ? 'One thing to fix' : `${blocking.length} things to fix` }} before confirming.</strong> Each is marked on its stop below.</p>
      </div>

      <div class="row g-4">
        <div class="col-lg-7">
          <PlanTimeline :stops="plan.stops" :start="h.startArea" :issues="plan.issues" :active-index="active" @focus="active = $event">
            <template #actions="{ stop, index }">
              <div class="stop-actions">
                <div v-if="!solo && h.stage === 'voting'" class="votes" role="group" :aria-label="`Vote on ${stop.listing.title}`">
                  <button type="button" class="vote up" :aria-pressed="stop.myVote === 1" :aria-label="`Keep ${stop.listing.title}`" @click="castVote(stop, 1)">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5l7 8h-4v6H9v-6H5z" fill="currentColor" /></svg>
                    {{ stop.votes.up }}
                  </button>
                  <button type="button" class="vote down" :aria-pressed="stop.myVote === -1" :aria-label="`Swap out ${stop.listing.title}`" @click="castVote(stop, -1)">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19l-7-8h4V5h6v6h4z" fill="currentColor" /></svg>
                    {{ stop.votes.down }}
                  </button>
                  <span class="small muted">{{ stop.votes.voted }}/{{ stop.votes.of }} voted</span>
                  <span v-if="stop.votes.net < 0" class="tag tag-danger">{{ isHost ? 'Consider swapping' : 'Group is unsure' }}</span>
                </div>
                <div v-if="isHost" class="host-actions">
                  <button type="button" class="btn btn-ghost btn-sm" @click="openSwap(index)">Swap</button>
                  <button type="button" class="btn btn-ghost btn-sm" :disabled="index === 0" :aria-label="`Move ${stop.listing.title} earlier`" @click="move(index, -1)">Earlier</button>
                  <button type="button" class="btn btn-ghost btn-sm" :disabled="index === plan.stops.length - 1" :aria-label="`Move ${stop.listing.title} later`" @click="move(index, 1)">Later</button>
                  <button type="button" class="btn btn-ghost btn-sm" :aria-label="`Remove ${stop.listing.title}`" @click="remove(index)">Remove</button>
                </div>
                <button v-else-if="h.stage === 'voting'" type="button" class="btn btn-ghost btn-sm" @click="openSwap(index)">See other options</button>
              </div>
            </template>
          </PlanTimeline>
          <div v-if="plan.issues.some((i) => i.index === -1)" class="small muted mt-2">
            <span v-for="i in plan.issues.filter((x) => x.index === -1)" :key="i.type">{{ i.message }}. </span>
          </div>
          <div v-if="isHost" class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="plan.stops.length >= 6" @click="openAdd">Add a stop</button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="generate()">Regenerate</button>
          </div>
        </div>

        <aside class="col-lg-5">
          <div class="side">
            <MapView :markers="markers" :start="h.startArea" path height="260px" @select="active = $event" />
            <div class="card-x mt-3">
              <h3 class="h6 small-caps mb-2">Why this plan</h3>
              <ul class="reasons">
                <li v-for="r in plan.reasons" :key="r">{{ r }}</li>
              </ul>
              <p class="small muted mb-0">{{ plan.generatedBy === 'manual' ? 'Built by hand and checked automatically.' : 'Generated by comparing many possible orders of stops.' }} <RouterLink to="/how">How it works</RouterLink></p>
            </div>
            <div v-if="isHost && h.stage === 'voting'" class="card-x pop mt-3">
              <template v-if="!solo">
                <p class="m-0"><strong>{{ voteSummary.fully }} of {{ voteSummary.total }}</strong> stops have votes from everyone.</p>
                <p v-if="voteSummary.flagged" class="small text-danger mb-0">{{ voteSummary.flagged }} {{ voteSummary.flagged === 1 ? 'stop has' : 'stops have' }} more swaps than keeps.</p>
              </template>
              <button type="button" class="btn btn-primary w-100 mt-3" :disabled="busy || blocking.length > 0" @click="finalize">
                {{ solo ? 'Save this plan' : 'Close voting and confirm' }}
              </button>
              <p v-if="blocking.length" class="small muted mt-2 mb-0">Fix the marked stops first.</p>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <AppDialog :open="swapIndex !== -1" :title="isHost ? 'Swap this stop' : 'Other options'" @close="swapIndex = -1">
      <p v-if="plan?.stops[swapIndex]" class="small muted">
        Instead of <strong>{{ plan.stops[swapIndex].listing.title }}</strong>. Each option keeps the rest of the plan on time.
      </p>
      <div v-if="!alternatives" class="py-4 text-center"><span class="spinner-border" aria-label="Finding options"></span></div>
      <p v-else-if="!alternatives.length" class="muted">Nothing else of this kind fits here without breaking the rest of the plan.</p>
      <ul v-else class="alts">
        <li v-for="a in alternatives" :key="a.listing.id" class="alt">
          <div>
            <span class="tag" :class="TYPE_TONE[a.listing.type]">{{ TYPE_LABEL[a.listing.type] }}</span>
            <p class="alt-title">{{ a.listing.title }}</p>
            <p class="small muted m-0">{{ areaLabel(a.listing.area) }} · {{ a.reasons.join(' · ') }}</p>
          </div>
          <button v-if="isHost" type="button" class="btn btn-secondary btn-sm" @click="useAlt(a)">Use this</button>
        </li>
      </ul>
      <p v-if="!isHost && alternatives?.length" class="small muted mb-0 mt-2">Vote to swap and the host will see these options.</p>
    </AppDialog>

    <AppDialog :open="addOpen" title="Add a stop" wide @close="addOpen = false">
      <div class="d-flex flex-wrap gap-2 mb-3">
        <input v-model="query" class="form-control flex-grow-1" style="min-width: 200px; width: auto" placeholder="Search by name, area or interest" aria-label="Search places" />
        <select v-model="kindFilter" class="form-select" style="width: auto" aria-label="Kind">
          <option value="all">Everything</option>
          <option value="activity">Activities</option>
          <option value="meal">Meals</option>
        </select>
      </div>
      <ul class="add-list">
        <li v-for="l in addResults" :key="l.id" class="add-item" :class="{ open: previewFor === l.id }">
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex gap-2 align-items-center">
              <span class="tag" :class="TYPE_TONE[l.type]">{{ TYPE_LABEL[l.type] }}</span>
              <span v-if="shortlistIds.has(l.id)" class="tag tag-plum">Shortlisted</span>
            </div>
            <p class="alt-title">{{ l.title }}</p>
            <p class="small muted m-0">{{ areaLabel(l.area) }} · {{ l.priceText }}</p>
            <div v-if="previewFor === l.id && preview" class="mt-2">
              <p v-if="!previewIssues.length" class="small m-0 ok">Fits: {{ fmtTime(preview.stops[preview.stops.length - 1].start) }} to {{ fmtTime(preview.stops[preview.stops.length - 1].end) }}</p>
              <p v-for="iss in previewIssues" :key="iss.type" class="small text-danger m-0">{{ iss.message }}</p>
            </div>
          </div>
          <div class="d-flex flex-column gap-1">
            <button v-if="previewFor !== l.id" type="button" class="btn btn-ghost btn-sm" @click="check(l)">Check fit</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="addStop(l)">Add</button>
          </div>
        </li>
      </ul>
    </AppDialog>
  </div>
</template>

<style scoped>
.choice { height: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.choice h3 { margin: 4px 0 0; }
.choice p { margin: 0 0 8px; font-size: 0.93rem; }
.choice .btn { margin-top: auto; }
.stop-actions { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1.5px dashed var(--line); }
.votes { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.vote {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  font-weight: 700;
  font-size: 0.85rem;
}
.vote:hover { border-color: var(--ink-3); }
.vote.up[aria-pressed='true'] { background: var(--teal); border-color: var(--line-strong); color: var(--on-accent); }
.vote.down[aria-pressed='true'] { background: var(--tomato); border-color: var(--line-strong); color: var(--on-accent); }
.host-actions { display: flex; flex-wrap: wrap; gap: 2px; margin-left: auto; }
.host-actions .btn { --bs-btn-padding-x: 0.55rem; }
.side { position: sticky; top: calc(var(--header-h) + 16px); }
.reasons { margin: 0 0 10px; padding-left: 18px; }
.reasons li { margin-bottom: 4px; }
.alts, .add-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; max-height: 60vh; overflow: auto; }
.alt, .add-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px; border: 1.5px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.add-item.open { border-color: var(--line-strong); }
.alt-title { font-weight: 700; margin: 4px 0 2px; }
.ok { color: var(--teal); font-weight: 650; }
.min-w-0 { min-width: 0; }
</style>
