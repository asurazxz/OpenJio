// In-memory runtime for isolated domain tests; never imported by the application.
import { reactive } from 'vue'
import * as store from './demo-store.js'
import { travelFn, prefetchLegs, fetchDrafts, fetchPlaces } from '../../src/lib/travel.js'
import { createApiEngine } from '../../src/api/engine.js'
// Last successful live place list, so saved plans still resolve after a reload or when the server is down.
const PLACES_KEY = 'openjio:places:v1'
const placesStorage = {
  read() {
    try { return JSON.parse(globalThis.localStorage.getItem(PLACES_KEY) || 'null') } catch { return null }
  },
  write(places) {
    try { globalThis.localStorage.setItem(PLACES_KEY, JSON.stringify(places)) } catch { /* storage unavailable */ }
  },
}
const api = createApiEngine({ ...store, reactive, travelFn, prefetchLegs, fetchDrafts, fetchPlaces, placesStorage })
export default api
