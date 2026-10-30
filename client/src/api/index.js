// Explicit runtime selection: shared mode never falls back to demo persistence.
export const DATA_MODE = import.meta.env?.VITE_DATA_MODE || 'demo'
if (!['demo','supabase'].includes(DATA_MODE)) throw new Error('Unknown VITE_DATA_MODE. Choose demo or supabase.')
export const isDemo = DATA_MODE === 'demo'
const api = isDemo ? (await import('./demo.js')).default : (await import('./hosted.js')).default
export const initializeApi = () => api.initialize?.() || Promise.resolve()
export const getProviderToken = () => api.providerToken?.() || Promise.resolve(null)
export const signUp = (...args) => api.signUp ? api.signUp(...args) : Promise.reject(new Error('Use a demo account.'))
export const AREAS = api.AREAS
export const INTERESTS = api.INTERESTS
export const resetDemo = api.resetDemo
export const SOFT_ISSUES = api.SOFT_ISSUES
export const ApiError = api.ApiError
export const session = api.session
export const currentUser = api.currentUser
export const listUsers = api.listUsers
export const signIn = api.signIn
export const signOut = api.signOut
export const updateProfile = api.updateProfile
export const listListings = api.listListings
export const getListing = api.getListing
export const listMyHangouts = api.listMyHangouts
export const createHangout = api.createHangout
export const updateHangout = api.updateHangout
export const getHangout = api.getHangout
export const previewHangout = api.previewHangout
export const joinHangout = api.joinHangout
export const leaveHangout = api.leaveHangout
export const setRequired = api.setRequired
export const setStage = api.setStage
export const renewInvite = api.renewInvite
export const saveAvailability = api.saveAvailability
export const clearAvailability = api.clearAvailability
export const savePreferences = api.savePreferences
export const getSlots = api.getSlots
export const previewSlot = api.previewSlot
export const lockSlot = api.lockSlot
export const unlockSlot = api.unlockSlot
export const getPlan = api.getPlan
export const generatePlan = api.generatePlan
export const setPlanStops = api.setPlanStops
export const previewCustomStop = api.previewCustomStop
export const addCustomStop = api.addCustomStop
export const getAlternatives = api.getAlternatives
export const previewStops = api.previewStops
export const vote = api.vote
export const finalizePlan = api.finalizePlan
export const reopenVoting = api.reopenVoting
export const addToShortlist = api.addToShortlist
export const removeFromShortlist = api.removeFromShortlist
export const lateJoin = api.lateJoin
export const listDrafts = api.listDrafts
export const publishDraft = api.publishDraft
export const rejectDraft = api.rejectDraft
export const unpublish = api.unpublish
