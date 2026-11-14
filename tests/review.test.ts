import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewMessage, selectionContext } from '../src/shared/review.js';

test('formats selected added and removed patch lines into agent context', () => {
  const patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -3,2 +3,2 @@\n keep\n-old\n+new';
  const added = selectionContext(patch, { start: 4, end: 4, side: 'additions' });
  assert.equal(added.code, 'new');
  assert.equal(added.filename, 'src/a.ts');
  assert.equal(selectionContext(patch, { start: 3, end: 4, side: 'additions' }).code, 'keep\nnew');
  const deleted = selectionContext(patch, { start: 4, end: 4, side: 'deletions' });
  assert.equal(deleted.code, 'old');
  assert.match(reviewMessage('/repo', { ...deleted, filename: '/repo/src/a.ts' }, 'Why?'), /File: src\/a\.ts/);
  assert.match(reviewMessage('/repo', added, 'Explain this'), /Question: Explain this/);
});

test('preserves selected source lines that resemble Git file headers', () => {
  const patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n--- old marker\n+++ new marker';
  assert.equal(selectionContext(patch, { start: 1, end: 1, side: 'deletions' }).code, '-- old marker');
  assert.equal(selectionContext(patch, { start: 1, end: 1, side: 'additions' }).code, '++ new marker');
});
