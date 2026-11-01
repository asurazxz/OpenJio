<script setup>
import { ref, computed, watch } from 'vue'
import { listDrafts, publishDraft, rejectDraft, unpublish, AREAS, INTERESTS } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { toast, toastError } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import { fmtDay, fmtTime, toMs } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE, sourceLine } from '../lib/labels.js'
import { hoursToEditor, hoursFromEditor } from '../lib/review.js'
import EmptyState from '../components/EmptyState.vue'
import AppDialog from '../components/AppDialog.vue'

const { data, error, loading, reload } = useLive(listDrafts)
const forbidden = computed(() => error.value?.code === 'forbidden')
const drafts = computed(() => data.value?.drafts || [])
const published = computed(() => data.value?.published || [])

const pendingList = computed(() => drafts.value.filter((d) => !d.review))
const rejectedList = computed(() => drafts.value.filter((d) => d.review?.status === 'rejected'))

const stats = computed(() => ({
  pending: pendingList.value.length,
  published: published.value.length,
  rejected: rejectedList.value.length,
  incomplete: pendingList.value.filter((d) => relevantUnknown(d).length).length,
}))
const statCards = computed(() => [
  { label: 'Pending', value: stats.value.pending, note: 'Waiting for a check' },
  { label: 'Published', value: stats.value.published, note: 'Live on Discover' },
  { label: 'Rejected', value: stats.value.rejected, note: 'Kept out of Discover' },
  { label: 'Missing fields', value: stats.value.incomplete, note: 'Pending drafts' },
])

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]
const filter = ref('pending')
const counts = computed(() => ({
  pending: stats.value.pending,
  published: stats.value.published,
  rejected: rejectedList.value.length,
  all: drafts.value.length,
}))
const shownDrafts = computed(() => {
  if (filter.value === 'pending') return pendingList.value
  if (filter.value === 'rejected') return rejectedList.value
  if (filter.value === 'all') return drafts.value
  return []
})

// Friendly words for fields the extractor could not fill.
const FIELD_WORDS = {
  title: 'title',
  merchant: 'merchant',
  summary: 'summary',
  category: 'category',
  priceText: 'price',
  outlets: 'address',
  'validity.dateFrom': 'dates',
  'validity.dateTo': 'dates',
  'validity.timeWindows': 'offer time windows',
  'validity.daysOfWeek': 'offer weekdays',
  openingHours: 'venue opening hours',
  lat: 'exact latitude',
  lng: 'exact longitude',
  durationMins: 'visit duration',
  startsAt: 'start time',
  endsAt: 'end time',
}
// Only fields that matter for the draft's type: events have no validity window, deals no start time.
function relevantUnknown(d) {
  return (d.unknownFields || []).filter((f) =>
    d.type === 'deal' ? !['startsAt', 'endsAt'].includes(f) : !f.startsWith('validity'),
  )
}
function missingWords(d) {
  const words = new Set(relevantUnknown(d).map((f) => FIELD_WORDS[f] || f.replace(/[._]/g, ' ')))
  return [...words]
}

function clip(text, max = 220) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text
}
function extractorLabel(d) {
  return d.extractor === 'gemini' ? 'AI extracted' : 'Pattern matched'
}
function postedText(d) {
  const ms = toMs(d.source?.postedAt)
  return ms ? `${fmtDay(ms)}, ${fmtTime(ms)}` : ''
}

const busyId = ref(null)

async function reject(d) {
  if (!(await confirmDialog({ title: 'Reject this draft?', message: `"${d.title || 'this draft'}" will stay out of Discover.`, confirmLabel: 'Reject', danger: true }))) return
  busyId.value = d.id
  try {
    await rejectDraft(d.id)
    toast('Draft rejected')
    await reload()
  } catch (e) {
    toastError(e)
  } finally {
    busyId.value = null
  }
}

async function removeListing(p) {
  if (!(await confirmDialog({ title: 'Unpublish this listing?', message: `"${p.title}" will disappear from Discover.`, confirmLabel: 'Unpublish', danger: true }))) return
  busyId.value = p.id
  try {
    await unpublish(p.id)
    toast('Listing unpublished')
    await reload()
  } catch (e) {
    toastError(e)
  } finally {
    busyId.value = null
  }
}

/* ---------------- Review dialog ---------------- */

const CATEGORY_SLUGS = new Set(INTERESTS.map((i) => i.slug))
const editing = ref(null)
const form = ref(blankForm())
const formError = ref('')
const publishing = ref(false)

