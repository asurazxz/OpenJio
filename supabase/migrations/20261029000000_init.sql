-- OpenJio initial schema (Supabase / Postgres).
-- Covers profiles and interests, hangouts with members and availability (private
-- raw intervals, aggregate heatmap via hangout_heatmap), locked-slot itineraries
-- with versioned stops and votes, shortlists, the content listings pipeline
-- (raw posts, ingest runs, labels, listings, deal outlets), and a route cache.
-- Row Level Security is enabled on every table. Permission rules mirror
-- client/src/api/index.js.

create extension if not exists pgcrypto;

/* ---------------- Tables ---------------- */

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  home_area text,
  reviewer boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists interests (
  slug text primary key,
  label text not null
);

create table if not exists profile_interests (
  profile_id uuid not null references profiles (id) on delete cascade,
  interest_slug text not null references interests (slug) on delete cascade,
  weight numeric not null check (weight between 0 and 1),
  primary key (profile_id, interest_slug)
);

create table if not exists hangouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text check (char_length(description) <= 200),
  mode text not null check (mode in ('group', 'solo')),
  visibility text not null check (visibility in ('private', 'public')),
  -- Solo plans are always private; public open jios are always group plans.
  check (mode = 'group' or visibility = 'private'),
  capacity int check (capacity is null or capacity between 2 and 8),
  check (visibility = 'private' or capacity is not null),
  invite_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  stage text not null default 'collecting'
    check (stage in ('collecting', 'voting', 'final', 'ended', 'cancelled')),
  -- Date range is null for fixed-slot hangouts (solo and public).
  date_from date,
  date_to date,
  check (
    (date_from is null and date_to is null)
    or (date_from is not null and date_to is not null and date_to >= date_from and date_to - date_from <= 6)
  ),
  start_area_label text,
  start_area_lat double precision check (start_area_lat is null or start_area_lat between -90 and 90),
  start_area_lng double precision check (start_area_lng is null or start_area_lng between -180 and 180),
  interests text[] not null default '{}',
  meal_wanted boolean not null default true,
  -- Slot is locked as a pair (both set or both null).
  locked_slot_start timestamptz,
  locked_slot_end timestamptz,
  check ((locked_slot_start is null) = (locked_slot_end is null)),
  check (locked_slot_end is null or locked_slot_end > locked_slot_start),
  plan_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hangout_members (
  hangout_id uuid not null references hangouts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('host', 'member')),
  required boolean not null default false,
  responded_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (hangout_id, user_id)
);

create table if not exists hangout_preferences (
  hangout_id uuid not null,
  user_id uuid not null,
  interest_slug text not null references interests (slug) on delete cascade,
  weight numeric not null check (weight between 0 and 1),
  primary key (hangout_id, user_id, interest_slug),
  foreign key (hangout_id, user_id) references hangout_members (hangout_id, user_id) on delete cascade
);

-- Free intervals only. Calendar busy time is converted to free time at import,
-- so no busy blocks are stored here.
create table if not exists availability_blocks (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null,
  user_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  source text not null check (source in ('grid', 'gcal')),
  foreign key (hangout_id, user_id) references hangout_members (hangout_id, user_id) on delete cascade
);

create table if not exists raw_posts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  channel_id text not null,
  message_id text not null,
  text text,
  links text[] not null default '{}',
  posted_at timestamptz,
  edited_at timestamptz,
  retrieved_at timestamptz not null default now(),
  unique (source, channel_id, message_id)
);

create table if not exists ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb
);

create table if not exists extraction_labels (
  raw_post_id uuid primary key references raw_posts (id) on delete cascade,
  labels jsonb not null,
  labelled_by uuid references profiles (id) on delete set null
);

