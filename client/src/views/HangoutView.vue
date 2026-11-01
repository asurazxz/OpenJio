<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getHangout, previewHangout, setStage } from '../api/index.js'
import { toast, toastError } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import EditHangoutDialog from '../components/EditHangoutDialog.vue'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtDateKey } from '../lib/time.js'
import { STAGE_LABEL, interestLabel } from '../lib/labels.js'
import TimePanel from '../components/TimePanel.vue'
import PlanPanel from '../components/PlanPanel.vue'
import GoPanel from '../components/GoPanel.vue'
import MembersPanel from '../components/MembersPanel.vue'
import UserAvatar from '../components/UserAvatar.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const { data: detail, error, reload } = useLive(() => getHangout(route.params.id))
const editing = ref(false)
async function cancelHangout() {
  if (!(await confirmDialog({
    title: 'Cancel this hangout?',
    message: 'Everyone in it will see it as cancelled. Their availability and votes stay in the record, but no one can plan further.',
    confirmLabel: 'Cancel hangout',
    cancelLabel: 'Keep it',
    danger: true,
  }))) return
  try { await setStage(h.value.id, 'cancelled'); toast('Hangout cancelled') } catch (e) { toastError(e) }
}

const h = computed(() => detail.value?.hangout)

// Cancel is offered to the host only while the hangout is collecting or voting.
const canCancel = computed(() => ['collecting', 'voting'].includes(h.value?.stage))
// People control: a sticky pill that toggles a non-modal popover with the members and invite link.
const peopleWrap = ref(null)
const peopleBtn = ref(null)
const peopleClose = ref(null)
const peopleOpen = ref(false)
function closePeople(restoreFocus) {
  peopleOpen.value = false
  if (restoreFocus) peopleBtn.value?.focus()
}
watch(peopleOpen, async (open) => {
  if (!open) return
  await nextTick()
  peopleClose.value?.focus()
})
function onPointerDown(e) {
  if (peopleOpen.value && peopleWrap.value && !peopleWrap.value.contains(e.target)) peopleOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))

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
// Which hangout stage each tab belongs to. A tab is done when its stage comes before the hangout's
// current stage; a stage that is not among the tabs (ended, cancelled) marks every tab done.
const TAB_STAGE = { time: 'collecting', plan: 'voting', go: 'final' }
const currentTabIndex = computed(() => {
  const i = tabs.value.findIndex((t) => TAB_STAGE[t.key] === h.value?.stage)
  return i === -1 ? tabs.value.length : i
})
function phaseOf(i) {
  if (i < currentTabIndex.value) return 'done'
  if (i === currentTabIndex.value) return 'current'
  return 'upcoming'
}
const PHASE_TEXT = { done: 'Done', current: 'Current step', upcoming: 'Next step' }
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
async function go(t) {
  // The time panel can block this when free times are unsaved.
  const failure = await router.replace({ query: { ...route.query, tab: t, created: undefined } })
  if (!failure) tab.value = t
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
      <button v-if="!['forbidden', 'not_found'].includes(error.code)" type="button" class="btn btn-secondary" @click="reload">Try again</button>
      <RouterLink to="/" class="btn btn-secondary">Back to your plans</RouterLink>
    </EmptyState>

    <div v-else-if="!detail" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>

    <template v-else>
      <div v-if="h.mode !== 'solo'" class="people-rail">
        <div ref="peopleWrap" class="people-anchor" @keydown.esc="closePeople(true)">
          <button
            ref="peopleBtn"
            type="button"
            class="people-pill"
            :aria-label="`People: ${detail.members.length} going, show details and invite link`"
            aria-controls="people-popover"
            :aria-expanded="String(peopleOpen)"
            @click="peopleOpen = !peopleOpen"
          >
            <span class="people-faces" aria-hidden="true">
              <UserAvatar v-for="m in detail.members.slice(0, 5)" :key="m.userId" :user="m.user" :size="26" />
              <span v-if="detail.members.length > 5" class="people-more">+{{ detail.members.length - 5 }}</span>
            </span>
            <span class="people-count tnum" aria-hidden="true">{{ detail.members.length }} going</span>
            <svg class="people-chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <div v-if="peopleOpen" id="people-popover" class="people-pop" role="dialog" aria-label="People and invite link">
            <div class="people-pop-head">
              <h2 class="people-pop-title">People <span class="people-badge tnum">{{ detail.members.length }}<template v-if="h.capacity"> of {{ h.capacity }}</template></span></h2>
              <button ref="peopleClose" type="button" class="people-close" aria-label="Close" @click="closePeople(true)">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
              </button>
            </div>
            <MembersPanel :detail="detail" />
          </div>
        </div>
      </div>

      <header class="hhead">
        <div class="hhead-main" :class="{ 'has-people': h.mode !== 'solo' }">
          <div class="d-flex flex-wrap gap-2 mb-2 hhead-tags">
            <span class="tag" :class="{ 'tag-mustard': h.stage === 'collecting', 'tag-tomato': h.stage === 'voting', 'tag-teal': h.stage === 'final' }">{{ STAGE_LABEL[h.stage] }}</span>
            <span v-if="h.mode === 'solo'" class="tag">Solo plan</span>
            <span v-if="h.visibility === 'public'" class="tag tag-plum">Open jio</span>
          </div>
          <h1 class="m-0">{{ h.title }}</h1>
          <p class="sub tnum">{{ when }}, around {{ h.startArea.label }}</p>
          <p v-if="h.description" class="small muted m-0">{{ h.description }}</p>
          <div v-if="h.interests?.length" class="chip-row hhead-chips mt-2">
            <span v-for="i in h.interests" :key="i" class="tag">{{ interestLabel(i) }}</span>
          </div>
        </div>
      </header>

      <div v-if="h.myRole === 'host' && !['ended', 'cancelled'].includes(h.stage)" class="host-actions d-flex flex-wrap align-items-center gap-2 mb-3">
        <button type="button" class="btn btn-secondary host-btn" aria-label="Edit details" @click="editing = true">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" /></svg>
          <span>Edit</span>
        </button>
        <button v-if="canCancel" type="button" class="btn btn-secondary host-btn host-btn-danger" @click="cancelHangout">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          <span>Cancel hangout</span>
        </button>
      </div>
      <EditHangoutDialog :open="editing" :hangout="h" @close="editing = false" />

      <div v-if="justCreated && h.mode !== 'solo' && h.stage === 'collecting'" class="notice teal mb-3">
        <p><strong>Created.</strong> Share the invite link with your friends, then mark your own free times below.</p>
      </div>

      <div class="layout">
        <div class="main-col">
          <div class="tabs" data-tour="hangout-stages" role="tablist" aria-label="Hangout sections">
            <button
              v-for="(t, i) in tabs"
              :id="`tab-${t.key}`"
              :key="t.key"
              type="button"
              role="tab"
              class="tabbtn"
              :aria-selected="tab === t.key"
              :aria-controls="`panel-${t.key}`"
              :aria-describedby="`tab-${t.key}-phase`"
              :tabindex="tab === t.key ? 0 : -1"
              @click="go(t.key)"
              @keydown="onTabKey($event, i)"
            >
              <span class="tabmark" :class="phaseOf(i)" aria-hidden="true">
                <svg v-if="phaseOf(i) === 'done'" viewBox="0 0 16 16" width="12" height="12" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span>{{ t.label }}</span>
            </button>
          </div>
          <span
            v-for="(t, i) in tabs"
            :id="`tab-${t.key}-phase`"
            :key="`phase-${t.key}`"
            class="visually-hidden"
          >{{ PHASE_TEXT[phaseOf(i)] }}</span>
          <div :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`" class="panel">
            <TimePanel v-if="tab === 'time'" :detail="detail" @locked="go('plan')" />
            <PlanPanel v-else-if="tab === 'plan'" :detail="detail" @goto="go" />
            <GoPanel v-else-if="tab === 'go'" :detail="detail" @goto="go" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hhead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.sub { color: var(--ink-2); margin: 8px 0 4px; font-weight: 600; }
/* Sticky people control. The rail has zero height so it takes no space in the flow; the pill sits
   at the top right of the content and sticks below the app header while the page scrolls. */
.people-rail {
  position: sticky;
  top: calc(var(--header-h) + 12px);
  z-index: 30;
  height: 0;
  display: flex;
  justify-content: flex-end;
}
.people-anchor { position: relative; }
.people-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 14px 4px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  font-weight: 700;
  white-space: nowrap;
}
.people-pill { cursor: pointer; }
.people-pill:hover { background: var(--paper-2); border-color: var(--line-strong); }
.people-pill[aria-expanded='true'] { border-color: var(--tomato); }
.people-pill:focus-visible { outline: 2px solid var(--tomato); outline-offset: 2px; }
.people-chev { flex: 0 0 auto; color: var(--ink-2); transition: transform var(--oj-t-quick); }
.people-pill[aria-expanded='true'] .people-chev { transform: rotate(180deg); }
.people-faces { display: flex; align-items: center; }
.people-faces > * + * { margin-left: -8px; }
.people-more { margin-left: 6px !important; font-size: 0.8rem; font-weight: 800; color: var(--ink-2); }
.people-count { font-size: 0.9rem; }
.people-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1;
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - var(--header-h) - 80px);
  overflow-y: auto;
  padding: 16px 18px;
  transform-origin: top right;
  animation: people-pop-in 160ms ease-out;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop-lg);
  text-align: left;
  font-weight: 400;
  color: var(--ink);
}
.people-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.people-pop-title { display: flex; align-items: center; gap: 8px; margin: 0; font-family: var(--font-display); font-size: 1.05rem; font-weight: 800; }
.people-badge { padding: 2px 8px; border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font-size: 0.8rem; font-weight: 700; }
@keyframes people-pop-in { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .people-pop { animation: none; }
  .people-chev { transition: none; }
}
.people-close {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink-2);
}
.people-close:hover { color: var(--ink); background: var(--paper-2); }
.people-close:focus-visible { outline: 2px solid var(--tomato); outline-offset: 2px; }
.hhead-main.has-people { padding-right: 240px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; overflow-x: auto; scrollbar-width: none; }
.tabbtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  border-bottom: 3px solid transparent;
  min-height: 44px;
  padding: 10px 14px;
  margin-bottom: -1px;
  font-weight: 800;
  font-family: var(--font-display);
  color: var(--ink-2);
  transition: color var(--oj-t-quick), border-color var(--oj-t-quick);
  white-space: nowrap;
}
.tabbtn:hover { color: var(--ink); }
.tabbtn[aria-selected='true'] { color: var(--tomato-ink); border-bottom-color: var(--tomato); }
/* Phase marker: done = teal check, current = filled orange, upcoming = outlined. Selection is shown by the underline only. */
.tabmark {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  border: 1.5px solid var(--line-strong);
  color: var(--ink-2);
  background: transparent;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.tabmark.done { background: var(--teal-soft); border-color: var(--teal); color: var(--teal-ink); }
.tabmark.current { background: var(--tomato); border-color: var(--tomato); color: var(--on-accent); }
.layout { display: block; }
.main-col { min-width: 0; }
.hhead-main { min-width: 0; }

.host-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 168px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line-control, var(--line));
  border-radius: var(--radius);
  background: var(--card);
  color: var(--ink);
  font-weight: 700;
  white-space: nowrap;
}
.host-btn:hover { background: var(--paper-2); }
.host-btn:focus-visible { outline: 2px solid var(--tomato); outline-offset: 2px; }
.host-btn-danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.host-btn-danger:hover { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }

/* Compact header on phones */
@media (max-width: 575.98px) {
  .hhead { position: relative; margin-bottom: 14px; }
  .hhead-tags { margin-bottom: 6px !important; }
  .hhead-main.has-people { padding-right: 176px; }
  .people-pill { gap: 8px; padding-right: 12px; }
  .people-count { font-size: 0.85rem; }
  .hhead h1 { font-size: 1.5rem; line-height: 1.2; }
  .sub { margin: 4px 0 2px; font-size: 0.95rem; }
  .hhead-chips {
    flex-wrap: nowrap !important;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding-bottom: 2px;
  }
  .hhead-chips::-webkit-scrollbar { display: none; }
  .hhead-chips > * { flex-shrink: 0; }
  .host-actions { flex-wrap: nowrap; gap: 8px !important; margin-bottom: 12px !important; }
  .host-btn { flex: 1 1 0; min-width: 0; padding: 0 12px; }
  .tabbtn { gap: 6px; padding: 10px 10px; }
  .tabmark { width: 20px; height: 20px; font-size: 0.72rem; }
}
</style>
