import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoService } from '../src/demo-service.js';

test('ordinary installations reject reset before touching authentication or the database', async () => {
  const service = createDemoService({ repository: new Proxy({}, { get() { throw new Error('Database must not be touched'); } }) });
  await assert.rejects(() => service.reset('token'), e => e.code === 'forbidden');
});
test('demo reset rejects missing or invalid sessions', async () => {
  const service = createDemoService({ enabled: true, repository: { verifyToken: async () => null } });
  await assert.rejects(() => service.reset(), e => e.code === 'auth');
  await assert.rejects(() => service.reset('invalid'), e => e.code === 'auth');
});
test('an authenticated non-demo account cannot reset the demo database', async () => {
  const service = createDemoService({ enabled: true, repository: { verifyToken: async () => ({ id: 'other' }), demoInfo: async () => ({ accounts: [{ id: 'demo' }] }) } });
  await assert.rejects(() => service.reset('token'), e => e.code === 'forbidden');
});
test('a normal database missing the demo marker cannot be used even when the server flag is enabled', async () => {
  const service = createDemoService({ enabled: true, repository: {
    verifyToken: async () => ({ id: 'demo' }),
    demoInfo: async () => { throw Object.assign(new Error('No demo schema'), { code: 'unavailable' }); },
    resetDemo: async () => assert.fail('No reset may run without the demo marker'),
  } });
  await assert.rejects(() => service.reset('token'), /No demo schema/);
});