-- One table for places, events and deals. Nullable columns apply by type.
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('place', 'event', 'deal')),
  kind text not null check (kind in ('meal', 'activity')),
  title text not null check (char_length(title) between 1 and 120),
  summary text,
  interests text[] not null default '{}',
  area text not null,
  address text,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  duration_mins int check (duration_mins is null or duration_mins > 0),
  price_level smallint check (price_level is null or price_level between 0 and 3),
  price_text text,
  -- Null means the opening hours are unknown.
  opening_hours jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (type <> 'event' or starts_at is not null),
  booking_url text,
  merchant text,
  deal_text text,
  validity jsonb,
  check (type <> 'deal' or validity is not null),
  conditions text[] not null default '{}',
  exclusions text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'expired', 'rejected')),
  check (status <> 'published' or verified_at is not null),
  source_kind text not null check (source_kind in ('curated', 'scraped', 'openjio')),
  source_name text,
  source_url text,
  retrieved_at timestamptz,
  verified_at timestamptz,
  raw_post_id uuid references raw_posts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists deal_outlets (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  name text not null,
  address text,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180)
);

create table if not exists itineraries (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null unique references hangouts (id) on delete cascade,
  generated_by text not null check (generated_by in ('auto', 'manual')),
  method text,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

-- Deferrable so that stops can be reordered inside one transaction.
create table if not exists itinerary_stops (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references itineraries (id) on delete cascade,
  seq int not null check (seq >= 1),
  version int not null default 1 check (version >= 1),
  -- Restrict: a listing used in a plan cannot be hard-deleted.
  listing_id uuid not null references listings (id) on delete restrict,
  constraint itinerary_stops_seq_key unique (itinerary_id, seq) deferrable initially deferred
);

-- Votes count only while stop_version matches the stop's current version.
create table if not exists stop_votes (
  stop_id uuid not null references itinerary_stops (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  stop_version int not null check (stop_version >= 1),
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (stop_id, user_id)
);

create table if not exists shortlist (
  hangout_id uuid not null references hangouts (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  added_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hangout_id, listing_id)
);

-- Server-side cache only. No client policies: the service role reads and writes it.
create table if not exists route_cache (
  from_lat double precision not null,
  from_lng double precision not null,
  to_lat double precision not null,
  to_lng double precision not null,
  mode text not null,
  departure_hour timestamptz not null,
  duration_mins int not null check (duration_mins > 0),
  fetched_at timestamptz not null default now(),
  primary key (from_lat, from_lng, to_lat, to_lng, mode, departure_hour)
);

/* ---------------- Indexes ---------------- */

create index if not exists profile_interests_interest_slug_idx on profile_interests (interest_slug);
create index if not exists hangouts_host_id_idx on hangouts (host_id);
create index if not exists hangouts_visibility_stage_idx on hangouts (visibility, stage);
create index if not exists hangout_members_user_id_idx on hangout_members (user_id);
create unique index if not exists hangout_members_one_host_idx on hangout_members (hangout_id) where role = 'host';
create index if not exists hangout_preferences_interest_slug_idx on hangout_preferences (interest_slug);
create index if not exists availability_blocks_hangout_id_idx on availability_blocks (hangout_id);
create index if not exists availability_blocks_user_id_idx on availability_blocks (user_id);
create index if not exists listings_status_type_idx on listings (status, type);
create index if not exists listings_area_idx on listings (area);
create index if not exists listings_raw_post_id_idx on listings (raw_post_id);
create index if not exists deal_outlets_listing_id_idx on deal_outlets (listing_id);
create index if not exists itinerary_stops_listing_id_idx on itinerary_stops (listing_id);
create index if not exists stop_votes_user_id_idx on stop_votes (user_id);
create index if not exists shortlist_listing_id_idx on shortlist (listing_id);
create index if not exists shortlist_added_by_idx on shortlist (added_by);
create index if not exists extraction_labels_labelled_by_idx on extraction_labels (labelled_by);

/* ---------------- Helper functions ---------------- */

create or replace function is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hangout_members m
    where m.hangout_id = h and m.user_id = auth.uid()
  );
$$;

create or replace function is_host(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hangouts hg
    where hg.id = h and hg.host_id = auth.uid()
  );
$$;

create or replace function is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.reviewer
  );
