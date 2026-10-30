-- Itinerary-scoped host-added places. They are never public catalogue entries.
-- Existing member-only itinerary RLS and trusted RPC grants remain in effect.
alter table public.itineraries add column if not exists custom_places jsonb not null default '[]'::jsonb
  check (jsonb_typeof(custom_places)='array');
alter table public.itinerary_stops alter column listing_id drop not null;
alter table public.itinerary_stops add column if not exists custom_place_id text;
alter table public.itinerary_stops add constraint itinerary_stop_place_kind
  check ((listing_id is not null and custom_place_id is null) or (listing_id is null and custom_place_id is not null));

create or replace function public.openjio_snapshot(p_actor uuid,p_operation text,p_args jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare ids uuid[] := '{}'; chosen uuid; reviewer boolean; rev jsonb; state jsonb;
begin
select p.reviewer into reviewer from public.profiles p where p.id=p_actor;
if p_operation in ('listListings','getListing') then
 select coalesce(array_agg(h.id),'{}') into ids from public.hangouts h where h.visibility='public' and h.stage in ('voting','final');
elsif p_operation='listMyHangouts' then
 select coalesce(array_agg(m.hangout_id),'{}') into ids from public.hangout_members m where m.user_id=p_actor;
elsif p_operation in ('previewHangout','joinHangout') then
 select h.id into chosen from public.hangouts h where
  case when nullif(p_args->0->>'token','') is not null then h.invite_token=p_args->0->>'token'
  else h.id::text=p_args->0->>'id' and h.visibility='public' end;
 if chosen is not null then ids:=array[chosen]; end if;
elsif p_operation not in ('profile','listUsers','updateProfile','createHangout','listDrafts','publishDraft','rejectDraft','unpublish') then
 chosen := (p_args->>0)::uuid; ids:=array[chosen];
end if;
rev:=jsonb_build_object('hangout',(select h.revision from public.hangouts h where h.id=chosen),
 'profile',(select p.revision from public.profiles p where p.id=p_actor),
 'catalogue',(select c.revision from openjio_private.catalogue_revision c where singleton));
select jsonb_build_object('version',1,
'users',coalesce((select jsonb_agg(openjio_private.profile(p)) from public.profiles p where p.id=p_actor or p.id in(select m.user_id from public.hangout_members m where m.hangout_id=any(ids)) or p.id in(select h.host_id from public.hangouts h where h.id=any(ids))),'[]'::jsonb),
'hangouts',coalesce((select jsonb_agg(openjio_private.hangout(h)) from public.hangouts h where h.id=any(ids)),'[]'::jsonb),
'members',coalesce((select jsonb_agg(jsonb_build_object('hangoutId',m.hangout_id,'userId',m.user_id,'role',m.role,'required',m.required,'respondedAt',openjio_private.ms(m.responded_at),'joinedAt',openjio_private.ms(m.joined_at))) from public.hangout_members m where m.hangout_id=any(ids)),'[]'::jsonb),
'availability',coalesce((select jsonb_object_agg(h.id,coalesce((select jsonb_object_agg(t.user_id,t.blocks) from (select b.user_id,jsonb_agg(jsonb_build_object('start',openjio_private.ms(b.start_at),'end',openjio_private.ms(b.end_at),'source',b.source) order by b.start_at) as blocks from public.availability_blocks b where b.hangout_id=h.id group by b.user_id)t),'{}'::jsonb)) from public.hangouts h where h.id=any(ids)),'{}'::jsonb),
'prefs',coalesce((select jsonb_object_agg(h.id,coalesce((select jsonb_object_agg(t.user_id,t.weights) from(select hp.user_id,jsonb_object_agg(hp.interest_slug,hp.weight) as weights from public.hangout_preferences hp where hp.hangout_id=h.id group by hp.user_id)t),'{}'::jsonb)) from public.hangouts h where h.id=any(ids)),'{}'::jsonb),
'itineraries',coalesce((select jsonb_object_agg(it.hangout_id,jsonb_build_object('generatedBy',it.generated_by,'method',it.method,'createdAt',openjio_private.ms(it.created_at),'finalizedAt',openjio_private.ms(it.finalized_at),'everFinal',it.ever_final,'acceptedRoutes',it.accepted_routes,'customPlaces',it.custom_places,
 'stops',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'listingId',coalesce(st.custom_place_id,l.publication_key,l.id::text),'version',st.version,'scheduledStart',openjio_private.ms(st.scheduled_start),'scheduledEnd',openjio_private.ms(st.scheduled_end)) order by st.seq) from public.itinerary_stops st left join public.listings l on l.id=st.listing_id where st.itinerary_id=it.id),'[]'::jsonb))) from public.itineraries it where it.hangout_id=any(ids)),'{}'::jsonb),
