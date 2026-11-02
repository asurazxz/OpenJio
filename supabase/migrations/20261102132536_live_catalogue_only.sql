-- The local shared database holds actual provider data and user-created plans.
-- Keep existing referenced samples archived when upgrading a previous database;
-- fresh databases never insert them (the unused historical seed was removed).
update public.listings set status='expired' where sample;

alter table public.listings drop constraint listings_source_kind_check;
alter table public.listings add constraint listings_source_kind_check
  check (source_kind in ('curated','scraped','openjio','osm'));
alter table public.listings drop constraint listings_review_status_check;
alter table public.listings add constraint listings_review_status_check
  check (review_status in ('route-ready','manual-view-only','auto-extracted'));

create function public.openjio_sync_live_listings(p_listings jsonb)
returns void language plpgsql set search_path='' as $$
declare j jsonb; changed boolean := false;
begin
  if jsonb_typeof(p_listings) <> 'array' or jsonb_array_length(p_listings) > 5000 then
    raise exception 'invalid live catalogue' using errcode='22023';
  end if;
  perform revision from openjio_private.catalogue_revision where singleton for update;
  for j in select value from jsonb_array_elements(p_listings) loop
    if coalesce((j->>'sample')::boolean,false) or coalesce(j->'source'->>'kind','') not in ('osm','scraped') then
      raise exception 'live provider listings only' using errcode='22023';
    end if;
    if not exists(select 1 from public.listings l where l.publication_key=j->>'id' and l.details=j and l.status='published') then
      perform openjio_private.upsert_listing(j);
      changed := true;
    end if;
  end loop;
  -- Withdrawn or ended extracted posts must disappear. Keep their records for
  -- provenance rather than deleting them; these posts are view-only.
  update public.listings set status='expired' where source_kind='scraped' and status='published'
    and publication_key not in (select value->>'id' from jsonb_array_elements(p_listings));
  if found then changed := true; end if;
  if changed then update openjio_private.catalogue_revision set revision=revision+1 where singleton; end if;
end $$;
revoke execute on function public.openjio_sync_live_listings(jsonb) from public,anon,authenticated;
grant execute on function public.openjio_sync_live_listings(jsonb) to service_role;