$$;

-- Aggregate free counts per 30 minute cell, 08:00 to 24:00 Singapore time, across
-- the hangout's date range. A user counts for a cell only when one of their free
-- intervals covers the whole cell (rounds free time inwards).
create or replace function hangout_heatmap(h uuid)
returns table (cell_start timestamptz, free_count int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_member(h) then
    raise exception 'not a member of this hangout' using errcode = '42501';
  end if;

  return query
    with span as (
      select hg.date_from, hg.date_to
      from hangouts hg
      where hg.id = h
    ),
    cells as (
      select ((d + make_interval(mins => 480 + 30 * g.n)) at time zone 'Asia/Singapore') as cs
      from span
      cross join lateral generate_series(span.date_from::timestamp, span.date_to::timestamp, interval '1 day') as d
      cross join generate_series(0, 31) as g(n)
    )
    select c.cs, count(distinct b.user_id)::int
    from cells c
    left join availability_blocks b
      on b.hangout_id = h
     and b.start_at <= c.cs
     and b.end_at >= c.cs + interval '30 minutes'
    group by c.cs
    order by c.cs;
end;
$$;

revoke execute on function hangout_heatmap(uuid) from public, anon;
grant execute on function hangout_heatmap(uuid) to authenticated;

/* ---------------- Triggers ---------------- */

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hangouts_set_updated_at on hangouts;
create trigger hangouts_set_updated_at
  before update on hangouts
  for each row execute function set_updated_at();

-- A changed listing gets a new version, so earlier votes on that position stop counting.
create or replace function bump_stop_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.listing_id is distinct from old.listing_id then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists itinerary_stops_bump_version on itinerary_stops;
create trigger itinerary_stops_bump_version
  before update of listing_id on itinerary_stops
  for each row execute function bump_stop_version();

-- Members may update their own responded_at, but only the host may change required.
create or replace function guard_member_required()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.required is distinct from old.required and not is_host(new.hangout_id) then
    raise exception 'only the host can change the required flag' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists hangout_members_guard_required on hangout_members;
create trigger hangout_members_guard_required
  before update on hangout_members
  for each row execute function guard_member_required();

/* ---------------- Column-level grants ---------------- */

-- Keep reviewer and role changes out of client reach, whatever the policies say.
revoke insert, update on profiles from anon, authenticated;
grant insert (id, display_name, home_area) on profiles to authenticated;
grant update (display_name, home_area) on profiles to authenticated;

revoke update on hangout_members from anon, authenticated;
grant update (required, responded_at) on hangout_members to authenticated;

/* ---------------- Row Level Security ---------------- */

alter table profiles enable row level security;
alter table interests enable row level security;
alter table profile_interests enable row level security;
alter table hangouts enable row level security;
alter table hangout_members enable row level security;
alter table hangout_preferences enable row level security;
alter table availability_blocks enable row level security;
alter table raw_posts enable row level security;
alter table ingest_runs enable row level security;
alter table extraction_labels enable row level security;
alter table listings enable row level security;
alter table deal_outlets enable row level security;
alter table itineraries enable row level security;
alter table itinerary_stops enable row level security;
alter table stop_votes enable row level security;
alter table shortlist enable row level security;
alter table route_cache enable row level security;

-- profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (true);

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- interests (public catalogue)
drop policy if exists interests_select on interests;
create policy interests_select on interests for select to anon, authenticated
  using (true);

-- profile_interests
drop policy if exists profile_interests_own on profile_interests;
create policy profile_interests_own on profile_interests for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- hangouts
drop policy if exists hangouts_select on hangouts;
create policy hangouts_select on hangouts for select to authenticated
  using (
    host_id = auth.uid()
    or is_member(id)
    or (visibility = 'public' and stage in ('voting', 'final'))
  );

drop policy if exists hangouts_insert_host on hangouts;
create policy hangouts_insert_host on hangouts for insert to authenticated
  with check (host_id = auth.uid());

drop policy if exists hangouts_update_host on hangouts;
create policy hangouts_update_host on hangouts for update to authenticated
  using (is_host(id))
  with check (host_id = auth.uid());

drop policy if exists hangouts_delete_host on hangouts;
create policy hangouts_delete_host on hangouts for delete to authenticated
  using (is_host(id));

-- hangout_members
-- Self-join is allowed only into an open public group plan. Invite-link joins need a
-- security definer join function, which is not part of this migration.
drop policy if exists hangout_members_select on hangout_members;
create policy hangout_members_select on hangout_members for select to authenticated
  using (is_member(hangout_id) or is_host(hangout_id));

drop policy if exists hangout_members_insert on hangout_members;
create policy hangout_members_insert on hangout_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (role = 'host' and is_host(hangout_id))
      or (
        role = 'member'
        and required = false
        and exists (
          select 1 from hangouts hg
          where hg.id = hangout_members.hangout_id
            and hg.visibility = 'public'
            and hg.mode = 'group'
            and hg.stage not in ('ended', 'cancelled')
        )
      )
    )
  );

