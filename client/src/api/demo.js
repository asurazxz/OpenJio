// Demo browser runtime; production never imports this module.
import { reactive } from 'vue'
import * as store from './store.js'
import { travelFn, prefetchLegs, fetchDrafts } from '../lib/travel.js'
import { createApiEngine } from './engine.js'
const api = createApiEngine({ ...store, reactive, travelFn, prefetchLegs, fetchDrafts })
export default api
