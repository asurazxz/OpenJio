<script setup>
import AppHeader from './components/AppHeader.vue'
import BottomNav from './components/BottomNav.vue'
import ToastHost from './components/ToastHost.vue'
import AppTour from './components/AppTour.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { startScrollReveal } from './lib/scrollReveal.js'

const mainEl = ref(null)
let stopReveal = null
onMounted(() => { stopReveal = startScrollReveal(mainEl.value) })
onBeforeUnmount(() => stopReveal?.())

// After a full page change (path, not filters or tabs) focus moves to the new page's h1 once it has
// entered, so keyboard and screen-reader users are not left in the old navigation. Not on first load.
const router = useRouter()
let pendingFocus = false
let pendingTimer
const stopAfter = router.afterEach((to, from, failure) => {
  if (failure || !from.matched.length || to.path === from.path) return
  pendingFocus = true
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => (pendingFocus = false), 3000)
})
onBeforeUnmount(() => { stopAfter(); clearTimeout(pendingTimer) })
function focusPage() {
  if (!pendingFocus) return
  pendingFocus = false
  clearTimeout(pendingTimer)
  // A dialog owns focus while it is open.
  if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]')) return
  const target = mainEl.value?.querySelector('h1') || mainEl.value
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <AppHeader />
  <main id="main" ref="mainEl" tabindex="-1">
    <RouterView v-slot="{ Component, route }">
      <Transition name="oj-page" mode="out-in" @after-enter="focusPage">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </main>
  <BottomNav />
  <ToastHost />
  <AppTour />
  <ConfirmHost />
</template>

<style>
#main:focus, #main h1[tabindex="-1"]:focus { outline: none; }
</style>
