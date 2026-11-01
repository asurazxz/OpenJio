import { toValue, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { confirmDialog } from '../lib/confirm.js'

export function useUnsavedChanges(dirty, message = 'Leave without saving your changes?') {
  onBeforeRouteLeave(() => !toValue(dirty) || confirmDialog({ title: 'Leave without saving?', message, confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true }))
  const unload = (event) => {
    if (!toValue(dirty)) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', unload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
}
