<script setup>
// Invite link (/j/:token) and open jio (/o/:id) landing page. Shows only a safe preview.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { previewHangout, joinHangout, session } from '../api/index.js'
import { fmtRange, fmtDateKey } from '../lib/time.js'
import { interestLabel } from '../lib/labels.js'
import { toast, toastError } from '../lib/toast.js'
import EmptyState from '../components/EmptyState.vue'
import BrandMark from '../components/BrandMark.vue'

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
  <div class="page page-narrow">
    <EmptyState v-if="error" title="This link does not work" :body="error.message" tone="tomato">
      <RouterLink to="/discover" class="btn btn-secondary">Browse open jios</RouterLink>
    </EmptyState>
    <div v-else-if="!p" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <article v-else class="ticket card-x pop">
      <div class="t-top">
        <BrandMark :size="36" />
        <span class="small-caps">{{ p.visibility === 'public' ? 'Open jio' : "You're invited" }}</span>
      </div>
      <h1 class="t-title">{{ p.title }}</h1>
      <p class="t-host">Hosted by {{ p.host }}</p>
      <p v-if="p.description" class="t-desc">{{ p.description }}</p>
      <dl class="t-facts">
        <div><dt>When</dt><dd>{{ when }}</dd></div>
        <div><dt>Starting from</dt><dd>{{ p.startArea.label }}</dd></div>
        <div><dt>Going</dt><dd>{{ p.memberNames.join(', ') }}<template v-if="p.capacity"> ({{ p.memberCount }} of {{ p.capacity }})</template></dd></div>
      </dl>
      <div v-if="p.interests?.length" class="chip-row mb-3">
        <span v-for="i in p.interests" :key="i" class="tag">{{ interestLabel(i) }}</span>
      </div>
      <div class="t-perf" aria-hidden="true"></div>
      <div class="t-actions">
        <RouterLink v-if="p.alreadyMember" :to="`/h/${p.id}`" class="btn btn-primary">Open the plan</RouterLink>
        <template v-else>
          <p v-if="over" class="m-0 muted">This hangout is over.</p>
          <p v-else-if="full" class="m-0 muted">This one is full. Check Discover for others.</p>
          <button v-else type="button" class="btn btn-primary" :disabled="joining" @click="join">
            {{ session.userId ? (p.lockedSlot ? 'Join' : 'Join and add my free times') : 'Sign in to join' }}
          </button>
        </template>
        <RouterLink to="/discover" class="btn btn-ghost">Not now</RouterLink>
      </div>
      <p class="small muted mt-3 mb-0">Joining shares your name with the group. Your free times are only shown as totals.</p>
    </article>
  </div>
</template>

<style scoped>
.ticket { padding: 26px 24px; background: var(--card); position: relative; }
.t-top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.t-title { margin: 0; }
.t-host { color: var(--ink-2); margin: 6px 0 12px; font-weight: 550; }
.t-desc { margin: 0 0 14px; }
.t-facts { display: grid; gap: 10px; margin: 0 0 16px; }
.t-facts div { display: grid; grid-template-columns: 120px 1fr; gap: 10px; }
dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); padding-top: 3px; }
dd { margin: 0; font-weight: 600; }
.t-perf { border-top: 2px dashed var(--line); margin: 18px -24px; position: relative; }
.t-perf::before, .t-perf::after {
  content: '';
  position: absolute;
  top: -12px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--paper);
  border: 1.5px solid var(--line-strong);
}
.t-perf::before { left: -12px; clip-path: inset(0 0 0 50%); }
.t-perf::after { right: -12px; clip-path: inset(0 50% 0 0); }
.t-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
@media (max-width: 420px) {
  .t-facts div { grid-template-columns: 1fr; gap: 0; }
}
</style>
