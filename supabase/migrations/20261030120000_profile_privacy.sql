-- Profiles were readable by every signed-in user, exposing home areas, bios and
-- the reviewer flag. A person now reads only their own profile and the profiles
-- of people they share a hangout with. Trusted Express uses the service role and
-- is unaffected; browsers receive projected domain DTOs from it.
create or replace function public.shares_hangout(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hangout_members mine
    join public.hangout_members theirs on theirs.hangout_id = mine.hangout_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p
  );
$$;
revoke execute on function public.shares_hangout(uuid) from public, anon;
grant execute on function public.shares_hangout(uuid) to authenticated, service_role;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_hangout(id));
