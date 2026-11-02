-- Installed ONLY by compose.demo.yaml, never by the ordinary database.
create table openjio_private.demo_environment (
  singleton boolean primary key default true check (singleton),
  accounts jsonb not null default '[]',
  reset_at timestamptz,
  anchor_date date
);
insert into openjio_private.demo_environment(singleton) values(true);
revoke all on openjio_private.demo_environment from public,anon,authenticated;
grant all on openjio_private.demo_environment to service_role;

create function public.openjio_demo_info() returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('accounts',accounts,'resetAt',reset_at,'anchorDate',anchor_date)
  from openjio_private.demo_environment where singleton
$$;

create function public.openjio_demo_register(p_accounts jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if jsonb_array_length(p_accounts)<>6 or
    (select count(distinct a->>'id') from jsonb_array_elements(p_accounts)a)<>6 or
    exists(select 1 from jsonb_array_elements(p_accounts)a
      where not exists(select 1 from public.profiles p where p.id=(a->>'id')::uuid)) then
    raise exception 'six existing demo accounts required' using errcode='22023';
  end if;
  update openjio_private.demo_environment set accounts=p_accounts where singleton and accounts='[]'::jsonb;
  if not found then raise exception 'demo accounts already registered' using errcode='22023'; end if;
end $$;

create function public.openjio_demo_reset(p_actor uuid,p_fixture jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare config openjio_private.demo_environment; s jsonb; j jsonb; h jsonb; scoped jsonb; rev bigint;
begin
  select * into strict config from openjio_private.demo_environment where singleton for update;
  if not exists(select 1 from jsonb_array_elements(config.accounts)a where a->>'id'=p_actor::text) then
    raise exception 'demo account required' using errcode='42501';
  end if;
  s:=p_fixture->'state';
  if jsonb_array_length(s->'users')<>6 or exists(
    select 1 from jsonb_array_elements(s->'users')u where not exists(
      select 1 from jsonb_array_elements(config.accounts)a where a->>'id'=u->>'id')) then
    raise exception 'invalid demo users' using errcode='22023';
  end if;
  -- Block concurrent planner commits through the reset; any failure rolls back
  -- the deletion and the complete replacement together.
  select revision into rev from openjio_private.catalogue_revision where singleton for update;
  lock table public.hangouts,public.listings in exclusive mode;
  delete from public.hangouts;
  delete from public.listings;
  for j in select value from jsonb_array_elements(s->'users') loop
    update public.profiles set display_name=j->>'name',home_area=j->>'homeArea',revision=revision+1 where id=(j->>'id')::uuid;
    delete from public.profile_interests where profile_id=(j->>'id')::uuid;
    insert into public.profile_interests(profile_id,interest_slug,weight)
      select (j->>'id')::uuid,key,value::numeric from jsonb_each_text(j->'interests');
  end loop;
  for j in select value from jsonb_array_elements(p_fixture->'catalogue') loop
    if not coalesce((j->>'sample')::boolean,false) then
      raise exception 'demo catalogue must be labelled sample' using errcode='22023';
    end if;
    perform openjio_private.upsert_listing(j);
  end loop;
  for h in select value from jsonb_array_elements(s->'hangouts') loop
    scoped:=s||jsonb_build_object('hangouts',jsonb_build_array(h),'members',
      (select jsonb_agg(m) from jsonb_array_elements(s->'members')m where m->>'hangoutId'=h->>'id'));
    perform public.openjio_commit((h->>'hostId')::uuid,'createHangout','[]',jsonb_build_object('catalogue',rev),scoped);
  end loop;
  update openjio_private.catalogue_revision set revision=revision+1 where singleton;
  update openjio_private.demo_environment set reset_at=(p_fixture->>'resetAt')::timestamptz,anchor_date=(p_fixture->>'anchorDate')::date where singleton;
  return jsonb_build_object('anchorDate',p_fixture->>'anchorDate','resetAt',p_fixture->>'resetAt',
    'accounts',6,'hangouts',jsonb_array_length(s->'hangouts'),'listings',jsonb_array_length(p_fixture->'catalogue'));
end $$;

revoke execute on function public.openjio_demo_info(),public.openjio_demo_register(jsonb),public.openjio_demo_reset(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.openjio_demo_info(),public.openjio_demo_register(jsonb),public.openjio_demo_reset(uuid,jsonb) to service_role;
