import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomForKey } from '../dist/zoom.js';

test('viewer zoom increases, decreases and resets independently', () => {
  for (const key of ['+', '=']) assert.equal(zoomForKey(1, key), 1.1);
  for (const key of ['-', '_']) assert.equal(zoomForKey(1, key), 0.9);
  assert.equal(zoomForKey(0.59, '0'), 1);
  assert.equal(zoomForKey(1, 'a'), undefined);
});

test('viewer zoom stays within readable bounds', () => {
  assert.equal(zoomForKey(0.5, '-'), 0.5);
  assert.equal(zoomForKey(3, '+'), 3);
});
