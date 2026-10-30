// Opt-in integration with a NEW disposable container. Never uses hosted DB URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHostedService } from '../src/hosted.js';
import { sgTime } from '../../client/src/lib/time.js';
const run = promisify(execFile);
const container = process.env.OPENJIO_TEST_CONTAINER;
const q = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const host='00000000-0000-4000-8000-000000000001', member='00000000-0000-4000-8000-000000000002', outsider='00000000-0000-4000-8000-000000000003';

test('normalized SQL domain: private multiuser journey, role grants, revision conflict and review retirement', {skip:!container}, async t=>{
  assert.match(container,/^openjio-hosted-sql-/,'Only the disposable integration container is allowed');
  async function sql(command,role='service_role') {
    const {stdout}=await run('docker',['exec',container,'psql','-U','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',`set role ${role};${command}`],{maxBuffer:4*1024*1024});
    return stdout.trim();
  }
  await sql(`insert into auth.users(id,raw_user_meta_data) values('${host}','{"display_name":"Host"}'),('${member}','{"display_name":"Member"}'),('${outsider}','{"display_name":"Outsider"}') on conflict do nothing;update public.profiles set reviewer=true where id='${host}';`,'postgres');
  const repository={
    async snapshot({actorId,operation,args}) { return JSON.parse(await sql(`select public.openjio_snapshot(${actorId?"'"+actorId+"'::uuid":'null'},${q(operation)}#>>'{}',${q(args)});`)); },
    async commit({actorId,operation,args,revision,state}) {
      try { await sql(`select public.openjio_commit('${actorId}',${q(operation)}#>>'{}',${q(args)},${q(revision)},${q(state)});`); }
      catch(error) { error.code=error.stderr.includes('changed')?'conflict':error.code;throw error; }
    },
  };
  let drafts=[];
  const service=createHostedService({repository,verifyToken:async token=>({id:token}),readDrafts:async()=>drafts});
  const call=(actor,op,...args)=>service.execute({token:actor,operation:op,args});
  const start=sgTime(2026,11,14,14),end=sgTime(2026,11,14,19);
  const h=await call(host,'createHangout',{title:'SQL private',area:'bugis',dateFrom:'2026-11-14',dateTo:'2026-11-14',mealWanted:false});
  await call(member,'joinHangout',{token:h.inviteToken});
  await call(host,'saveAvailability',h.id,[{start,end}]);
  await call(member,'saveAvailability',h.id,[{start,end}]);
  await call(member,'savePreferences',h.id,{food:1});
  await call(host,'updateProfile',{interests:{games:1}});
  const view=await call(host,'getHangout',h.id);
  assert.equal(view.members.length,2);
  assert.deepEqual(view.myPrefs,null);
  assert.ok(!('interests' in view.members.find(m=>m.userId===member).user));
  assert.equal((await call(host,'getSlots',h.id)).responded,2);
  await assert.rejects(()=>call(outsider,'getHangout',h.id),e=>e.code==='forbidden');
  const snapshot=await repository.snapshot({actorId:host,operation:'setRequired',args:[h.id,member,true]});
  await call(host,'setRequired',h.id,member,true);
  await assert.rejects(()=>repository.commit({actorId:host,operation:'setRequired',args:[h.id,member,false],revision:snapshot.revision,state:snapshot.state}),e=>e.code==='conflict');
  await call(host,'lockSlot',h.id,{start,end});
  const catalogue=await call(null,'listListings');
  const activity=catalogue.find(l=>l.type==='place'&&l.kind==='activity'&&l.openingHours?.sat?.length);
  assert.ok(activity);
  await call(host,'setPlanStops',h.id,[activity.id]);
  let plan=await call(host,'getPlan',h.id);
  assert.equal(plan.stops.length,1);
  await call(member,'vote',h.id,plan.stops[0].id,1);
  assert.equal((await call(host,'getPlan',h.id)).stops[0].votes.up,1);
  await call(member,'leaveHangout',h.id);
  await call(member,'joinHangout',{token:h.inviteToken});
  assert.equal((await call(member,'getPlan',h.id)).stops[0].votes.up,0);
  assert.deepEqual((await call(member,'getHangout',h.id)).myAvailability,[]);
  await call(host,'finalizePlan',h.id);
  assert.equal((await call(host,'getHangout',h.id)).hangout.stage,'final');
  const persisted=JSON.parse(await sql(`select accepted_routes from public.itineraries where hangout_id='${h.id}';`));
  assert.ok(Array.isArray(persisted));
  await call(host,'reopenVoting',h.id);
  await call(host,'updateHangout',h.id,{title:'SQL renamed'});
  assert.equal((await call(member,'getHangout',h.id)).hangout.title,'SQL renamed');
  drafts=[{id:'sql-manual',status:'draft',title:'Unknown details',type:'event',area:'bugis'}];
  await call(host,'publishDraft',{id:'sql-manual',title:'Unknown details',type:'event',area:'bugis',routeReady:false});
  const listing=(await call(null,'listListings')).find(l=>l.id==='pub-sql-manual');
  assert.equal(listing.lat,null);assert.equal(listing.durationMins,null);assert.equal(listing.routeReady,false);
  await assert.rejects(()=>call(member,'rejectDraft','sql-manual'),e=>e.code==='forbidden');
  drafts=[{id:'sql-manual',status:'retired',retiredReason:'Withdrawn',retiredAt:Date.now()}];
  await call(host,'listDrafts');
  assert.ok(!(await call(null,'listListings')).some(l=>l.id==='pub-sql-manual'));
  assert.equal(await sql("select status from public.content_reviews where draft_key='sql-manual';"),'retired');
  await t.test('raw snapshots and mutation RPCs are inaccessible to browser roles',async()=>{
    await assert.rejects(()=>sql(`select public.openjio_snapshot('${member}','getHangout',${q([h.id])});`,'authenticated'),/permission denied/);
    await assert.rejects(()=>sql(`select public.openjio_snapshot(null,'listListings','[]');`,'anon'),/permission denied/);
    await assert.rejects(()=>sql(`update public.profiles set reviewer=true where id='${member}';`,'authenticated'),/permission denied/);
    await assert.rejects(()=>sql(`delete from public.availability_blocks;`,'authenticated'),/permission denied/);
    await assert.rejects(()=>sql(`select * from openjio_private.catalogue_revision;`,'authenticated'),/permission denied/);
    // Profiles are visible to their owner and to co-members only.
    const visible=actor=>sql(`set request.jwt.claims='{"sub":"${actor}","role":"authenticated"}';select count(*) from public.profiles where id in('${host}','${member}','${outsider}');`,'authenticated');
    assert.equal(await visible(member),'2');
    assert.equal(await visible(outsider),'1');
  });
  await t.test('direct service mutation still checks reviewer authority in SQL',async()=>{
    const snap=await repository.snapshot({actorId:member,operation:'listDrafts',args:[]});
    await assert.rejects(()=>repository.commit({actorId:member,operation:'rejectDraft',args:['sql-manual'],revision:snap.revision,state:snap.state}),/reviewer required/);
  });
  await t.test('one final seat is safe under concurrent normalized SQL commits',async()=>{
    const p=await call(host,'createHangout',{title:'SQL public',area:'bugis',visibility:'public',capacity:2,slotStart:start,slotEnd:end});
    const joined=await Promise.allSettled([member,outsider].map(actor=>call(actor,'joinHangout',{id:p.id})));
    assert.equal(joined.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await sql(`select count(*) from public.hangout_members where hangout_id='${p.id}';`),'2');
  });
});
