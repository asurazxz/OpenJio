import { getProviderToken } from '../api/index.js'

const base = (import.meta.env?.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '')

async function request(path, params, signal) {
  let response
  try {
    const token = await getProviderToken()
    response = await fetch(`${base}/api/places/${path}?${new URLSearchParams(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Place search could not be reached. Try again or enter the place manually.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Place search is unavailable. You can enter the place manually.')
  return data
}

export const searchPlaces = (q, signal) => request('search', { q }, signal)
export const placeDetails = (id, signal) => request('details', { id }, signal)

