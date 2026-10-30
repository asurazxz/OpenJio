import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHostedAdapter } from '../src/api/hosted-adapter.js'
function fixture() {
  let authSession = null, callback
  const auth = {
    getSession: async () => ({ data:{session:authSession}, error:null }),
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
  return {api,event:()=>callback('TOKEN_REFRESHED',authSession)}
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