'votes',coalesce((select jsonb_object_agg(t.stop_id,t.votes) from(select v.stop_id,jsonb_object_agg(v.user_id,jsonb_build_object('value',v.value,'version',v.stop_version,'at',openjio_private.ms(v.created_at))) as votes from public.stop_votes v join public.itinerary_stops st on st.id=v.stop_id join public.itineraries it on it.id=st.itinerary_id where it.hangout_id=any(ids) group by v.stop_id)t),'{}'::jsonb),
'published',coalesce((select jsonb_agg(openjio_private.listing(l)) from public.listings l where l.status='published' and l.source_kind<>'curated'),'[]'::jsonb),
'reviews',case when reviewer then coalesce((select jsonb_object_agg(r.draft_key,r.details||jsonb_build_object('status',r.status,'reason',r.reason,'by',r.reviewed_by,'at',openjio_private.ms(r.reviewed_at))) from public.content_reviews r),'{}'::jsonb) else '{}'::jsonb end
) into state;
return jsonb_build_object('revision',rev,'state',state,'catalogue',coalesce((select jsonb_agg(openjio_private.listing(l)) from public.listings l where l.status='published' and l.source_kind='curated'),'[]'::jsonb));
end $$;

-- Called only by migration seeding and checked reviewer commits. Stable external
-- keys preserve pipeline IDs; foreign keys use real database UUIDs.
create or replace function public.openjio_commit(p_actor uuid,p_operation text,p_args jsonb,p_revision jsonb,p_state jsonb)
returns void language plpgsql set search_path='' as $$
declare
 h jsonb; hid uuid; old_h public.hangouts; actor public.profiles; j jsonb; m jsonb; iv jsonb; hp record; weights record;
 it jsonb; itid uuid; st jsonb; vote_row record; vote_user record; pos int; lid uuid; oldrev bigint; n int;
 host_actions text[]:=array['updateHangout','setRequired','setStage','renewInvite','lockSlot','unlockSlot','generatePlan','setPlanStops','addCustomStop','finalizePlan','reopenVoting'];
 member_actions text[]:=array['leaveHangout','saveAvailability','clearAvailability','savePreferences','vote','addToShortlist','removeFromShortlist','getPlan','lateJoin'];
begin
select * into actor from public.profiles where id=p_actor;
if actor.id is null then raise exception 'authenticated profile required' using errcode='42501'; end if;
if p_operation='updateProfile' then
 select revision into oldrev from public.profiles where id=p_actor for update;
 if oldrev is distinct from (p_revision->>'profile')::bigint then raise exception 'profile changed' using errcode='40001'; end if;
 select value into j from jsonb_array_elements(p_state->'users') where value->>'id'=p_actor::text;
 if j is null then raise exception 'profile missing' using errcode='22023'; end if;
 update public.profiles set display_name=j->>'name',home_area=j->>'homeArea',revision=revision+1 where id=p_actor;
 delete from public.profile_interests where profile_id=p_actor;
 insert into public.profile_interests(profile_id,interest_slug,weight) select p_actor,key,value::numeric from jsonb_each_text(j->'interests');
 -- Existing calculations based on this person's interests become stale.
 update public.hangouts set revision=revision+1 where id in(select hangout_id from public.hangout_members where user_id=p_actor);
 return;
end if;

