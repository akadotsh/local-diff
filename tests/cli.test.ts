import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('compiled production CLI runs with Node.js outside the repository', () => {
  const result = spawnSync(process.execPath, [resolve('dist-node/cli.js'), '--help'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: rex-pierre-diffs/);
  assert.match(result.stdout, /Requires Node\.js/);
});
