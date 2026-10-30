import { createClient } from '@supabase/supabase-js'
import { reactive } from 'vue'
import { revision } from './store.js'
import { createHostedAdapter, ApiError } from './hosted-adapter.js'
const env = import.meta.env || {}
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
const base = (env.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '')
if (!url || !key) throw new ApiError('configuration', 'Shared accounts require the OpenJio Supabase URL and publishable key.')
const client = createClient(url, key)
async function request(operation, args, token) {
  let response
  try {
    response = await fetch(`${base}/api/app/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ args }), signal: AbortSignal.timeout(45000),
    })
  } catch { throw new ApiError('unavailable', 'The shared planning service is unavailable. Please try again.') }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.error || 'unavailable', body.message || 'The request could not be completed.')
  return body.result
}
const api = createHostedAdapter({ auth: client.auth, request, reactive, onRevision: () => { revision.value++ } })
api.providerToken = async () => {
  const { data, error } = await client.auth.getSession()
  if (error) throw new ApiError('auth', 'Please sign in again.')
  return data.session?.access_token || null
}
// Periodic invalidation makes other devices' accepted writes visible without
// granting Realtime access to private planner inputs.
if (typeof window !== 'undefined') {
  window.setInterval(() => { if (api.session.userId && !document.hidden) revision.value++ }, 15000)
  window.addEventListener('focus', () => { revision.value++ })
}
export default api