function blankForm() {
  return {
    title: '',
    type: 'deal',
    kind: 'meal',
    merchant: '',
    area: '',
    address: '',
    category: '',
    summary: '',
    priceText: '',
    dealText: '',
    dateFrom: '',
    dateTo: '',
    startsAt: '',
    endsAt: '',
    lat: '', lng: '', durationMins: '', routeReady: false,
    openingDays: hoursToEditor(null), daysOfWeek: [], timeWindows: [],
    conditions: '', exclusions: '', conditionsNone: false, exclusionsNone: false,
  }
}

// Drafts carry Singapore offsets (+08:00), so the first 16 characters are the local wall-clock time.
function localInput(iso) {
  return iso ? iso.slice(0, 16) : ''
}
function isoFromLocal(value) {
  return value ? `${value}:00+08:00` : null
}

watch(
  () => form.value.type,
  (t) => {
    form.value.kind = t === 'event' ? 'activity' : 'meal'
  },
)

function openReview(d) {
  const isDeal = d.type !== 'event'
  editing.value = d
  formError.value = ''
  form.value = {
    title: d.title || '',
    type: isDeal ? 'deal' : 'event',
    kind: isDeal ? 'meal' : 'activity',
    merchant: d.merchant || '',
    area: d.area || '',
    address: d.outlets?.[0]?.address || d.outlets?.[0]?.name || '',
    category: CATEGORY_SLUGS.has(d.category) ? d.category : '',
    summary: d.summary || '',
    priceText: d.priceText || '',
    dealText: d.priceText || '',
    dateFrom: d.validity?.dateFrom || '',
    dateTo: d.validity?.dateTo || '',
    startsAt: localInput(d.startsAt),
    endsAt: localInput(d.endsAt),
    lat: d.lat ?? d.outlets?.[0]?.lat ?? '', lng: d.lng ?? d.outlets?.[0]?.lng ?? '',
    durationMins: d.durationMins ?? '', routeReady: false,
    openingDays: hoursToEditor(d.openingHours),
    daysOfWeek: [...(d.validity?.daysOfWeek || [])],
    timeWindows: (d.validity?.timeWindows || []).map((window) => ({ ...window })),
    conditions: (d.conditions || []).join('\n'), exclusions: (d.exclusions || []).join('\n'),
    conditionsNone: false, exclusionsNone: false,
  }
}

const REVIEW_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
function restrictionLines(value, checkedNone) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.length ? lines : checkedNone ? [] : null
}
function setHoursState(row) {
  if (row.state === 'open' && !row.windows.length) row.windows.push({ start: '', end: '' })
}

function closeReview() {
  if (publishing.value) return
  editing.value = null
}

