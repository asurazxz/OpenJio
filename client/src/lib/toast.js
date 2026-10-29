// Tiny global toast queue.
import { reactive } from 'vue'

export const toasts = reactive([])
let n = 0

export function toast(message, tone = 'default', ms = 3200) {
  const id = ++n
  toasts.push({ id, message, tone })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i !== -1) toasts.splice(i, 1)
  }, ms)
}

export function toastError(err) {
  toast(err?.message || 'Something went wrong. Try again.', 'danger', 4500)
}
