-- Automatic posts without an address remain visible in Cards with an explicit
-- location gap. Missing data must stay null; it must never invent a map pin.
alter table public.listings alter column area drop not null;
alter table public.listings add constraint listings_route_ready_location check (
  not route_ready or (area is not null and lat is not null and lng is not null)
);
