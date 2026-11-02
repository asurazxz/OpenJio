// Run inside the isolated demo API container after its demo-only schema exists.
import { DEMO_ACCOUNTS, buildDemoFixture } from './demo-fixtures.js';

if (process.env.OPENJIO_DEMO_ENABLED !== '1') throw new Error('Demo bootstrap requires the isolated demo installation.');
const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.OPENJIO_DEMO_PASSWORD;
if (!base || !key || !password) throw new Error('Demo bootstrap is not configured.');
async function send(path, body, method = 'POST') {
  const response = await fetch(`${base}${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Demo bootstrap request failed (${response.status}): ${data.msg || data.message || data.error || path}`);
  return data;
}
// This request fails on the normal database, before creating any identities.
let info = await send('/rest/v1/rpc/openjio_demo_info', {});
if (!info.accounts.length) {
  const result = await send('/auth/v1/admin/users?page=1&per_page=1000', undefined, 'GET');
  const existing = result.users || [];
  const users = [];
  for (const account of DEMO_ACCOUNTS) {
    let user = existing.find(u => u.email === account.email);
    if (!user) user = await send('/auth/v1/admin/users', {
      email: account.email, password, email_confirm: true,
      user_metadata: { display_name: account.name }, app_metadata: { openjio_demo: true },
    });
    users.push({ ...account, id: user.id });
  }
  await send('/rest/v1/rpc/openjio_demo_register', { p_accounts: users });
  info = await send('/rest/v1/rpc/openjio_demo_info', {});
}
const fixture = await buildDemoFixture({ users: info.accounts });
const summary = await send('/rest/v1/rpc/openjio_demo_reset', { p_actor: info.accounts[0].id, p_fixture: fixture });
console.log(JSON.stringify(summary));