drop policy if exists hangout_members_update_host on hangout_members;
create policy hangout_members_update_host on hangout_members for update to authenticated
  using (is_host(hangout_id))
  with check (is_host(hangout_id));

drop policy if exists hangout_members_update_self on hangout_members;
create policy hangout_members_update_self on hangout_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists hangout_members_delete_self on hangout_members;
create policy hangout_members_delete_self on hangout_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'host');

-- hangout_preferences (each user sees and edits only their own)
drop policy if exists hangout_preferences_own on hangout_preferences;
create policy hangout_preferences_own on hangout_preferences for all to authenticated
  using (user_id = auth.uid() and is_member(hangout_id))
  with check (user_id = auth.uid() and is_member(hangout_id));

-- availability_blocks: raw intervals are private to their owner.
-- Writes are blocked once a slot is locked, as in the demo (stage must be collecting).
drop policy if exists availability_blocks_select_own on availability_blocks;
create policy availability_blocks_select_own on availability_blocks for select to authenticated
  using (user_id = auth.uid());

drop policy if exists availability_blocks_insert_own on availability_blocks;
create policy availability_blocks_insert_own on availability_blocks for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_member(hangout_id)
    and exists (
      select 1 from hangouts hg
      where hg.id = availability_blocks.hangout_id
        and (hg.locked_slot_start is null or hg.stage = 'collecting')
    )
  );

drop policy if exists availability_blocks_update_own on availability_blocks;
create policy availability_blocks_update_own on availability_blocks for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and is_member(hangout_id)
    and exists (
      select 1 from hangouts hg
      where hg.id = availability_blocks.hangout_id
        and (hg.locked_slot_start is null or hg.stage = 'collecting')
    )
  );

drop policy if exists availability_blocks_delete_own on availability_blocks;
create policy availability_blocks_delete_own on availability_blocks for delete to authenticated
  using (user_id = auth.uid());

-- itineraries and itinerary_stops: members read, host writes
drop policy if exists itineraries_select on itineraries;
create policy itineraries_select on itineraries for select to authenticated
  using (is_member(hangout_id));

drop policy if exists itineraries_write_host on itineraries;
create policy itineraries_write_host on itineraries for all to authenticated
  using (is_host(hangout_id))
  with check (is_host(hangout_id));

drop policy if exists itinerary_stops_select on itinerary_stops;
create policy itinerary_stops_select on itinerary_stops for select to authenticated
  using (
    exists (
      select 1 from itineraries it
      where it.id = itinerary_stops.itinerary_id and is_member(it.hangout_id)
    )
  );

drop policy if exists itinerary_stops_write_host on itinerary_stops;
create policy itinerary_stops_write_host on itinerary_stops for all to authenticated
  using (
    exists (
      select 1 from itineraries it
      where it.id = itinerary_stops.itinerary_id and is_host(it.hangout_id)
    )
  )
  with check (
    exists (
      select 1 from itineraries it
      where it.id = itinerary_stops.itinerary_id and is_host(it.hangout_id)
    )
  );