-- Catalogue writers take an exclusive lock. Planner/hangout commits hold a
-- shared lock, so validation and commit cannot race a withdrawal or edit.
if p_operation in ('listDrafts','publishDraft','rejectDraft','unpublish') then
 if not actor.reviewer then raise exception 'reviewer required' using errcode='42501'; end if;
 select revision into oldrev from openjio_private.catalogue_revision where singleton for update;
 if oldrev is distinct from (p_revision->>'catalogue')::bigint then raise exception 'catalogue changed' using errcode='40001'; end if;
 for j in select value from jsonb_array_elements(p_state->'published') loop
  if j->'source'->>'kind' <> 'scraped' then raise exception 'invalid reviewed source' using errcode='22023'; end if;
  perform openjio_private.upsert_listing(j);
 end loop;
 -- A retired pipeline tombstone or an explicit unpublish removes discoverability
 -- everywhere without deleting a listing referenced by an old itinerary.
 update public.listings set status='expired' where source_kind='scraped' and status='published'
  and coalesce(publication_key,id::text) not in(select value->>'id' from jsonb_array_elements(p_state->'published'));
 insert into public.content_reviews(draft_key,status,reason,reviewed_by,reviewed_at,details)
 select key,value->>'status',value->>'reason',coalesce((value->>'by')::uuid,p_actor),coalesce(openjio_private.ts(value->'at'),now()),value from jsonb_each(p_state->'reviews')
 on conflict(draft_key) do update set status=excluded.status,reason=excluded.reason,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,details=excluded.details;
 update openjio_private.catalogue_revision set revision=revision+1 where singleton;
 return;
end if;

if not (p_operation=any(host_actions) or p_operation=any(member_actions) or p_operation in ('createHangout','joinHangout')) then
 raise exception 'unsupported mutation' using errcode='22023';
end if;
select revision into oldrev from openjio_private.catalogue_revision where singleton for share;
if oldrev is distinct from (p_revision->>'catalogue')::bigint then raise exception 'catalogue changed' using errcode='40001'; end if;
if jsonb_array_length(p_state->'hangouts')<>1 then raise exception 'one hangout required' using errcode='22023'; end if;
h:=p_state->'hangouts'->0; hid:=(h->>'id')::uuid;
if p_operation='createHangout' then
 if h->>'hostId'<>p_actor::text then raise exception 'host identity required' using errcode='42501'; end if;
 if exists(select 1 from public.hangouts where id=hid) then raise exception 'hangout exists' using errcode='40001'; end if;
else
 select * into old_h from public.hangouts where id=hid for update;
 if old_h.id is null then raise exception 'hangout missing' using errcode='P0002'; end if;
 if old_h.revision is distinct from (p_revision->>'hangout')::bigint then raise exception 'hangout changed' using errcode='40001'; end if;
 if old_h.stage in ('ended','cancelled') then raise exception 'hangout closed' using errcode='22023'; end if;
 if old_h.host_id::text is distinct from h->>'hostId' then raise exception 'host is immutable' using errcode='42501'; end if;
 if p_operation=any(host_actions) and old_h.host_id<>p_actor then raise exception 'host required' using errcode='42501'; end if;
 if p_operation=any(member_actions) and not exists(select 1 from public.hangout_members where hangout_id=hid and user_id=p_actor) then raise exception 'member required' using errcode='42501'; end if;
 if p_operation='joinHangout' then
  if old_h.mode<>'group' or not(case when nullif(p_args->0->>'token','') is not null then old_h.invite_token=p_args->0->>'token' else old_h.visibility='public' and old_h.id::text=p_args->0->>'id' end) then raise exception 'invalid invite' using errcode='42501'; end if;
 end if;
end if;
-- Scope/identity invariants are independently checked at the transaction boundary.
if (h->>'mode') not in ('group','solo') or (h->>'visibility') not in ('public','private')
 or (h->'startArea'->>'lat') is null or (h->'startArea'->>'lng') is null then raise exception 'invalid hangout' using errcode='22023'; end if;
if h->'lockedSlot' is distinct from 'null'::jsonb and h->'lockedSlot' is not null then
 if (h->'lockedSlot'->>'end')::numeric-(h->'lockedSlot'->>'start')::numeric not between 3600000 and 43200000 then raise exception 'slot must be 1 to 12 hours' using errcode='22023'; end if;
