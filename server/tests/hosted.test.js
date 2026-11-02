import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostedService } from '../src/hosted.js';
import { LISTINGS } from '../../client/src/data/seed-listings.js';
import { sgTime } from '../../client/src/lib/time.js';

function fixture() {
  let version = 0;
  let state = { version: 1, users: ['host','member','outsider'].map(id => ({ id, name:id, homeArea:'private-home', email:'private@example.test', interests:{games:1}, reviewer:id==='host' })), hangouts:[], members:[], availability:{}, prefs:{}, itineraries:{}, votes:{}, published:[], reviews:{} };
  let drafts = [];
  const repository = {
    async snapshot() { return { revision: version, state: structuredClone(state) }; },
    async commit({ revision, state: next }) {
      if (revision !== version) { const e=new Error('Concurrent update'); e.code='conflict'; throw e; }
      state=structuredClone(next); version++;
    },
  };
  const service = createHostedService({ repository, verifyToken:async token => ['host','member','outsider'].includes(token) ? {id:token} : null, readDrafts:async()=>drafts, catalogue:LISTINGS });
  return { service, call:(token,operation,...args)=>service.execute({ token, operation, args }), state:()=>state, drafts:value=>{drafts=value;} };
}
const slot = { slotStart: sgTime(2026,11,14,14), slotEnd: sgTime(2026,11,14,19) };

test('hosted domain rejects persona authentication and unverified tokens', async()=>{
  const f=fixture();
  await assert.rejects(()=>f.call('host','signIn','member'),e=>e.code==='invalid');
  await assert.rejects(()=>f.call('bogus','createHangout',{}),e=>e.code==='auth');
  await assert.rejects(()=>f.call(null,'listMyHangouts'),e=>e.code==='auth');
});

test('independent users share updates without receiving another member raw availability',async()=>{
  const f=fixture();
  const h=await f.call('host','createHangout',{title:'Private',area:'bugis',dateFrom:'2026-11-14',dateTo:'2026-11-14'});
  await f.call('member','joinHangout',{token:h.inviteToken});
  await f.call('host','saveAvailability',h.id,[{start:slot.slotStart,end:slot.slotEnd}]);
  await f.call('member','savePreferences',h.id,{food:1});
  const view=await f.call('member','getHangout',h.id);
  assert.deepEqual(view.myAvailability,[]);
  assert.deepEqual(view.myPrefs,{food:1});
  assert.equal(view.members.length,2);
  assert.deepEqual(Object.keys(view.members[0].user).sort(),['color','id','name']);
  assert.deepEqual(Object.keys(view.hangout.host).sort(),['color','id','name']);
  assert.ok(!JSON.stringify(view).includes('private-home'));
  assert.ok(!JSON.stringify(view).includes('private@example.test'));
  assert.ok(!JSON.stringify(view).includes(String(slot.slotStart)));
  await assert.rejects(()=>f.call('outsider','getHangout',h.id),e=>e.code==='forbidden');
  const preview=await f.call(null,'previewHangout',{token:h.inviteToken});
  assert.equal(preview.id,h.id);
  assert.ok(!('inviteToken' in preview));
});

test('last-seat concurrent joins commit exactly one user',async()=>{
  const f=fixture();
  const h=await f.call('host','createHangout',{title:'Public',area:'bugis',visibility:'public',capacity:2,...slot});
  const results=await Promise.allSettled(['member','outsider'].map(user=>f.call(user,'joinHangout',{id:h.id})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(f.state().members.length,2);
  const failure=results.find(r=>r.status==='rejected').reason;
  assert.ok(['full','conflict'].includes(failure.code));
});

test('hosted host checks and state changes',async()=>{
  const f=fixture();
  const h=await f.call('host','createHangout',{title:'Solo',area:'bugis',mode:'solo',...slot});
  await f.call('host','updateHangout',h.id,{title:'Renamed'});
  assert.equal((await f.call('host','getHangout',h.id)).hangout.title,'Renamed');
  await assert.rejects(()=>f.call('outsider','updateHangout',h.id,{title:'Spoof'}),e=>e.code==='forbidden');
  // The content-review operations no longer exist.
  for (const op of ['listDrafts','publishDraft','rejectDraft','unpublish']) await assert.rejects(()=>f.call('host',op,{id:'d1'}),e=>e.code==='invalid');
});

test('hosted plans and accepted routes survive independent service requests',async()=>{
  const f=fixture();
  const h=await f.call('host','createHangout',{title:'Solo',area:'bugis',mode:'solo',mealWanted:false,...slot});
  const ids=LISTINGS.filter(l=>l.type==='place'&&l.kind==='activity').slice(0,2).map(l=>l.id);
  await f.call('host','setPlanStops',h.id,ids);
  const first=await f.call('host','getPlan',h.id);
  assert.equal(first.stops.length,2);
  assert.ok(Array.isArray(f.state().itineraries[h.id].acceptedRoutes));
  await f.call('host','vote',h.id,first.stops[0].id,1);
  await f.call('host','updateHangout',h.id,{slotStart:slot.slotStart+30*60000});
  const after=await f.call('host','getPlan',h.id);
  assert.equal(after.stops[0].votes.up,0);
  assert.ok(after.stops[0].version>first.stops[0].version);
});

test('host-added places survive hosted requests without appearing in the public catalogue', async () => {
  const f = fixture();
  const h = await f.call('host','createHangout',{title:'Private cafe visit',area:'bugis',mode:'solo',mealWanted:false,...slot});
  const custom = {name:'Private dessert cafe',address:'12 Example Street, Singapore',lat:1.3,lng:103.85,kind:'activity',durationMins:45};
  const added = await f.call('host','addCustomStop',h.id,custom);
  const plan = await f.call('host','getPlan',h.id);
  assert.equal(plan.stops[0].listingId,added.id);
  assert.equal(plan.stops[0].listing.title,'Private dessert cafe');
  assert.ok(!(await f.call(null,'listListings')).some(l=>l.id===added.id));
  await assert.rejects(()=>f.call('outsider','getPlan',h.id),e=>e.code==='forbidden');
  await assert.rejects(()=>f.call('outsider','addCustomStop',h.id,custom),e=>e.code==='forbidden');
});
