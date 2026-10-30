import test from 'node:test'
import assert from 'node:assert/strict'
import { journeyFrame, JOURNEY_DURATION } from '../src/lib/landingJourney.js'

test('the outing starts at the first checkpoint, then dismisses its card before travel', () => {
  assert.deepEqual(journeyFrame(-20), { phase: 'stop', checkpoint: 0, reached: 0, progress: 0, leaving: false })
  assert.equal(journeyFrame(2600).leaving, true)
  assert.equal(journeyFrame(2800).phase, 'travel')
  assert.equal(journeyFrame(2800).checkpoint, null)
})

test('travel reaches the second stop before tracing the final leg', () => {
  assert.deepEqual(journeyFrame(3400), { phase: 'travel', checkpoint: null, reached: 0, progress: .5, leaving: false })
  assert.deepEqual(journeyFrame(4000), { phase: 'stop', checkpoint: 1, reached: 1, progress: 0, leaving: false })
  assert.equal(journeyFrame(6800).phase, 'travel')
  assert.equal(journeyFrame(7400).progress, .5)
  assert.equal(journeyFrame(8000).checkpoint, 2)
})

test('the final card dismisses and the completed route remains available', () => {
  assert.equal(journeyFrame(10600).leaving, true)
  assert.deepEqual(journeyFrame(JOURNEY_DURATION), { phase: 'done', checkpoint: null, reached: 2, progress: 1, leaving: false })
  assert.deepEqual(journeyFrame(JOURNEY_DURATION + 90000), journeyFrame(JOURNEY_DURATION))
})