elsif h->>'mode'='solo' or h->>'visibility'='public' or h->>'dateFrom' is null or h->>'dateTo' is null then
 raise exception 'slot or collection dates required' using errcode='22023';
end if;
select count(*) into n from jsonb_array_elements(p_state->'members')x where x->>'hangoutId'=hid::text;
if n<1 or n>coalesce((h->>'capacity')::int,8) then raise exception 'capacity exceeded' using errcode='22023'; end if;
if (select count(*) from jsonb_array_elements(p_state->'members')x where x->>'role'='host' and x->>'userId'=h->>'hostId' and (x->>'required')::boolean)<>1 then raise exception 'one required host needed' using errcode='22023'; end if;
if exists(select 1 from jsonb_array_elements(p_state->'members')x where x->>'hangoutId'<>hid::text) then raise exception 'membership scope mismatch' using errcode='42501'; end if;

insert into public.hangouts(id,host_id,title,description,mode,visibility,capacity,invite_token,stage,date_from,date_to,start_area_slug,start_area_label,start_area_lat,start_area_lng,interests,meal_wanted,locked_slot_start,locked_slot_end,plan_changed_at,created_at,revision)
values(hid,(h->>'hostId')::uuid,h->>'title',h->>'description',h->>'mode',h->>'visibility',(h->>'capacity')::int,h->>'inviteToken',h->>'stage',(h->>'dateFrom')::date,(h->>'dateTo')::date,h->'startArea'->>'slug',h->'startArea'->>'label',(h->'startArea'->>'lat')::float8,(h->'startArea'->>'lng')::float8,array(select jsonb_array_elements_text(h->'interests')),(h->>'mealWanted')::boolean,openjio_private.ts(h->'lockedSlot'->'start'),openjio_private.ts(h->'lockedSlot'->'end'),openjio_private.ts(h->'planChangedAt'),openjio_private.ts(h->'createdAt'),1)
on conflict(id) do update set title=excluded.title,description=excluded.description,capacity=excluded.capacity,invite_token=excluded.invite_token,stage=excluded.stage,date_from=excluded.date_from,date_to=excluded.date_to,start_area_slug=excluded.start_area_slug,start_area_label=excluded.start_area_label,start_area_lat=excluded.start_area_lat,start_area_lng=excluded.start_area_lng,interests=excluded.interests,meal_wanted=excluded.meal_wanted,locked_slot_start=excluded.locked_slot_start,locked_slot_end=excluded.locked_slot_end,plan_changed_at=excluded.plan_changed_at,revision=public.hangouts.revision+1;

-- Membership FK cascades clean availability/preferences. Votes need explicit
-- cleanup because their FK is to the profile rather than membership.
delete from public.stop_votes v using public.itinerary_stops st,public.itineraries i
where v.stop_id=st.id and st.itinerary_id=i.id and i.hangout_id=hid
and v.user_id::text not in(select x->>'userId' from jsonb_array_elements(p_state->'members')x);
delete from public.hangout_members where hangout_id=hid and user_id::text not in(select x->>'userId' from jsonb_array_elements(p_state->'members')x);
for m in select value from jsonb_array_elements(p_state->'members') loop
 insert into public.hangout_members(hangout_id,user_id,role,required,responded_at,joined_at)
 values(hid,(m->>'userId')::uuid,m->>'role',(m->>'required')::boolean,openjio_private.ts(m->'respondedAt'),openjio_private.ts(m->'joinedAt'))
 on conflict(hangout_id,user_id) do update set required=excluded.required,responded_at=excluded.responded_at;
end loop;
delete from public.availability_blocks where hangout_id=hid;
for hp in select key,value from jsonb_each(coalesce(p_state->'availability'->hid::text,'{}')) loop
 for iv in select value from jsonb_array_elements(hp.value) loop
  insert into public.availability_blocks(hangout_id,user_id,start_at,end_at,source) values(hid,hp.key::uuid,openjio_private.ts(iv->'start'),openjio_private.ts(iv->'end'),iv->>'source');
 end loop;
