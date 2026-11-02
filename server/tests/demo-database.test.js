// Explicit opt-in: only the fixed, isolated demo container is queried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('demo reset is atomic and its RPC is inaccessible to browser roles', { skip: process.env.OPENJIO_DEMO_SQL_TEST !== '1' }, () => {
  const sql = `
    do $$
    declare before_counts jsonb; after_counts jsonb; config jsonb; failed boolean:=false;
    begin
      select jsonb_build_object('hangouts',(select count(*) from public.hangouts),
        'listings',(select count(*) from public.listings),'votes',(select count(*) from public.stop_votes)) into before_counts;
      select accounts into config from openjio_private.demo_environment where singleton;
      begin
        perform public.openjio_demo_reset((config->0->>'id')::uuid,jsonb_build_object(
          'state',jsonb_build_object('users',config,'hangouts','[]'::jsonb),
          'catalogue',jsonb_build_array(jsonb_build_object('id','invalid','type','not-a-listing','title','Bad fixture','sample',true))));
      exception when others then failed:=true;
      end;
      if not failed then raise exception 'invalid fixture unexpectedly accepted'; end if;
      select jsonb_build_object('hangouts',(select count(*) from public.hangouts),
        'listings',(select count(*) from public.listings),'votes',(select count(*) from public.stop_votes)) into after_counts;
      if before_counts is distinct from after_counts then raise exception 'reset was not atomic'; end if;
      if has_function_privilege('authenticated','public.openjio_demo_reset(uuid,jsonb)','execute') or
         has_function_privilege('anon','public.openjio_demo_reset(uuid,jsonb)','execute') then
        raise exception 'browser roles can execute reset RPC';
      end if;
    end $$;
    select jsonb_build_object('accounts',(select count(*) from auth.users),'hangouts',(select count(*) from public.hangouts),
      'listings',(select count(*) from public.listings),'anchorDate',(select anchor_date from openjio_private.demo_environment));
  `;
  const result = execFileSync('docker', ['exec', '-i', 'openjio-demo-db-1', 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  const summary = JSON.parse(result.trim());
  assert.equal(summary.accounts, 6);
  assert.equal(summary.hangouts, 5);
  assert.ok(summary.listings > 50);
});
