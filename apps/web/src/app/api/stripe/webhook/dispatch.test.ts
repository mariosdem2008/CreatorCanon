import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDispatchPlan } from './dispatch';

test('inprocess mode returns inprocess plan regardless of audio state', () => {
  const a = buildDispatchPlan({ mode: 'inprocess', hasAudioForAllVideos: true });
  const b = buildDispatchPlan({ mode: 'inprocess', hasAudioForAllVideos: false });
  assert.equal(a.kind, 'inprocess');
  assert.equal(b.kind, 'inprocess');
  assert.deepEqual(a.tasks, ['run-pipeline']);
});

test('trigger mode with missing audio returns extract-then-run chain', () => {
  const plan = buildDispatchPlan({ mode: 'trigger', hasAudioForAllVideos: false });
  assert.equal(plan.kind, 'trigger-chain');
  assert.deepEqual(plan.tasks, ['extract-run-audio', 'run-pipeline']);
});

test('trigger mode with audio already present skips extract', () => {
  const plan = buildDispatchPlan({ mode: 'trigger', hasAudioForAllVideos: true });
  assert.equal(plan.kind, 'trigger-direct');
  assert.deepEqual(plan.tasks, ['run-pipeline']);
});

test('worker mode leaves the run queued for a poller to pick up', () => {
  const a = buildDispatchPlan({ mode: 'worker', hasAudioForAllVideos: true });
  const b = buildDispatchPlan({ mode: 'worker', hasAudioForAllVideos: false });
  assert.equal(a.kind, 'worker-queued');
  assert.equal(b.kind, 'worker-queued');
  assert.deepEqual(a.tasks, []);
});
