import { createClient } from '@supabase/supabase-js'
import { reactive } from 'vue'
import { revision } from './revision.js'
import { createHostedAdapter, ApiError } from './hosted-adapter.js'
// Docker supplies public configuration at runtime so changing ports/hostnames
// never requires rebuilding the bundle. Server credentials are never included.
let client, configuring
async function getClient() {
  if (client) return client
  if (!configuring) configuring = (async () => {
    try {
      const response = await fetch('/config.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('config unavailable')
      const runtime = await response.json()
      if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) throw new Error('config incomplete')
      const url = new URL(runtime.supabaseUrl, window.location.origin).href
      client = createClient(url, runtime.supabaseAnonKey)
      return client
    } catch {
      throw new ApiError('configuration', 'Unable to connect to OpenJio. Please check the server and try again.')
    } finally { configuring = null }
  })()
  return configuring
}
// Defer connection until initialization so a missing backend renders an account
// error instead of preventing the entire application module from loading.
const auth = Object.fromEntries(['getSession', 'signInWithPassword', 'signUp', 'signOut'].map(method => [
  method, async (...args) => (await getClient()).auth[method](...args),
]))
auth.onAuthStateChange = callback => client.auth.onAuthStateChange(callback)
const base = '/backend'
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
const api = createHostedAdapter({ auth, request, reactive, onRevision: () => { revision.value++ } })
api.providerToken = async () => {
  const { data, error } = await auth.getSession()
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
