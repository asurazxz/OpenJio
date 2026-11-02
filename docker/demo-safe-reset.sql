-- The local Postgres image requires WHERE clauses even for intentional demo
-- replacement. Keep the applied demo initializer immutable and amend its RPC.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.openjio_demo_reset(uuid,jsonb)'::regprocedure);
  definition:=replace(definition,'delete from public.hangouts;','delete from public.hangouts where id is not null;');
  definition:=replace(definition,'delete from public.listings;','delete from public.listings where id is not null;');
  execute definition;
end $$;
