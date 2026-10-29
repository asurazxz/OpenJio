<script setup>
import { ref, computed, watch } from 'vue'
import { listDrafts, publishDraft, rejectDraft, unpublish, AREAS, INTERESTS } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { toast, toastError } from '../lib/toast.js'
import { fmtDay, fmtTime, toMs } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE, sourceLine } from '../lib/labels.js'
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
  'validity.timeWindows': 'opening hours',
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
  if (!window.confirm(`Reject "${d.title || 'this draft'}"? It will stay out of Discover.`)) return
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
  if (!window.confirm(`Unpublish "${p.title}"? It will disappear from Discover.`)) return
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
    area: '',
    address: d.outlets?.[0]?.address || d.outlets?.[0]?.name || '',
    category: CATEGORY_SLUGS.has(d.category) ? d.category : '',
    summary: d.summary || '',
    priceText: d.priceText || '',
    dealText: d.priceText || '',
    dateFrom: d.validity?.dateFrom || '',
    dateTo: d.validity?.dateTo || '',
    startsAt: localInput(d.startsAt),
    endsAt: localInput(d.endsAt),
  }
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
      validity: isDeal ? { ...(d.validity || {}), dateFrom: f.dateFrom || null, dateTo: f.dateTo || null } : d.validity,
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
                </div>
                <h3 class="draft-title">{{ p.title }}</h3>
                <p class="small muted m-0">{{ p.address }}</p>
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
.draft-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.card-x.draft { padding: 16px 18px; }
.draft-title { margin: 0 0 4px; font-size: 1.15rem; overflow-wrap: anywhere; }
.draft-summary { margin: 10px 0 12px; color: var(--ink-2); font-size: 0.93rem; overflow-wrap: anywhere; }
.draft-link { overflow-wrap: anywhere; }
.stat { display: flex; flex-direction: column; gap: 2px; height: 100%; padding: 14px 16px; }
.stat-n { font-family: var(--font-display); font-size: 1.7rem; line-height: 1.1; color: var(--ink); }
.chip-count { opacity: 0.75; font-weight: 600; }
</style>
