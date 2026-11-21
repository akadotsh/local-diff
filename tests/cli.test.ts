import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseCliArgs } from '../src/shared/cliArgs.js';

test('parses Rex cwd, session, block, and split direction arguments', () => {
  assert.deepEqual(parseCliArgs(['--cwd', '/work/project', '--session', 'session:one', '--block', 'block:two', '--split', 'below'], '/tmp'), {
    help: false, cwd: '/work/project', session: 'session:one', block: 'block:two', split: 'below',
  });
  assert.equal(parseCliArgs(['--cwd', 'file://rex-host/Users/me/My%20Project'], '/tmp').cwd, '/Users/me/My Project');
  assert.equal(parseCliArgs([], '/tmp').split, 'right');
  assert.equal(parseCliArgs(['--split=above'], '/tmp').split, 'above');
  assert.throws(() => parseCliArgs(['--split', 'diagonal'], '/tmp'), /must be right, left, above, or below/);
  assert.throws(() => parseCliArgs(['--cwd'], '/tmp'), /requires a value/);
  assert.throws(() => parseCliArgs(['--unknown'], '/tmp'), /Unknown option/);
});

test('compiled production CLI runs with Node.js outside the repository', () => {
  const result = spawnSync(process.execPath, [resolve('dist-node/cli.js'), '--help'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: rex-pierre-diffs/);
  assert.match(result.stdout, /Requires Node\.js/);
  assert.match(result.stdout, /macOS 14 or newer, Git, Rex, and rexweb/);
});