end loop;
delete from public.hangout_preferences where hangout_id=hid;
for hp in select key,value from jsonb_each(coalesce(p_state->'prefs'->hid::text,'{}')) loop
 insert into public.hangout_preferences(hangout_id,user_id,interest_slug,weight) select hid,hp.key::uuid,key,value::numeric from jsonb_each_text(hp.value);
end loop;

it:=p_state->'itineraries'->hid::text;
if it is not null and it<>'null'::jsonb then
 insert into public.itineraries(hangout_id,generated_by,method,finalized_at,ever_final,accepted_routes,custom_places,created_at)
 values(hid,it->>'generatedBy',it->>'method',openjio_private.ts(it->'finalizedAt'),coalesce((it->>'everFinal')::boolean,false),coalesce(it->'acceptedRoutes','[]'),coalesce(it->'customPlaces','[]'),openjio_private.ts(it->'createdAt'))
 on conflict(hangout_id) do update set generated_by=excluded.generated_by,method=excluded.method,finalized_at=excluded.finalized_at,ever_final=excluded.ever_final,accepted_routes=excluded.accepted_routes,custom_places=excluded.custom_places returning id into itid;
 delete from public.itinerary_stops where itinerary_id=itid and id::text not in(select x->>'id' from jsonb_array_elements(it->'stops')x);
 pos:=0;
 for st in select value from jsonb_array_elements(it->'stops') loop
  pos:=pos+1;
  select id into lid from public.listings where coalesce(publication_key,id::text)=st->>'listingId';
  if lid is null and not exists(select 1 from jsonb_array_elements(coalesce(it->'customPlaces','[]')) p where p->>'id'=st->>'listingId' and coalesce((p->>'custom')::boolean,false)) then raise exception 'listing unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.itinerary_stops where id=(st->>'id')::uuid and (itinerary_id<>itid or version>(st->>'version')::int)) then raise exception 'stop scope/version mismatch' using errcode='42501'; end if;
  insert into public.itinerary_stops(id,itinerary_id,seq,version,listing_id,custom_place_id,scheduled_start,scheduled_end)
  values((st->>'id')::uuid,itid,pos,(st->>'version')::int,lid,case when lid is null then st->>'listingId' else null end,openjio_private.ts(st->'scheduledStart'),openjio_private.ts(st->'scheduledEnd'))
  on conflict(id) do update set seq=excluded.seq,version=excluded.version,listing_id=excluded.listing_id,custom_place_id=excluded.custom_place_id,scheduled_start=excluded.scheduled_start,scheduled_end=excluded.scheduled_end;
 end loop;
 delete from public.stop_votes where stop_id in(select id from public.itinerary_stops where itinerary_id=itid);
 for vote_row in select key,value from jsonb_each(p_state->'votes') loop
  if exists(select 1 from public.itinerary_stops where id=vote_row.key::uuid and itinerary_id=itid) then
   for vote_user in select key,value from jsonb_each(vote_row.value) loop
    if exists(select 1 from public.hangout_members where hangout_id=hid and user_id=vote_user.key::uuid) then
     insert into public.stop_votes(stop_id,user_id,stop_version,value,created_at) values(vote_row.key::uuid,vote_user.key::uuid,(vote_user.value->>'version')::int,(vote_user.value->>'value')::smallint,coalesce(openjio_private.ts(vote_user.value->'at'),now()));
    end if;
   end loop;
  end if;
 end loop;
end if;
delete from public.shortlist sh where sh.hangout_id=hid and sh.listing_id not in(select l.id from public.listings l where coalesce(l.publication_key,l.id::text) in(select jsonb_array_elements_text(h->'shortlist')));
insert into public.shortlist(hangout_id,listing_id,added_by)
select hid,l.id,p_actor from public.listings l where coalesce(l.publication_key,l.id::text) in(select jsonb_array_elements_text(h->'shortlist')) on conflict do nothing;
end $$;


-- CREATE OR REPLACE preserves the existing service-role-only execute privileges.
revoke execute on function public.openjio_snapshot(uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.openjio_commit(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.openjio_snapshot(uuid,text,jsonb) to service_role;
grant execute on function public.openjio_commit(uuid,text,jsonb,jsonb,jsonb) to service_role;
