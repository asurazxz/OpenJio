<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listUsers, signIn, signUp, session, isDemo } from '../api/index.js'
import UserAvatar from '../components/UserAvatar.vue'
import OpenJioWordmark from '../components/brand/OpenJioWordmark.vue'
import SteamDoodle from '../components/brand/SteamDoodle.vue'
import { interestLabel } from '../lib/labels.js'
import { toastError } from '../lib/toast.js'

const route = useRoute()
const router = useRouter()
const users = ref([])
const busy = ref(null)
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const confirmation = ref(false)
const creating = computed(() => route.query.mode === 'signup')
const nextPath = computed(() => typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : '/')
function changeMode() {
  error.value = ''
  confirmation.value = false
  router.replace({ query: { ...route.query, mode: creating.value ? undefined : 'signup' } })
}
async function submitAccount() {
  if (busy.value) return
  busy.value = 'account'
  error.value = ''
  try {
    if (creating.value) {
      const result = await signUp({ name: name.value, email: email.value, password: password.value })
      if (result.confirmationRequired) { confirmation.value = true; password.value = ''; return }
    } else await signIn({ email: email.value, password: password.value })
    await router.replace(nextPath.value)
  } catch (e) { error.value = e.message || 'Unable to sign in. Please try again.' }
  finally { busy.value = null }
}

onMounted(async () => {
  if (!isDemo) return
  try { users.value = await listUsers() } catch (e) { error.value = e.message || 'Unable to load demo accounts.' }
})

async function pick(u) {
  busy.value = u.id
  try {
    await signIn(u.id)
    await router.replace(nextPath.value)
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = null
  }
}
const topInterests = (u) => Object.entries(u.interests).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => interestLabel(k))
</script>

<template>
  <div class="page page-narrow">
    <div v-if="isDemo" class="hero">
      <SteamDoodle :size="88" />
      <h1>Jio makan? <OpenJioWordmark class="d-block mt-2" :size="34" :mark="false" /></h1>
      <p>Turn the group chat's "free this weekend?" into a real plan. OpenJio finds when everyone is free, then builds an outing that fits: places, deals and travel included.</p>
    </div>

    <section v-if="isDemo" class="card-x picker" aria-labelledby="who">
      <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-3">
        <h2 id="who" class="h3 m-0">Who are you today?</h2>
        <span class="small muted">Demo accounts. Open another tab to be someone else at the same time.</span>
      </div>
      <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
      <ul class="people">
        <li v-for="u in users" :key="u.id">
          <button type="button" class="person" :class="{ current: session.userId === u.id }" :disabled="busy !== null" @click="pick(u)">
            <UserAvatar :user="u" :size="44" />
            <span class="txt">
              <strong>{{ u.name }}</strong>
              <span class="small muted">{{ topInterests(u).join(', ') }}</span>
            </span>
            <span v-if="busy === u.id" class="spinner-border spinner-border-sm" aria-label="Signing in"></span>
            <span v-else-if="session.userId === u.id" class="tag tag-teal">Signed in</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-else class="card-x account-form" aria-labelledby="account-heading">
      <h1 id="account-heading">{{ creating ? 'Your next jio starts here.' : 'Welcome back.' }}</h1>
      <p class="muted">{{ creating ? 'Create an account to plan with friends and save your outings.' : 'Sign in to pick up your plans.' }}</p>
      <div v-if="confirmation" class="notice" role="status">
        <h2 class="h5">Check your email</h2>
        <p>Open the confirmation link sent to {{ email }}, then sign in to continue.</p>
        <button type="button" class="btn btn-secondary" @click="changeMode">Go to sign in</button>
      </div>
      <form v-else @submit.prevent="submitAccount">
        <p v-if="error || session.error" class="notice danger" role="alert">{{ error || session.error }}</p>
        <div v-if="creating" class="mb-3"><label for="account-name" class="form-label">Name</label><input id="account-name" v-model="name" class="form-control" autocomplete="name" maxlength="40" required :disabled="!!busy" /></div>
        <div class="mb-3"><label for="account-email" class="form-label">Email</label><input id="account-email" v-model="email" type="email" class="form-control" autocomplete="email" required :disabled="!!busy" /></div>
        <div class="mb-4"><label for="account-password" class="form-label">Password</label><input id="account-password" v-model="password" type="password" class="form-control" :autocomplete="creating ? 'new-password' : 'current-password'" :minlength="creating ? 8 : undefined" required :disabled="!!busy" /><p v-if="creating" class="form-text">Use at least 8 characters.</p></div>
        <button type="submit" class="btn btn-primary w-100" :disabled="!!busy">{{ busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in' }}</button>
        <button type="button" class="btn btn-ghost w-100 mt-2" :disabled="!!busy" @click="changeMode">{{ creating ? 'Already have an account? Sign in' : 'New here? Create an account' }}</button>
      </form>
    </section>
    <RouterLink to="/" class="back-to-landing">Back to OpenJio</RouterLink>
  </div>
</template>

<style scoped>
.account-form { max-width: 460px; margin: 30px auto 0; padding: 28px; }
.account-form h1 { font-size: 1.9rem; }
.back-to-landing { display: block; width: fit-content; margin: 24px auto 0; font-size: .9rem; }
.hero { text-align: center; padding: 20px 0 28px; }
.hero h1 { margin: 6px auto 10px; max-width: 16ch; font-size: clamp(2rem, 6vw, 2.8rem); }
.hero p { color: var(--ink-2); max-width: 46ch; margin: 0 auto; font-size: 1.05rem; }
.people { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.person {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  min-height: 64px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  text-align: left;
  color: var(--ink);
  cursor: pointer;
  transition: border-color var(--oj-t-quick), background-color var(--oj-t-quick);
}
.person:hover:not(:disabled) { border-color: var(--tomato); background: var(--tomato-soft); }
.person:active:not(:disabled) { transform: scale(0.98); }
.person.current { border-color: var(--teal); background: var(--teal-soft); }
.txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
@media (min-width: 576px) {
  .people { grid-template-columns: 1fr 1fr; }
}
</style>
