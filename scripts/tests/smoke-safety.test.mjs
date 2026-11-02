import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('HTTP smoke refuses account creation without explicit test-write opt-in', () => {
  const result = spawnSync(process.execPath, ['scripts/test-hosted.mjs'], {
    env: { ...process.env, OPENJIO_BASE_URL: 'http://127.0.0.1:1', OPENJIO_TEST_ALLOW_WRITES: '' }, encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /OPENJIO_TEST_ALLOW_WRITES=1/)
  assert.doesNotMatch(result.stderr, /fetch failed/)
})
