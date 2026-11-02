-- Exact meeting details are private hangout state; invitation previews expose
-- only their own explicitly selected fields in the application layer.
alter table public.hangouts
  add column meeting_point text,
  add constraint hangouts_meeting_point_length
    check (meeting_point is null or char_length(meeting_point) <= 120);

create or replace function openjio_private.hangout(h public.hangouts) returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object('id',h.id,'hostId',h.host_id,'title',h.title,'description',h.description,'mode',h.mode,
'visibility',h.visibility,'capacity',h.capacity,'inviteToken',h.invite_token,'stage',h.stage,
'dateFrom',h.date_from,'dateTo',h.date_to,'startArea',jsonb_build_object('slug',h.start_area_slug,'label',h.start_area_label,'lat',h.start_area_lat,'lng',h.start_area_lng),
'interests',to_jsonb(h.interests),'mealWanted',h.meal_wanted,'meetingPoint',h.meeting_point,
'lockedSlot',case when h.locked_slot_start is null then null else jsonb_build_object('start',openjio_private.ms(h.locked_slot_start),'end',openjio_private.ms(h.locked_slot_end)) end,
'shortlist',coalesce((select jsonb_agg(coalesce(l.publication_key,l.id::text) order by sh.created_at) from public.shortlist sh join public.listings l on l.id=sh.listing_id where sh.hangout_id=h.id),'[]'::jsonb),
'createdAt',openjio_private.ms(h.created_at),'updatedAt',openjio_private.ms(h.updated_at),'planChangedAt',openjio_private.ms(h.plan_changed_at))
$$;

-- Add meeting_point to the existing commit serializer without replacing the
-- planner implementation. This runs after the current planning migration, so
-- custom-place support and its transaction checks remain intact. Fail closed
-- if the expected current serializer has drifted.
do $$
declare
  definition text;
  updated text;
  old_columns text := 'interests,meal_wanted,locked_slot_start';
  new_columns text := 'interests,meal_wanted,meeting_point,locked_slot_start';
  old_values text := '(h->>''mealWanted'')::boolean,openjio_private.ts(h->''lockedSlot''->''start'')';
  new_values text := '(h->>''mealWanted'')::boolean,h->>''meetingPoint'',openjio_private.ts(h->''lockedSlot''->''start'')';
  old_upsert text := 'interests=excluded.interests,meal_wanted=excluded.meal_wanted,locked_slot_start=excluded.locked_slot_start';
  new_upsert text := 'interests=excluded.interests,meal_wanted=excluded.meal_wanted,meeting_point=excluded.meeting_point,locked_slot_start=excluded.locked_slot_start';
begin
  definition := pg_get_functiondef('public.openjio_commit(uuid,text,jsonb,jsonb,jsonb)'::regprocedure);
  if position(old_columns in definition)=0 or position(old_values in definition)=0 or position(old_upsert in definition)=0 then
    raise exception 'openjio_commit definition does not match expected current serializer';
  end if;
  updated := replace(replace(replace(definition,old_columns,new_columns),old_values,new_values),old_upsert,new_upsert);
  execute updated;
end
$$;