async function publish() {
  const d = editing.value
  const f = form.value
  const isDeal = f.type === 'deal'
  formError.value = ''
  publishing.value = true
  try {
    await publishDraft({
      ...d,
      title: f.title.trim(),
      type: f.type,
      kind: f.kind,
      merchant: f.merchant.trim(),
      area: f.area,
      address: f.address.trim(),
      category: f.category,
      summary: f.summary.trim(),
      priceText: f.priceText.trim(),
      dealText: isDeal ? f.dealText.trim() : undefined,
      validity: isDeal ? { dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, daysOfWeek: f.daysOfWeek.length ? [...f.daysOfWeek] : null, timeWindows: f.timeWindows.length ? f.timeWindows.map((window) => ({ ...window })) : null } : null,
      lat: f.lat, lng: f.lng, durationMins: f.durationMins, routeReady: f.routeReady,
      openingHours: hoursFromEditor(f.openingDays),
      conditions: restrictionLines(f.conditions, f.conditionsNone),
      exclusions: restrictionLines(f.exclusions, f.exclusionsNone),
      startsAt: isDeal ? null : isoFromLocal(f.startsAt),
      endsAt: isDeal ? null : isoFromLocal(f.endsAt),
    })
    editing.value = null
    toast('Published to Discover')
    await reload()
  } catch (e) {
    formError.value = e?.message || 'Could not publish this listing. Try again.'
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Review listings</h1>
      <p>Drafts are extracted automatically from public posts and need a human check before anyone sees them.</p>
    </header>

    <EmptyState
      v-if="forbidden"
      title="Reviewers only"
      body="This page is for reviewers who check listings before they go live."
    />

    <template v-else>
      <div v-if="loading && !data" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
      <div v-else-if="error" class="notice danger" role="alert"><p>{{ error.message }}</p></div>

      <template v-else-if="data">
        <div v-if="data.serverError" class="notice mb-4" role="alert">
          <p>{{ data.serverError }} Start the server with <code>pnpm --dir server dev</code>, then reload this page.</p>
        </div>

        <section class="row g-2 mb-4" aria-label="Summary">
          <div v-for="s in statCards" :key="s.label" class="col-6 col-md-3">
            <div class="card-x stat">
              <span class="small-caps">{{ s.label }}</span>
              <strong class="stat-n">{{ s.value }}</strong>
              <span class="small muted">{{ s.note }}</span>
            </div>
          </div>
        </section>

        <div class="chip-row mb-4" role="group" aria-label="Show listings">
          <button
            v-for="f in FILTERS"
            :key="f.key"
            type="button"
            class="chip"
            :aria-pressed="filter === f.key ? 'true' : 'false'"
            @click="filter = f.key"
          >
            {{ f.label }} <span class="chip-count">{{ counts[f.key] }}</span>
          </button>
        </div>

        <section v-if="filter === 'published'" aria-label="Published listings">
          <ul v-if="published.length" class="draft-list">
            <li v-for="p in published" :key="p.id">
              <article class="card-x draft">
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <span class="tag" :class="TYPE_TONE[p.type] || 'tag-teal'">{{ TYPE_LABEL[p.type] || p.type }}</span>
                  <span class="tag" :class="p.routeReady === false ? 'tag-mustard' : 'tag-teal'">{{ p.routeReady === false ? 'Manual viewing only' : 'Available for planning' }}</span>
                </div>
                <h3 class="draft-title">{{ p.title }}</h3>
                <p class="small muted m-0">{{ p.address || 'Address unknown' }}</p>
                <p v-if="p.routeReady === false" class="small muted m-0">Missing details stay unknown. This listing cannot be added to an itinerary.</p>
                <p class="small muted m-0">{{ sourceLine(p) }}</p>
                <div class="d-flex justify-content-end mt-3">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="busyId === p.id"
                    @click="removeListing(p)"
                  >Unpublish<span class="visually-hidden"> {{ p.title }}</span></button>
                </div>
              </article>
            </li>
          </ul>
          <EmptyState
            v-else
            title="Nothing published yet"
            body="Publish a reviewed draft and it will show up here."
            tone="teal"
          />
        </section>

        <section v-else aria-label="Drafts">
          <ul v-if="shownDrafts.length" class="draft-list">
            <li v-for="d in shownDrafts" :key="d.id">
              <article class="card-x draft" :aria-labelledby="`d-${d.id}`">
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <span class="tag" :class="d.type === 'event' ? 'tag-plum' : 'tag-mustard'">{{ d.type === 'event' ? 'Event' : 'Deal' }}</span>
                  <span class="tag" :class="d.extractor === 'gemini' ? 'tag-teal' : null">{{ extractorLabel(d) }}</span>
                  <span v-if="d.review" class="tag">{{ d.review.status === 'published' ? 'Published' : 'Rejected' }}</span>
                </div>

                <h3 :id="`d-${d.id}`" class="draft-title">{{ d.title || 'Untitled' }}</h3>
                <p class="small m-0">{{ d.merchant || 'No merchant' }}</p>
                <p class="small muted m-0">
                  From {{ d.source?.name || 'unknown source' }}<template v-if="postedText(d)">, posted {{ postedText(d) }}</template>
                </p>
                <p v-if="d.source?.url" class="small m-0 draft-link">
                  <a :href="d.source.url" target="_blank" rel="noopener noreferrer">View original post</a>
                </p>

                <p v-if="d.summary" class="draft-summary">{{ clip(d.summary) }}</p>

                <div v-if="missingWords(d).length" class="d-flex flex-wrap gap-2 mb-3">
                  <span v-for="w in missingWords(d)" :key="w" class="tag tag-danger">Missing: {{ w }}</span>
                </div>

                <div v-if="!d.review" class="d-flex flex-wrap justify-content-end gap-2">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="busyId === d.id"
                    @click="reject(d)"
                  >Reject<span class="visually-hidden"> {{ d.title }}</span></button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="busyId === d.id"
                    @click="openReview(d)"
                  >Review<span class="visually-hidden"> {{ d.title }}</span></button>
                </div>
              </article>
            </li>
          </ul>
          <EmptyState
            v-else
            title="No drafts here"
            body="Nothing matches this filter right now."
            tone="teal"
          />
        </section>
      </template>
    </template>

    <AppDialog :open="!!editing" title="Review listing" wide @close="closeReview">
      <form v-if="editing" class="review-form" novalidate @submit.prevent="publish">

        <div class="mb-3">
          <label for="rv-title" class="form-label">Title</label>
          <input id="rv-title" v-model="form.title" class="form-control" maxlength="120" />
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="rv-type" class="form-label">Type</label>
            <select id="rv-type" v-model="form.type" class="form-select">
              <option value="deal">Deal</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="rv-kind" class="form-label">Kind</label>
            <select id="rv-kind" v-model="form.kind" class="form-select">
              <option value="meal">Meal</option>
              <option value="activity">Activity</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="rv-merchant" class="form-label">Merchant</label>
            <input id="rv-merchant" v-model="form.merchant" class="form-control" />
          </div>
          <div class="col-sm-6">
            <label for="rv-area" class="form-label">Area <span class="muted fw-normal">(required)</span></label>
            <select id="rv-area" v-model="form.area" class="form-select" required aria-required="true">
              <option value="">Choose an area</option>
              <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-8">
            <label for="rv-address" class="form-label">Address</label>
            <input id="rv-address" v-model="form.address" class="form-control" />
          </div>
          <div class="col-sm-4">
            <label for="rv-category" class="form-label">Category</label>
            <select id="rv-category" v-model="form.category" class="form-select">
              <option value="">None</option>
              <option v-for="i in INTERESTS" :key="i.slug" :value="i.slug">{{ i.label }}</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-4"><label for="rv-lat" class="form-label">Exact venue latitude</label><input id="rv-lat" v-model="form.lat" type="number" step="any" min="-90" max="90" class="form-control" /></div>
          <div class="col-sm-4"><label for="rv-lng" class="form-label">Exact venue longitude</label><input id="rv-lng" v-model="form.lng" type="number" step="any" min="-180" max="180" class="form-control" /></div>
          <div class="col-sm-4"><label for="rv-duration" class="form-label">Visit duration (minutes)</label><input id="rv-duration" v-model="form.durationMins" type="number" min="1" max="1440" step="1" class="form-control" /></div>
          <p class="form-text m-0 col-12">Leave unverified details blank. An area pin is not an exact venue location.</p>
        </div>
        <fieldset class="mb-3">
          <legend class="h6">Venue opening hours</legend>
          <p class="small muted">Only enter hours checked against the source. Unknown days stay unknown; choose Closed only when confirmed.</p>
          <div v-for="day in REVIEW_DAYS" :key="day" class="hours-row mb-2">
            <label :for="`rv-hours-${day}`" class="small">{{ day }}</label>
            <select :id="`rv-hours-${day}`" v-model="form.openingDays[day.toLowerCase()].state" class="form-select form-select-sm" @change="setHoursState(form.openingDays[day.toLowerCase()])"><option value="unknown">Unknown</option><option value="closed">Closed</option><option value="open">Open at these times</option></select>
            <div v-if="form.openingDays[day.toLowerCase()].state === 'open'" class="hours-windows">
              <div v-for="(window, index) in form.openingDays[day.toLowerCase()].windows" :key="index" class="d-flex gap-1 align-items-center">
                <input v-model="window.start" type="time" class="form-control form-control-sm" :aria-label="`${day} opening time ${index + 1}`" required />
                <span>to</span><input v-model="window.end" type="time" class="form-control form-control-sm" :aria-label="`${day} closing time ${index + 1}`" required />
                <button type="button" class="btn btn-ghost btn-sm" :aria-label="`Remove ${day} window ${index + 1}`" @click="form.openingDays[day.toLowerCase()].windows.splice(index, 1)">Remove</button>
              </div>
              <button type="button" class="btn btn-ghost btn-sm px-0" @click="form.openingDays[day.toLowerCase()].windows.push({ start: '', end: '' })">Add opening window</button>
            </div>
          </div>
        </fieldset>

        <div class="mb-3">
          <label for="rv-summary" class="form-label">Summary</label>
          <textarea id="rv-summary" v-model="form.summary" class="form-control" rows="3"></textarea>
        </div>

        <div class="mb-3">
          <label for="rv-price" class="form-label">Price</label>
          <input id="rv-price" v-model="form.priceText" class="form-control" />
        </div>

        <div v-if="form.type === 'deal'" class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="rv-from" class="form-label">Valid from</label>
            <input id="rv-from" v-model="form.dateFrom" type="date" class="form-control" />
          </div>
          <div class="col-sm-6">
            <label for="rv-to" class="form-label">Valid until</label>
            <input id="rv-to" v-model="form.dateTo" type="date" class="form-control" />
          </div>
          <fieldset class="col-12">
            <legend class="h6">Valid offer weekdays</legend>
            <div class="d-flex flex-wrap gap-3"><label v-for="day in REVIEW_DAYS" :key="day" class="small"><input v-model="form.daysOfWeek" type="checkbox" :value="day" class="form-check-input me-1" />{{ day }}</label></div>
            <p class="form-text">No checked days means unknown. Select all seven only if the source confirms daily validity.</p>
          </fieldset>
          <fieldset class="col-12">
            <legend class="h6">Valid offer time windows</legend>
            <div v-for="(window, index) in form.timeWindows" :key="index" class="d-flex gap-2 align-items-center mb-2">
              <input v-model="window.start" type="time" class="form-control" :aria-label="`Offer start ${index + 1}`" required /><span>to</span><input v-model="window.end" type="time" class="form-control" :aria-label="`Offer end ${index + 1}`" required />
              <button type="button" class="btn btn-ghost btn-sm" :aria-label="`Remove offer window ${index + 1}`" @click="form.timeWindows.splice(index, 1)">Remove</button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" @click="form.timeWindows.push({ start: '', end: '' })">Add offer window</button>
            <p class="form-text">No windows means unknown. For a verified all-day offer, enter 00:00 to 23:59. Offer validity and venue hours are checked separately.</p>
          </fieldset>
          <div class="col-12">
            <label for="rv-deal" class="form-label">Deal offer</label>
            <textarea id="rv-deal" v-model="form.dealText" class="form-control" rows="2"></textarea>
          </div>
        </div>

        <div v-else class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="rv-starts" class="form-label">Starts</label>
            <input id="rv-starts" v-model="form.startsAt" type="datetime-local" class="form-control" />
          </div>
          <div class="col-sm-6">
            <label for="rv-ends" class="form-label">Ends</label>
            <input id="rv-ends" v-model="form.endsAt" type="datetime-local" class="form-control" />
          </div>
          <p class="form-text m-0 col-12">Times are Singapore time (UTC+8).</p>
        </div>

        <div class="mb-3">
          <label for="rv-conditions" class="form-label">Conditions (one per line)</label>
          <textarea id="rv-conditions" v-model="form.conditions" class="form-control" rows="2"></textarea>
          <label class="small mt-1"><input v-model="form.conditionsNone" type="checkbox" class="form-check-input me-1" />Checked source: no additional conditions stated</label>
        </div>
        <div class="mb-3">
          <label for="rv-exclusions" class="form-label">Exclusions (one per line)</label>
          <textarea id="rv-exclusions" v-model="form.exclusions" class="form-control" rows="2"></textarea>
          <label class="small mt-1"><input v-model="form.exclusionsNone" type="checkbox" class="form-check-input me-1" />Checked source: no exclusions stated</label>
          <p class="form-text">Blank, unchecked restrictions remain unknown.</p>
        </div>
        <div class="notice mb-3">
          <label><input v-model="form.routeReady" type="checkbox" class="form-check-input me-2" />Make this listing available for itinerary planning</label>
          <p class="small mt-1">Requires exact venue coordinates, an address, category, duration, verified restrictions and opening hours or event times. Deals also need dates, weekdays and offer time windows. Otherwise it is published for manual viewing only, with missing information shown as unknown.</p>
        </div>
        <p class="small muted mb-4">
          The original post text is not stored here, so check the source before you publish.
          <a v-if="editing.source?.url" :href="editing.source.url" target="_blank" rel="noopener noreferrer">Open the source post</a>
        </p>

        <div v-if="formError" class="notice danger mb-3" role="alert"><p>{{ formError }}</p></div>
        <div class="d-flex justify-content-end gap-2 pt-1">
          <button type="button" class="btn btn-ghost" :disabled="publishing" @click="closeReview">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="publishing">
            <span v-if="publishing" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            Publish
          </button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.hours-row { display: grid; grid-template-columns: 44px minmax(130px, 1fr); gap: 8px; align-items: start; }
.hours-windows { grid-column: 2; }
.hours-windows .form-control { min-width: 0; }
.draft-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.card-x.draft { padding: 16px 18px; }
.draft-title { margin: 0 0 4px; font-size: 1.15rem; overflow-wrap: anywhere; }
.draft-summary { margin: 10px 0 12px; color: var(--ink-2); font-size: 0.93rem; overflow-wrap: anywhere; }
.draft-link { overflow-wrap: anywhere; }
.stat { display: flex; flex-direction: column; gap: 2px; height: 100%; padding: 14px 16px; }
.stat-n { font-family: var(--font-display); font-size: 1.7rem; line-height: 1.1; color: var(--ink); }
.chip-count { opacity: 0.75; font-weight: 600; }
</style>
