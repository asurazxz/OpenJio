-- Provider retrieval is provenance, not human verification. Live OSM venues and
-- auto-extracted posts legitimately have no verified_at timestamp.
alter table public.listings drop constraint listings_check3;
alter table public.listings add constraint listings_published_provenance check (
  status <> 'published' or verified_at is not null
  or (source_kind in ('osm','scraped') and retrieved_at is not null)
);
-- Incomplete extracted offers remain view-only with explicit missing fields.
alter table public.listings drop constraint listings_check2;
alter table public.listings add constraint listings_route_ready_deal check (
  not route_ready or type <> 'deal' or validity is not null
);
