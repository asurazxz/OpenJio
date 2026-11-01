<script setup>
import AppHeader from './components/AppHeader.vue'
import BottomNav from './components/BottomNav.vue'
import ToastHost from './components/ToastHost.vue'
import AppTour from './components/AppTour.vue'
import ConfirmHost from './components/ConfirmHost.vue'
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <AppHeader />
  <main id="main" tabindex="-1">
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.path" />
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
