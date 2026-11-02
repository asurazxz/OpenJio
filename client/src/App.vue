<script setup>
import AppHeader from './components/AppHeader.vue'
import BottomNav from './components/BottomNav.vue'
import ToastHost from './components/ToastHost.vue'
import AppTour from './components/AppTour.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { startScrollReveal } from './lib/scrollReveal.js'

const mainEl = ref(null)
let stopReveal = null
onMounted(() => { stopReveal = startScrollReveal(mainEl.value) })
onBeforeUnmount(() => stopReveal?.())
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <AppHeader />
  <main id="main" ref="mainEl" tabindex="-1">
    <RouterView v-slot="{ Component, route }">
      <Transition name="oj-page" mode="out-in">
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
#main:focus { outline: none; }
</style>
