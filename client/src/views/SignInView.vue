<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listUsers, signIn, session } from '../api/index.js'
import UserAvatar from '../components/UserAvatar.vue'
import BrandMark from '../components/BrandMark.vue'
import { interestLabel } from '../lib/labels.js'
import { toastError } from '../lib/toast.js'

const route = useRoute()
const router = useRouter()
const users = ref([])
const busy = ref(null)

onMounted(async () => {
  users.value = await listUsers()
})

async function pick(u) {
  busy.value = u.id
  try {
    await signIn(u.id)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
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
    <div class="hero">
      <BrandMark :size="56" />
      <h1>Plans that work for the whole group.</h1>
      <p>OpenJio finds when everyone is free, then builds an outing that fits: places, deals and travel included.</p>
    </div>

    <section class="card-x pop picker" aria-labelledby="who">
      <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-3">
        <h2 id="who" class="h3 m-0">Who are you today?</h2>
        <span class="small muted">Demo accounts. Open another tab to be someone else at the same time.</span>
      </div>
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
  </div>
</template>

<style scoped>
.hero { text-align: center; padding: 20px 0 28px; }
.hero h1 { margin: 16px auto 10px; max-width: 16ch; }
.hero p { color: var(--ink-2); max-width: 46ch; margin: 0 auto; font-size: 1.05rem; }
.people { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.person {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  text-align: left;
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.12s, transform 0.12s var(--ease);
}
.person:hover:not(:disabled) { border-color: var(--line-strong); transform: translateX(2px); }
.person.current { border-color: var(--teal); }
.txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
@media (min-width: 576px) {
  .people { grid-template-columns: 1fr 1fr; }
}
</style>
