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

test('normalized SQL domain: private multiuser journey, role grants, and revision conflict', {skip:!container}, async t=>{
  assert.match(container,/^openjio-hosted-sql-/,'Only the disposable integration container is allowed');
  async function sql(command,role='service_role') {
    const {stdout}=await run('docker',['exec',container,'psql','-U','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',`set role ${role};${command}`],{maxBuffer:4*1024*1024});
    return stdout.trim();
  }
  await sql(`insert into auth.users(id,raw_user_meta_data) values('${host}','{"display_name":"Host"}'),('${member}','{"display_name":"Member"}'),('${outsider}','{"display_name":"Outsider"}') on conflict do nothing;update public.profiles set reviewer=true where id='${host}';`,'postgres');
  await sql(`insert into public.listings(publication_key,type,kind,title,area,address,lat,lng,duration_mins,opening_hours,status,source_kind,verified_at) values('codex-test-activity','place','activity','SQL test activity','bugis','1 Test Street',1.3,103.8,60,'{"sat":[["10:00","21:00"]]}'::jsonb,'published','curated',now()) on conflict(publication_key) do update set status='published',verified_at=now();`,'postgres');
  const repository={
    async snapshot({actorId,operation,args}) { return JSON.parse(await sql(`select public.openjio_snapshot(${actorId?"'"+actorId+"'::uuid":'null'},${q(operation)}#>>'{}',${q(args)});`)); },
    async commit({actorId,operation,args,revision,state}) {
      try { await sql(`select public.openjio_commit('${actorId}',${q(operation)}#>>'{}',${q(args)},${q(revision)},${q(state)});`); }
      catch(error) { error.code=error.stderr.includes('changed')?'conflict':error.code;throw error; }
    },
  };
  const service=createHostedService({repository,verifyToken:async token=>({id:token}),readDrafts:async()=>[]});
  const call=(actor,op,...args)=>service.execute({token:actor,operation:op,args});
  const start=sgTime(2026,11,14,14),end=sgTime(2026,11,14,19);
  const h=await call(host,'createHangout',{title:'SQL private',area:'bugis',dateFrom:'2026-11-14',dateTo:'2026-11-14',mealWanted:false});
  await call(member,'joinHangout',{token:h.inviteToken});
  await call(host,'updateHangout',h.id,{meetingPoint:'Bugis MRT, Exit C'});
  assert.equal((await call(host,'getHangout',h.id)).hangout.meetingPoint,'Bugis MRT, Exit C');
  assert.equal(await sql(`select meeting_point from public.hangouts where id='${h.id}';`),'Bugis MRT, Exit C');
  await assert.rejects(()=>sql(`update public.hangouts set meeting_point='${'x'.repeat(121)}' where id='${h.id}';`),/hangouts_meeting_point_length/);
  const invitePreview=await call(null,'previewHangout',{token:h.inviteToken});
  assert.ok(!('meetingPoint' in invitePreview),'invite previews must not reveal the exact meeting point');
  await assert.rejects(()=>call(member,'updateHangout',h.id,{meetingPoint:'Spoofed location'}),e=>e.code==='forbidden');
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
  await t.test('one final seat is safe under concurrent normalized SQL commits',async()=>{
    const p=await call(host,'createHangout',{title:'SQL public',area:'bugis',visibility:'public',capacity:2,slotStart:start,slotEnd:end});
    const joined=await Promise.allSettled([member,outsider].map(actor=>call(actor,'joinHangout',{id:p.id})));
    assert.equal(joined.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await sql(`select count(*) from public.hangout_members where hangout_id='${p.id}';`),'2');
  });
  await t.test('live listing RPC preserves provider nulls and rejects browser callers',async()=>{
    const osm={id:'sql-osm-place',type:'place',kind:'meal',title:'SQL OSM café',summary:null,interests:[],area:'bugis',address:'1 Test Street',lat:1.3,lng:103.8,durationMins:45,priceLevel:null,priceText:null,openingHours:null,startsAt:null,endsAt:null,merchant:null,dealText:null,validity:null,conditions:null,exclusions:null,status:'published',routeReady:true,reviewStatus:'route-ready',unknownFields:[],sample:false,rawPostId:null,source:{kind:'osm',name:'OpenStreetMap',url:'https://www.openstreetmap.org/way/123',retrievedAt:'2026-11-02T08:00:00Z',verifiedAt:null}};
    const extracted={id:'sql-extracted-event',type:'event',kind:'activity',title:'SQL extracted event',summary:null,interests:[],area:null,address:null,lat:null,lng:null,durationMins:null,priceLevel:null,priceText:null,openingHours:null,startsAt:null,endsAt:null,merchant:null,dealText:null,validity:null,conditions:null,exclusions:null,status:'published',routeReady:false,reviewStatus:'auto-extracted',unknownFields:['area','address','lat','lng','startsAt','endsAt'],sample:false,rawPostId:null,source:{kind:'scraped',name:'Telegram',url:null,retrievedAt:'2026-11-02T08:01:00Z',verifiedAt:null}};
    await sql(`select public.openjio_sync_live_listings(${q([osm,extracted])});`);
    const rows=JSON.parse(await sql(`select jsonb_agg(jsonb_build_object('id',publication_key,'type',type,'area',area,'address',address,'lat',lat,'lng',lng,'startsAt',starts_at,'endsAt',ends_at,'openingHours',opening_hours,'conditions',conditions,'exclusions',exclusions,'verifiedAt',verified_at,'retrievedAt',retrieved_at,'routeReady',route_ready,'reviewStatus',review_status,'sourceKind',source_kind,'sourceName',source_name,'details',details) order by publication_key) from public.listings where publication_key in('sql-osm-place','sql-extracted-event');`));
    assert.equal(rows.length,2);
    const place=rows.find(row=>row.id==='sql-osm-place');
    assert.equal(place.area,'bugis'); assert.equal(place.lat,1.3); assert.equal(place.lng,103.8);
    assert.equal(place.verifiedAt,null); assert.equal(place.sourceKind,'osm'); assert.ok(place.retrievedAt);
    assert.equal(place.details.source.verifiedAt,null); assert.equal(place.details.openingHours,null);
    const event=rows.find(row=>row.id==='sql-extracted-event');
    for (const key of ['area','address','lat','lng','startsAt','endsAt','openingHours','verifiedAt']) assert.equal(event[key],null,`${key} should remain null for the unlocated extraction`);
    assert.deepEqual(event.conditions,[]); assert.deepEqual(event.exclusions,[]);
    assert.equal(event.sourceKind,'scraped'); assert.ok(event.retrievedAt); assert.equal(event.routeReady,false); assert.equal(event.reviewStatus,'auto-extracted');
    assert.equal(event.details.source.verifiedAt,null); assert.equal(event.details.conditions,null); assert.equal(event.details.exclusions,null);
    await assert.rejects(()=>sql(`select public.openjio_sync_live_listings('[]'::jsonb);`,'anon'),/permission denied/);
    await assert.rejects(()=>sql(`select public.openjio_sync_live_listings('[]'::jsonb);`,'authenticated'),/permission denied/);
  });
});
