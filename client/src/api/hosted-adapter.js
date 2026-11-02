// Auth/transport boundary; domain rules run in the trusted server engine.
import { AREAS, INTERESTS } from '../data/seed-listings.js'
export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const OPERATIONS = ['listUsers','updateProfile','listListings','getListing','listMyHangouts','createHangout','updateHangout','getHangout','previewHangout','joinHangout','leaveHangout','setRequired','setStage','renewInvite','saveAvailability','clearAvailability','savePreferences','getSlots','previewSlot','lockSlot','unlockSlot','getPlan','generatePlan','setPlanStops','previewCustomStop','addCustomStop','getAlternatives','previewStops','vote','finalizePlan','reopenVoting','addToShortlist','removeFromShortlist','lateJoin']

export function createHostedAdapter({ auth, request, reactive = v => v, onRevision = () => {} }) {
  const session = reactive({ userId: null, error: null })
  let profile = null, epoch = 0, locallySignedOut = false, initialized, subscribed = false
  const fail = error => new ApiError(error.code || 'auth', error.message || 'Authentication failed.')
  const clear = () => { profile = null; session.userId = null; onRevision() }
  async function hydrate(authSession) {
    const ticket = ++epoch
    if (!authSession) { clear(); return null }
    const next = await request('profile', [], authSession.access_token)
    if (!next || next.id !== authSession.user.id) throw new ApiError('auth', 'Unable to verify your profile.')
    if (ticket !== epoch || locallySignedOut) return null
    profile = next; session.userId = next.id; session.error = null; onRevision()
    return next
  }
  async function call(operation, args) {
    const { data, error } = await auth.getSession()
    if (error) throw fail(error)
    try { return await request(operation, args, locallySignedOut ? null : data.session?.access_token) }
    catch (error) { if (error.code === 'auth') clear(); throw error }
  }
  function subscribe() {
    if (subscribed) return
    auth.onAuthStateChange((event, next) => {
      // No awaited SDK work inside its callback/lock.
      if (event === 'SIGNED_OUT') { epoch++; clear(); return }
      if (!locallySignedOut) queueMicrotask(() => hydrate(next).catch(error => { clear(); session.error = error.message }))
    })
    subscribed = true
  }
  const api = {
    AREAS, INTERESTS, SOFT_ISSUES: ['no_meal', 'unknown_hours'], ApiError, session,
    currentUser: () => profile,
    initialize() {
      if (!initialized) initialized = (async () => {
        const { data, error } = await auth.getSession()
        if (error) throw fail(error)
        subscribe()
        await hydrate(data.session)
      })().catch(error => { initialized = undefined; throw error })
      return initialized
    },
    async signIn(credentials) {
      if (!credentials || typeof credentials !== 'object' || !credentials.email || !credentials.password) throw new ApiError('invalid', 'Enter your email and password.')
      const { data, error } = await auth.signInWithPassword({ email: credentials.email.trim(), password: credentials.password })
      if (error) throw fail(error)
      locallySignedOut = false
      subscribe()
      return hydrate(data.session)
    },
    async signUp(credentials) {
      if (!credentials?.email || !credentials?.password || !credentials?.name?.trim()) throw new ApiError('invalid', 'Enter your name, email and password.')
      const { data, error } = await auth.signUp({ email: credentials.email.trim(), password: credentials.password, options: { data: { display_name: credentials.name.trim().slice(0,40) } } })
      if (error) throw fail(error)
      subscribe()
      if (!data.session) return { confirmationRequired: true }
      locallySignedOut = false
      await hydrate(data.session)
      return { confirmationRequired: false }
    },
    signOut() {
      locallySignedOut = true; epoch++; clear()
      void auth.signOut().then(({ error }) => { if (error) session.error = 'Signed out here. The remote session could not be revoked; try again when connected.' }).catch(() => { session.error = 'The remote session could not be revoked.' })
    },
    resetDemo() { throw new ApiError('forbidden', 'Demo reset is unavailable for shared accounts.') },
  }
  for (const operation of OPERATIONS) api[operation] = async (...args) => {
    const result = await call(operation, args)
    if (operation === 'updateProfile') { profile = result; session.userId = result.id }
    if (!['getPlan','getListing','listListings','getSlots','previewSlot','previewCustomStop','previewStops','getAlternatives','listUsers','previewHangout','listMyHangouts','getHangout'].includes(operation)) onRevision()
    return result
  }
  return api
}
