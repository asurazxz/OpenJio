<script setup>
import { ref, computed } from 'vue'
import { currentUser, updateProfile, AREAS } from '../api/index.js'
import InterestPicker from '../components/InterestPicker.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { toast, toastError } from '../lib/toast.js'

// Order-independent snapshot of the editable fields, used to tell whether anything changed.
function snapshot(name, homeArea, weights) {
  const pairs = Object.keys(weights || {}).sort().map((k) => [k, weights[k]])
  return JSON.stringify([name || '', homeArea || '', pairs])
}
function snapshotOf(u) {
  return snapshot(u?.name, u?.homeArea, u?.interests)
}

const me = ref(currentUser())
const name = ref(me.value?.name || '')
const homeArea = ref(me.value?.homeArea || '')
const weights = ref({ ...(me.value?.interests || {}) })
const saved = ref(snapshotOf(me.value))
const saving = ref(false)
const nameInput = ref(null)

const nameError = computed(() => (name.value.trim() ? '' : 'Add a display name.'))
const dirty = computed(() => snapshot(name.value.trim(), homeArea.value, weights.value) !== saved.value)
const canSave = computed(() => dirty.value && !nameError.value && !saving.value)
const preview = computed(() => ({ ...me.value, name: name.value.trim() || me.value?.name }))

async function save() {
  if (nameError.value) {
    nameInput.value?.focus()
    return
  }
  if (!canSave.value) return
  saving.value = true
  try {
    const updated = await updateProfile({
      name: name.value.trim(),
      homeArea: homeArea.value || null,
      interests: { ...weights.value },
    })
    me.value = updated
    saved.value = snapshotOf(updated)
    toast('Profile saved')
  } catch (e) {
    toastError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page page-narrow">
    <header class="page-head profile-head">
      <UserAvatar v-if="me" :user="preview" :size="72" />
      <div>
        <p class="small-caps m-0">Account</p>
        <h1 class="m-0">Your profile</h1>
      </div>
    </header>

    <form v-if="me" class="card-x pop form-card" novalidate @submit.prevent="save">
      <div class="mb-4">
        <label for="pf-name" class="form-label">Display name</label>
        <input
          id="pf-name"
          ref="nameInput"
          v-model="name"
          class="form-control"
          :class="{ 'is-invalid': nameError }"
          maxlength="40"
          autocomplete="name"
          :aria-invalid="nameError ? 'true' : 'false'"
          :aria-describedby="nameError ? 'pf-name-error' : 'pf-name-help'"
        />
        <div v-if="nameError" id="pf-name-error" class="invalid-feedback d-block" role="alert">{{ nameError }}</div>
        <div v-else id="pf-name-help" class="form-text">This is how people you plan with see you.</div>
      </div>

      <div class="mb-4">
        <label for="pf-area" class="form-label">Home area</label>
        <select id="pf-area" v-model="homeArea" class="form-select" aria-describedby="pf-area-help">
          <option value="">Not set</option>
          <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
        </select>
        <div id="pf-area-help" class="form-text">Used as the default start area for plans made just for you.</div>
      </div>

      <div class="mb-4">
        <span id="pf-interests-label" class="form-label d-block">Your interests</span>
        <p id="pf-interests-help" class="form-text mt-0 mb-2">Tap once for like, twice for love, three times to clear.</p>
        <InterestPicker v-model="weights" weighted label="Your interests" aria-describedby="pf-interests-help" />
      </div>

      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 pt-2">
        <p class="small muted m-0">
          This is a demo account. Your interests are used to rank Discover and to balance group plans.
        </p>
        <button type="submit" class="btn btn-primary" :disabled="!canSave">
          <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          Save changes
        </button>
      </div>
    </form>

    <p v-else class="notice"><span>Sign in to see and edit your profile.</span></p>
  </div>
</template>

<style scoped>
.profile-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.form-card { padding: 22px; }
.form-card .form-text { margin-top: 4px; }
</style>
