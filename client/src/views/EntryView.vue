<script setup>
import { defineAsyncComponent } from 'vue'
import { session } from '../api/index.js'
import LandingView from './LandingView.vue'

const HomeView = defineAsyncComponent(() => import('./HomeView.vue'))
</script>

<template>
  <HomeView v-if="session.userId" />
  <LandingView v-else />
</template>
