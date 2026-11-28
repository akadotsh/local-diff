import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pixelCommand } from '../src/pixel.js';
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
  assert.match(result.stdout, /Usage: local-diff/);
  assert.match(result.stdout, /Requires Node\.js/);
  assert.match(result.stdout, /Git, Rex, and a Pixel-supported terminal/);
});

test('Pixel launcher resolves packaged paths independently of the working directory', () => {
  const url = 'http://127.0.0.1:4189';
  const [command, cli, entry, separator, argument] = pixelCommand(url);
  assert.equal(command, process.execPath);
  assert.match(cli!, /@zenbu-labs[/\\]pixel[/\\]dist[/\\]bin\.js$/);
  assert.match(entry!, /hosts[/\\]pixel[/\\]dist[/\\]main\.js$/);
  assert.equal(separator, '--');
  assert.equal(argument, url);
});

test('root dev opens Pixel with hot reload when Rex only supplies a block ID', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'local-diff-dev-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);
  const calls = join(dir, 'calls.jsonl');
  await writeFile(join(dir, 'rex'), `#!/bin/sh
exec '${process.execPath}' '${join(dir, 'rex.mjs')}' "$@"
`, { mode: 0o755 });
  await writeFile(join(dir, 'rex.mjs'), `
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.TEST_REX_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'block' && args[1] === 'ls') console.log(JSON.stringify({blocks:[{block_id:'block:test'}]}));
if (args[0] === 'run') console.log(JSON.stringify({block_ids:['block:pixel']}));
`);
  const result = await promisify(execFile)(process.execPath, [resolve('scripts/run-local.mjs'), '--dev'], {
    cwd: dir,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REX_SESSION: '', REX_BLOCK: 'block:test', TEST_REX_CALLS: calls },
    timeout: 15000,
  });
  assert.match(result.stdout, /Local checkout in Pixel/);
  assert.match(result.stdout, /frontend hot reload enabled/);
  const commands = (await readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
  const launch = commands.find(args => args[0] === 'run')!;
  assert.ok(launch.includes('block:test'));
  assert.ok(launch.some(arg => arg.endsWith('/pixel/dist/bin.js')));
  assert.ok(launch.some(arg => arg.endsWith('/hosts/pixel/dist/main.js')));
  assert.ok(commands.some(args => args[0] === 'wait' && args[1] === 'block:pixel'));
  assert.ok(commands.some(args => args[0] === 'block' && args[1] === 'close' && args[2] === 'block:pixel'));
});

test('standalone Pixel bridge forwards arguments to the runtime launcher', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { runPixelCLI } from ${JSON.stringify(pathToFileURL(resolve('dist-node/pixel.js')).href)};
    process.execPath = ${JSON.stringify(resolve('local-diff'))};
    process.argv = [process.execPath, process.execPath, '--internal-pixel', '--help'];
    runPixelCLI();
  `], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /usage: pixel/);
});
