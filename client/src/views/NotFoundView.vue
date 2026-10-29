<script setup>
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <div class="page page-narrow not-found">
    <h1 class="visually-hidden">Page not found</h1>
    <EmptyState
      title="We could not find that page"
      body="The link may be out of date, or the page has moved. Try one of these instead."
      tone="tomato"
    >
      <RouterLink to="/" class="btn btn-primary">Go to your plans</RouterLink>
      <RouterLink to="/discover" class="btn btn-secondary">Browse Discover</RouterLink>
    </EmptyState>
  </div>
</template>

<style scoped>
.not-found { padding-top: 12vh; }
</style>
