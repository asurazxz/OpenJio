import { toValue, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChanges(dirty, message = 'Leave without saving your changes?') {
  onBeforeRouteLeave(() => !toValue(dirty) || window.confirm(message))
  const unload = (event) => {
    if (!toValue(dirty)) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', unload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
}
