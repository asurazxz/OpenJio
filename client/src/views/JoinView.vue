<script setup>
// Invite link (/j/:token) and open jio (/o/:id) landing page. Shows only a safe preview.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { previewHangout, joinHangout, session } from '../api/index.js'
import { fmtRange, fmtDateKey } from '../lib/time.js'
import { interestLabel } from '../lib/labels.js'
import { toast, toastError } from '../lib/toast.js'
import EmptyState from '../components/EmptyState.vue'
import JioSlip from '../components/brand/JioSlip.vue'
import SteamDoodle from '../components/brand/SteamDoodle.vue'

const route = useRoute()
const router = useRouter()
const params = computed(() => (route.params.token ? { token: route.params.token } : { id: route.params.id }))
const p = ref(null)
const error = ref(null)
const joining = ref(false)

onMounted(async () => {
  try {
    p.value = await previewHangout(params.value)
  } catch (e) {
    error.value = e
  }
})

const when = computed(() => {
  if (!p.value) return ''
  if (p.value.lockedSlot) return fmtRange(p.value.lockedSlot.start, p.value.lockedSlot.end)
  return `Sometime between ${fmtDateKey(p.value.dateFrom)} and ${fmtDateKey(p.value.dateTo)}`
})
const status = computed(() => {
  if (!p.value) return null
  if (over.value) return { tone: '', text: 'This hangout is over' }
  if (p.value.stage === 'collecting') return { tone: 'tag-mustard', text: 'Time still being decided' }
  if (p.value.stage === 'voting') return { tone: 'tag-tomato', text: 'Plan being voted on' }
  if (p.value.stage === 'final') return { tone: 'tag-teal', text: 'Plan confirmed' }
  return null
})
const spotsLeft = computed(() => (p.value?.capacity ? Math.max(0, p.value.capacity - p.value.memberCount) : null))
const full = computed(() => p.value && p.value.memberCount >= (p.value.capacity || 8))
const over = computed(() => p.value && ['ended', 'cancelled'].includes(p.value.stage))

async function join() {
  if (!session.userId) {
    router.push({ name: 'signin', query: { next: route.fullPath } })
    return
  }
  joining.value = true
  try {
    const r = await joinHangout(params.value)
    if (!r.already) toast(`You're in. Welcome to ${p.value.title}.`)
    router.replace(`/h/${r.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="page page-narrow join-page">
    <EmptyState v-if="error" title="This link does not work" :body="error.message" tone="tomato">
      <RouterLink to="/discover?type=hangout" class="btn btn-secondary">Browse open jios</RouterLink>
    </EmptyState>
    <div v-else-if="!p" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <template v-else>
      <p class="lead-in">{{ p.host }} {{ p.visibility === 'public' ? 'is hosting an open jio' : 'is jio-ing you' }}. You in?</p>
      <JioSlip :label="p.visibility === 'public' ? 'OPEN JIO' : 'INVITED'" :tone="p.visibility === 'public' ? 'teal' : 'orange'" rise>
        <div class="t-head">
          <div class="min-w-0">
            <h1 class="t-title">{{ p.title }}</h1>
            <p class="t-host">Hosted by {{ p.host }}</p>
          </div>
          <SteamDoodle class="t-art" :size="64" />
        </div>
        <p v-if="p.description" class="t-desc">{{ p.description }}</p>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <span v-if="status" class="tag" :class="status.tone">{{ status.text }}</span>
          <span v-if="spotsLeft != null" class="tag tnum" :class="spotsLeft ? 'tag-teal' : ''">{{ spotsLeft ? `${spotsLeft} of ${p.capacity} spots left` : 'Full' }}</span>
        </div>
        <dl class="t-facts">
          <div><dt>When</dt><dd class="tnum">{{ when }}</dd></div>
          <div><dt>Start</dt><dd>Around {{ p.startArea.label }}</dd></div>
          <div><dt>Going</dt><dd>{{ p.memberNames.join(', ') }}</dd></div>
          <div v-if="p.interests?.length"><dt>Vibe</dt><dd>{{ p.interests.map(interestLabel).join(', ') }}</dd></div>
        </dl>
        <template #stub>
          <div class="t-actions">
            <RouterLink v-if="p.alreadyMember" :to="`/h/${p.id}`" class="btn btn-primary">Open the plan</RouterLink>
            <template v-else>
              <p v-if="over" class="m-0 muted">This hangout is over.</p>
              <p v-else-if="full" class="m-0 muted">This one is full. Check Discover for others.</p>
              <button v-else type="button" class="btn btn-primary" :disabled="joining" @click="join">
                <span v-if="joining" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                {{ session.userId ? (p.lockedSlot ? 'Join this jio' : 'Join and add my free times') : 'Sign in to join' }}
              </button>
            </template>
            <RouterLink to="/discover" class="btn btn-ghost">Not now</RouterLink>
          </div>
          <p class="small muted mt-3 mb-0">Joining shares your name with the group. Your free times are only shown as totals.</p>
        </template>
      </JioSlip>
    </template>
  </div>
</template>

<style scoped>
.join-page { padding-top: 40px; }
.lead-in { font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; color: var(--ink-2); margin: 0 0 22px; }
.t-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.min-w-0 { min-width: 0; }
.t-art { flex: none; margin-top: -6px; }
.t-title { margin: 0; overflow-wrap: anywhere; }
.t-host { color: var(--ink-2); margin: 6px 0 12px; font-weight: 600; }
.t-desc { margin: 0 0 14px; }
.t-facts { display: grid; gap: 8px; margin: 0; }
.t-facts div { display: grid; grid-template-columns: 64px 1fr; gap: 12px; }
dt { font-size: 0.85rem; font-weight: 700; color: var(--ink-2); padding-top: 1px; }
dd { margin: 0; font-weight: 600; }
.t-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
