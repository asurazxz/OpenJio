<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getHangout, previewHangout } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtDateKey } from '../lib/time.js'
import { STAGE_LABEL, interestLabel } from '../lib/labels.js'
import StageSteps from '../components/StageSteps.vue'
import TimePanel from '../components/TimePanel.vue'
import PlanPanel from '../components/PlanPanel.vue'
import GoPanel from '../components/GoPanel.vue'
import MembersPanel from '../components/MembersPanel.vue'
import UserAvatar from '../components/UserAvatar.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const { data: detail, error } = useLive(() => getHangout(route.params.id))

const h = computed(() => detail.value?.hangout)

// Non-members opening a public hangout get the open jio preview instead of an error.
watch(error, async (e) => {
  if (e?.code !== 'forbidden') return
  try {
    await previewHangout({ id: route.params.id })
    router.replace(`/o/${route.params.id}`)
  } catch {
    /* private: keep the error */
  }
})
const fixedTime = computed(() => h.value && (h.value.mode === 'solo' || h.value.visibility === 'public'))

const tabs = computed(() => {
  const t = []
  if (!fixedTime.value) t.push({ key: 'time', label: 'Time' })
  t.push({ key: 'plan', label: 'Plan' })
  t.push({ key: 'go', label: h.value?.mode === 'solo' ? 'On the day' : 'On the day' })
  return t
})
const defaultTab = () => {
  if (!h.value) return 'plan'
  if (h.value.stage === 'collecting') return 'time'
  if (h.value.stage === 'final' || h.value.stage === 'ended') return 'go'
  return 'plan'
}
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : null)
watch(
  () => h.value?.stage,
  (s, prev) => {
    if (!tab.value || (prev && s !== prev)) tab.value = defaultTab()
  },
)
function go(t) {
  tab.value = t
  router.replace({ query: { ...route.query, tab: t, created: undefined } })
}
const justCreated = computed(() => route.query.created === '1')

const when = computed(() => {
  if (!h.value) return ''
  if (h.value.lockedSlot) return fmtRange(h.value.lockedSlot.start, h.value.lockedSlot.end)
  return h.value.dateFrom === h.value.dateTo ? fmtDateKey(h.value.dateFrom) : `${fmtDateKey(h.value.dateFrom)} to ${fmtDateKey(h.value.dateTo)}`
})

function onTabKey(e, i) {
  const n = tabs.value.length
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const next = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n
    go(tabs.value[next].key)
    document.getElementById(`tab-${tabs.value[next].key}`)?.focus()
  }
}
</script>

<template>
  <div class="page">
    <EmptyState v-if="error" :title="error.code === 'forbidden' ? 'This hangout is private' : 'Hangout not found'" :body="error.message" tone="tomato">
      <RouterLink to="/" class="btn btn-secondary">Back to your plans</RouterLink>
    </EmptyState>

    <div v-else-if="!detail" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>

    <template v-else>
      <header class="hhead">
        <div class="hhead-main">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <span class="tag" :class="{ 'tag-mustard': h.stage === 'collecting', 'tag-tomato': h.stage === 'voting', 'tag-teal': h.stage === 'final' }">{{ STAGE_LABEL[h.stage] }}</span>
            <span v-if="h.mode === 'solo'" class="tag">Solo plan</span>
            <span v-if="h.visibility === 'public'" class="tag tag-plum">Open jio</span>
          </div>
          <h1 class="m-0">{{ h.title }}</h1>
          <p class="sub">{{ when }} · from {{ h.startArea.label }}</p>
          <p v-if="h.description" class="small muted m-0">{{ h.description }}</p>
          <div v-if="h.interests?.length" class="chip-row mt-2">
            <span v-for="i in h.interests" :key="i" class="tag">{{ interestLabel(i) }}</span>
          </div>
        </div>
        <div v-if="h.mode !== 'solo'" class="faces" :aria-label="`${detail.members.length} people`">
          <UserAvatar v-for="m in detail.members.slice(0, 5)" :key="m.userId" :user="m.user" :size="34" ring />
          <span v-if="detail.members.length > 5" class="more">+{{ detail.members.length - 5 }}</span>
        </div>
      </header>

      <div v-if="justCreated && h.mode !== 'solo' && h.stage === 'collecting'" class="notice teal mb-3">
        <p><strong>Created.</strong> Share the invite link with your friends, then mark your own free times below.</p>
      </div>

      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <StageSteps :stage="h.stage" :skip-time="fixedTime" />
      </div>

      <div class="layout">
        <div class="main-col">
          <div class="tabs" role="tablist" aria-label="Hangout sections">
            <button
              v-for="(t, i) in tabs"
              :id="`tab-${t.key}`"
              :key="t.key"
              type="button"
              role="tab"
              class="tabbtn"
              :aria-selected="tab === t.key"
              :aria-controls="`panel-${t.key}`"
              :tabindex="tab === t.key ? 0 : -1"
              @click="go(t.key)"
              @keydown="onTabKey($event, i)"
            >{{ t.label }}</button>
          </div>
          <div :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`" class="panel">
            <TimePanel v-if="tab === 'time'" :detail="detail" @locked="go('plan')" />
            <PlanPanel v-else-if="tab === 'plan'" :detail="detail" @goto="go" />
            <GoPanel v-else-if="tab === 'go'" :detail="detail" @goto="go" />
          </div>
        </div>
        <aside v-if="h.mode !== 'solo'" class="side-col">
          <MembersPanel :detail="detail" />
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hhead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.sub { color: var(--ink-2); margin: 8px 0 4px; font-weight: 550; }
.faces { display: flex; align-items: center; }
.faces > * + * { margin-left: -8px; }
.more { margin-left: 4px !important; font-size: 0.85rem; font-weight: 700; color: var(--ink-2); }
.tabs { display: flex; gap: 4px; border-bottom: 1.5px solid var(--line); margin-bottom: 20px; overflow-x: auto; }
.tabbtn {
  background: none;
  border: 0;
  border-bottom: 3px solid transparent;
  padding: 10px 14px;
  margin-bottom: -1.5px;
  font-weight: 700;
  color: var(--ink-3);
  white-space: nowrap;
}
.tabbtn:hover { color: var(--ink); }
.tabbtn[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--tomato); }
.layout { display: grid; gap: 24px; }
.main-col { min-width: 0; }
@media (min-width: 1100px) {
  .layout { grid-template-columns: minmax(0, 1fr) 280px; }
  .side-col { padding-top: 56px; }
}
</style>
