// Load data and reload it whenever the demo store changes (this tab or another).
import { ref, watch, onMounted } from 'vue'
import { revision } from '../api/store.js'

export function useLive(loader, { immediate = true } = {}) {
  const data = ref(null)
  const error = ref(null)
  // Start in the loading state so views do not render, then swap out, their content on mount.
  const loading = ref(immediate)
  let seq = 0

  async function reload() {
    const mine = ++seq
    loading.value = data.value == null
    try {
      const result = await loader()
      if (mine === seq) {
        data.value = result
        error.value = null
      }
    } catch (e) {
      if (mine === seq) error.value = e
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  watch(revision, reload)
  if (immediate) onMounted(reload)
  return { data, error, loading, reload }
}
