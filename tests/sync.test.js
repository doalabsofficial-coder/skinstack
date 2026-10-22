import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../docs/js/sync.js';

test('first link on a device never silently overwrites cloud data', () => {
  assert.equal(decide({ linked: false, remoteAt: '2026-10-20T00:00:00.000Z', localAt: '2026-10-22T00:00:00.000Z' }), 'ask');
  assert.equal(decide({ linked: false, remoteAt: null, localAt: '2026-10-22T00:00:00.000Z' }), 'push');
});

test('linked device: newer side wins', () => {
  assert.equal(decide({ linked: true, remoteAt: '2026-10-22T10:00:00.000Z', localAt: '2026-10-22T09:00:00.000Z' }), 'pull');
  assert.equal(decide({ linked: true, remoteAt: '2026-10-22T09:00:00.000Z', localAt: '2026-10-22T10:00:00.000Z' }), 'push');
  assert.equal(decide({ linked: true, remoteAt: '2026-10-22T10:00:00.000Z', localAt: '2026-10-22T10:00:00.000Z' }), 'none');
  assert.equal(decide({ linked: true, remoteAt: null, localAt: '2026-10-22T10:00:00.000Z' }), 'push');
});