-- stop_votes: members read; a user writes only their own vote, only while voting,
-- and only against the stop's current version.
drop policy if exists stop_votes_select on stop_votes;
create policy stop_votes_select on stop_votes for select to authenticated
  using (
    exists (
      select 1
      from itinerary_stops s
      join itineraries it on it.id = s.itinerary_id
      where s.id = stop_votes.stop_id and is_member(it.hangout_id)
    )
  );

drop policy if exists stop_votes_write_own on stop_votes;
create policy stop_votes_write_own on stop_votes for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from itinerary_stops s
      join itineraries it on it.id = s.itinerary_id
      join hangouts hg on hg.id = it.hangout_id
      where s.id = stop_votes.stop_id
        and hg.stage = 'voting'
        and is_member(hg.id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from itinerary_stops s
      join itineraries it on it.id = s.itinerary_id
      join hangouts hg on hg.id = it.hangout_id
      where s.id = stop_votes.stop_id
        and s.version = stop_votes.stop_version
        and hg.stage = 'voting'
        and is_member(hg.id)
    )
  );

-- shortlist: members read and add; the adder or the host removes
drop policy if exists shortlist_select on shortlist;
create policy shortlist_select on shortlist for select to authenticated
  using (is_member(hangout_id));

drop policy if exists shortlist_insert on shortlist;
create policy shortlist_insert on shortlist for insert to authenticated
  with check (added_by = auth.uid() and is_member(hangout_id));

drop policy if exists shortlist_delete on shortlist;
create policy shortlist_delete on shortlist for delete to authenticated
  using (added_by = auth.uid() or is_host(hangout_id));

-- listings: everyone reads published rows; reviewers read all and write
drop policy if exists listings_select_published on listings;
create policy listings_select_published on listings for select to anon, authenticated
  using (status = 'published' or is_reviewer());

drop policy if exists listings_write_reviewer on listings;
create policy listings_write_reviewer on listings for all to authenticated
  using (is_reviewer())
  with check (is_reviewer());

-- deal_outlets follow their listing's visibility; reviewers write
drop policy if exists deal_outlets_select on deal_outlets;
create policy deal_outlets_select on deal_outlets for select to anon, authenticated
  using (
    is_reviewer()
    or exists (
      select 1 from listings l
      where l.id = deal_outlets.listing_id and l.status = 'published'
    )
  );

drop policy if exists deal_outlets_write_reviewer on deal_outlets;
create policy deal_outlets_write_reviewer on deal_outlets for all to authenticated
  using (is_reviewer())
  with check (is_reviewer());

-- reviewer-only tables
drop policy if exists raw_posts_reviewer on raw_posts;
create policy raw_posts_reviewer on raw_posts for all to authenticated
  using (is_reviewer())
  with check (is_reviewer());

drop policy if exists ingest_runs_reviewer on ingest_runs;
create policy ingest_runs_reviewer on ingest_runs for all to authenticated
  using (is_reviewer())
  with check (is_reviewer());

drop policy if exists extraction_labels_reviewer on extraction_labels;
create policy extraction_labels_reviewer on extraction_labels for all to authenticated
  using (is_reviewer())
  with check (is_reviewer());

-- route_cache: RLS on with no client policies, so only the service role can access it.

/* ---------------- Seed data ---------------- */

insert into interests (slug, label) values
  ('food', 'Food'),
  ('cafes', 'Cafes'),
  ('nightlife', 'Nightlife'),
  ('outdoors', 'Outdoors'),
  ('arts', 'Arts'),
  ('museums', 'Museums'),
  ('shopping', 'Shopping'),
  ('music', 'Music'),
  ('games', 'Games'),
  ('wellness', 'Wellness'),
  ('markets', 'Markets'),
  ('workshops', 'Workshops')
on conflict do nothing;
