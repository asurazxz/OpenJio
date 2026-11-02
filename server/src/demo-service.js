import { buildDemoFixture } from './demo-fixtures.js';
import { domainError } from './hosted.js';

export function createDemoService({ enabled = false, repository, now = Date.now }) {
  let resetting = null;
  return {
    async reset(token) {
      if (!enabled) throw domainError('forbidden', 'Demo reset is unavailable on this installation.');
      const identity = token ? await repository.verifyToken(token) : null;
      if (!identity) throw domainError('auth', 'Sign in to a demo account before resetting.');
      const info = await repository.demoInfo();
      if (!info?.accounts?.some(a => a.id === identity.id)) throw domainError('forbidden', 'Use one of the six demo accounts to reset this installation.');
      if (resetting) throw domainError('conflict', 'A demo reset is already in progress. Please wait.');
      resetting = (async () => {
        const fixture = await buildDemoFixture({ users: info.accounts, now: now() });
        return repository.resetDemo(identity.id, fixture);
      })();
      try { return await resetting; } finally { resetting = null; }
    },
  };
}
