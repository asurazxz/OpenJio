import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

async function localServer(t, mode) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), DATA_MODE: mode, GEOAPIFY_API_KEY: '', ONEMAP_EMAIL: '', ONEMAP_PASSWORD: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local place service did not start')), 10000);
    const ready = () => { clearTimeout(timeout); resolve(); };
    child.stdout.on('data', chunk => { if (String(chunk).includes('OpenJio server listening')) ready(); });
    child.stderr.resume();
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Local place service exited before starting')); });
  });
  return `http://127.0.0.1:${port}`;
}

test('place HTTP routes report missing credentials and throttle repeated requests without provider calls', async t => {
  const base = await localServer(t, 'demo');
  const status = await fetch(`${base}/api/places/status`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).configured, false);
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${base}/api/places/search?q=cafe`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'places_missing');
  }
  const limited = await fetch(`${base}/api/places/search?q=cafe`);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, 'places_limit');
});

test('shared-account place HTTP routes require authentication before reaching the provider', async t => {
  const base = await localServer(t, 'supabase');
  for (const endpoint of ['search?q=cafe', 'details?id=example']) {
    const response = await fetch(`${base}/api/places/${endpoint}`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'auth');
  }
});

test('shared-account OneMap routes require authentication before spending provider quota', async t => {
  const base = await localServer(t, 'supabase');
  for (const endpoint of ['geocode?q=bugis', 'route?from=1.3,103.8&to=1.29,103.85&mode=walk']) {
    const response = await fetch(`${base}/api/${endpoint}`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'auth');
  }
});

test('geocoding is rate limited per client', async t => {
  const base = await localServer(t, 'demo');
  for (let i = 0; i < 30; i++) assert.equal((await fetch(`${base}/api/geocode?q=bugis`)).status, 503);
  const limited = await fetch(`${base}/api/geocode?q=bugis`);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, 'geocode_limit');
});
