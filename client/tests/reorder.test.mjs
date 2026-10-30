import test from 'node:test'
import assert from 'node:assert/strict'
import { moveIndex } from '../src/lib/reorder.js'

test('moveIndex moves an item to the requested final position without mutating input', () => {
  const items = ['a', 'b', 'c', 'd']
  assert.deepEqual(moveIndex(items, 1, 3), ['a', 'c', 'd', 'b'])
  assert.deepEqual(moveIndex(items, 3, 1), ['a', 'd', 'b', 'c'])
  assert.deepEqual(items, ['a', 'b', 'c', 'd'])
})

test('moveIndex returns original sequence for invalid and no-op moves', () => {
  const items = ['a', 'b']
  assert.equal(moveIndex(items, 0, 0), items)
  assert.equal(moveIndex(items, -1, 1), items)
  assert.equal(moveIndex(items, 0, 2), items)
})
