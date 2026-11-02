import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHostedAdapter } from '../src/api/hosted-adapter.js'
function fixture({ initialFailure = false } = {}) {
  let authSession = null, callback
  const auth = {
    getSession: async () => {
      if (initialFailure) { initialFailure = false; throw new Error('Backend unavailable') }
      return { data:{session:authSession}, error:null }
    },
    signInWithPassword: async ({email,password}) => {
      if (email !== 'a@example.test' || password !== 'secret123') return {error:new Error('Invalid credentials')}
      authSession={access_token:'verified-token',user:{id:'a'}}
      return {data:{session:authSession},error:null}
    },
    signUp: async () => ({data:{session:null,user:{id:'a'}},error:null}),
    signOut: async () => {authSession=null;return {error:null}},
    onAuthStateChange: cb => {callback=cb;return {data:{subscription:{unsubscribe(){}}}}},
  }
  let profile={id:'a',name:'Alice',interests:{food:1}}
  const api=createHostedAdapter({auth,request:async(operation,args,token)=>{
    if (token !== 'verified-token') throw Object.assign(new Error('Unauthorized'),{code:'auth'})
    if(operation==='profile')return profile
    if(operation==='updateProfile'){profile={...profile,...args[0]};return profile}
    return {ok:true}
  }})
  return {api,event:(type = 'TOKEN_REFRESHED')=>callback?.(type,authSession)}
}

test('live sign-in rejects persona IDs and hydrates synchronous profile only after real auth',async()=>{
  const {api}=fixture(); await api.initialize()
  assert.equal(api.currentUser(),null)
  await assert.rejects(()=>api.signIn('a'),e=>e.code==='invalid')
  assert.equal(api.session.userId,null)
  await api.signIn({email:'a@example.test',password:'secret123'})
  assert.equal(api.session.userId,'a')
  assert.equal(api.currentUser().name,'Alice')
  await api.updateProfile({name:'Updated'})
  assert.equal(api.currentUser().name,'Updated')
  assert.equal(api.signOut(),undefined)
  assert.equal(api.currentUser(),null)
  assert.equal(api.session.userId,null)
})

test('email confirmation leaves signup signed out and cannot forge a session',async()=>{
  const {api}=fixture(); await api.initialize()
  const response=await api.signUp({email:'a@example.test',password:'secret123',name:'Alice'})
  assert.equal(response.confirmationRequired,true)
  assert.equal(api.currentUser(),null)
  assert.equal(api.session.userId,null)
})


test('sign-in after an initial backend outage keeps cross-tab sign-out synchronized without reload', async () => {
  const { api, event } = fixture({ initialFailure: true })
  await assert.rejects(api.initialize(), /Backend unavailable/)
  await api.signIn({ email: 'a@example.test', password: 'secret123' })
  assert.equal(api.currentUser().name, 'Alice')
  event('SIGNED_OUT')
  assert.equal(api.session.userId, null)
  assert.equal(api.currentUser(), null)
})

test('initialization can retry after the backend recovers', async () => {
  const { api } = fixture({ initialFailure: true })
  await assert.rejects(api.initialize(), /Backend unavailable/)
  await api.initialize()
  assert.equal(api.session.userId, null)
})

test('reading a hosted plan does not invalidate its own live view, while voting still refreshes it', async () => {
  let invalidations = 0
  const api = createHostedAdapter({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    request: async operation => operation === 'getPlan' ? { stops: [{ id: 'stop-1' }] } : { ok: true },
    onRevision: () => { invalidations++ },
  })
  const plan = await api.getPlan('outing-1')
  assert.equal(plan.stops[0].id, 'stop-1')
  assert.equal(invalidations, 0, 'a plan read must not trigger another read and discard its pending result')
  await api.vote('outing-1', 'stop-1', 1)
  assert.equal(invalidations, 1)
})
