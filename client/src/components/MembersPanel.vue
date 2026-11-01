<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setRequired, leaveHangout, renewInvite } from '../api/index.js'
import { toast, toastError } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import UserAvatar from './UserAvatar.vue'

// Member list and invite link. It is rendered inside the hangout's people popover, which supplies
// the card, the "People" heading and the count, so this component draws no chrome of its own.
const props = defineProps({
  detail: { type: Object, required: true },
})
const router = useRouter()
const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const link = computed(() => `${window.location.origin}/j/${h.value.inviteToken}`)
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    toast('Copy failed. Select the link and copy it manually.', 'danger')
  }
}
async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: h.value.title, text: `Join "${h.value.title}" on OpenJio`, url: link.value })
    } catch {
      /* dismissed */
    }
  } else copy()
}
async function toggleRequired(m) {
  try {
    await setRequired(h.value.id, m.userId, !m.required)
  } catch (e) {
    toastError(e)
  }
}
async function leave() {
  if (!(await confirmDialog({
    title: 'Leave this hangout?',
    message: 'Your availability and votes will be removed.',
    confirmLabel: 'Leave',
    danger: true,
  }))) return
  try {
    await leaveHangout(h.value.id)
    toast('You left the hangout')
    router.push('/')
  } catch (e) {
    toastError(e)
  }
}
async function renew() {
  if (!(await confirmDialog({
    title: 'Make a new invite link?',
    message: 'The old link will stop working.',
    confirmLabel: 'Make new link',
  }))) return
  try {
    await renewInvite(h.value.id)
    toast('New invite link ready')
  } catch (e) {
    toastError(e)
  }
}
const canInvite = computed(() => h.value.mode !== 'solo' && !['ended', 'cancelled'].includes(h.value.stage))
</script>

<template>
  <div class="mp">
    <ul class="people">
      <li v-for="m in detail.members" :key="m.userId" class="p">
        <UserAvatar :user="m.user" :size="32" />
        <div class="p-txt">
          <span class="p-name">{{ m.user.name }}<span v-if="m.userId === detail.me.userId" class="muted"> (you)</span></span>
          <span class="small muted">
            {{ m.role === 'host' ? 'Host' : m.required ? 'Required' : 'Optional' }}<template v-if="h.stage === 'collecting'">, {{ m.respondedAt ? 'replied' : 'not replied' }}</template>
          </span>
        </div>
        <button
          v-if="isHost && m.role !== 'host' && h.stage === 'collecting'"
          type="button"
          class="btn btn-ghost btn-sm p-req"
          :aria-label="`${m.required ? 'Make optional' : 'Make required'}: ${m.user.name}`"
          @click="toggleRequired(m)"
        >{{ m.required ? 'Make optional' : 'Make required' }}</button>
      </li>
    </ul>
    <template v-if="canInvite && (isHost || h.visibility === 'private')">
      <hr class="divider my-3" />
      <label for="invite" class="small-caps d-block mb-1">Invite link</label>
      <div class="invite">
        <input id="invite" class="form-control form-control-sm" :value="link" readonly @focus="$event.target.select()" />
        <button type="button" class="btn btn-secondary btn-sm" @click="share">{{ copied ? 'Copied' : 'Share' }}</button>
      </div>
      <p class="small muted mt-1 mb-0">People sign in to join. The link shows only the name, time and who is going.</p>
      <button v-if="isHost" type="button" class="btn btn-ghost btn-sm px-0 mt-1" @click="renew">Make a new link</button>
    </template>
    <button v-if="!isHost" type="button" class="btn btn-ghost btn-sm px-0 mt-2 text-danger" @click="leave">Leave hangout</button>
  </div>
</template>

<style scoped>
.people { list-style: none; padding: 0; margin: 0; }
.p { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.p + .p { border-top: 1px solid var(--line); }
.p-txt { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.3; }
.p-name { font-weight: 600; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-req { margin-left: auto; flex: 0 0 auto; white-space: nowrap; padding-right: 4px; }
.invite { display: flex; align-items: center; gap: 6px; }
.invite .form-control { flex: 1 1 auto; min-width: 0; }
.invite .btn { flex: 0 0 auto; }
</style>
