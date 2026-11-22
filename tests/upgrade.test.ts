import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareVersions, detectInstallation, installedVersion, latestVersion, run, upgrade } from '../src/upgrade.js';

test('semantic version precedence and validation', () => {
  for (const [a, b] of [['1.10.0', '1.9.0'], ['2.0.0', '1.99.0'], ['1.0.0', '1.0.0-rc.1'], ['1.0.0-rc.10', '1.0.0-rc.2'], ['1.0.0-a', '1.0.0-1'], ['1.0.0-a.1', '1.0.0-a']]) {
    assert.equal(compareVersions(a, b), 1);
    assert.equal(compareVersions(b, a), -1);
  }
  assert.equal(compareVersions('1.0.0+abc', '1.0.0+xyz'), 0);
  for (const version of ['01.0.0', '1.0', '1.0.0-01', 'garbage']) assert.throws(() => compareVersions(version, '1.0.0'));
});

test('global ownership uses real package and executable paths', t => {
  const dir = mkdtempSync(join(tmpdir(), 'rpd-upgrade-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'node_modules/rex-pierre-diffs'), bin = join(dir, 'bin'), cli = join(root, 'dist-node/cli.js');
  mkdirSync(join(root, 'dist-node'), { recursive: true }); mkdirSync(bin);
  writeFileSync(cli, ''); symlinkSync(cli, join(bin, 'rpd'));
  const paths = [join(bin, 'rpd')];
  const managerRun = (owner: string) => (command: string, args: string[]) => {
    if (command !== owner) throw new Error('missing');
    return args[0] === 'root' ? join(dir, 'node_modules') : args[0] === 'prefix' ? dir : bin;
  };
  for (const manager of ['npm', 'pnpm'] as const) assert.equal(detectInstallation(root, cli, paths, managerRun(manager)), manager);
  assert.throws(() => detectInstallation(root, cli, paths, (_cmd, args) => args[0] === 'root' ? join(dir, 'node_modules') : args[0] === 'prefix' ? dir : bin), /unique/);
  assert.throws(() => detectInstallation(root, cli, paths, () => { throw new Error('missing'); }), /package manager/);
  const other = join(dir, 'other'); writeFileSync(other, '');
  assert.throws(() => detectInstallation(root, cli, [...paths, other], managerRun('npm')), /conflicting/);
  assert.throws(() => detectInstallation(root, other, paths, managerRun('npm')), /Unsupported/);
  unlinkSync(paths[0]);
  writeFileSync(paths[0], '#!/bin/sh\nexec node "$basedir/../node_modules/rex-pierre-diffs/dist-node/cli.js" "$@"\n');
  assert.equal(detectInstallation(root, cli, paths, managerRun('pnpm')), 'pnpm');
  mkdirSync(join(root, '.git'));
  assert.throws(() => detectInstallation(root, cli, paths, managerRun('npm')), /development/);
});

test('registry failures, invalid responses, and stable release', async () => {
  const request = (response: Response) => (async () => response) as typeof fetch;
  assert.equal(await latestVersion(request(Response.json({ name: 'rex-pierre-diffs', version: '1.2.3' }))), '1.2.3');
  for (const response of [new Response('', { status: 503 }), new Response('invalid'), Response.json({ version: '1.2.3' }), Response.json({ name: 'rex-pierre-diffs', version: '1.2.3-beta' })]) await assert.rejects(latestVersion(request(response)), /Cannot check npm/);
  await assert.rejects(latestVersion(async () => { throw new Error('offline'); }), /offline/);
});

test('check, up-to-date, upgrades, failures, and verification never install real packages', async () => {
  const calls: unknown[] = [], logs: string[] = [];
  const deps = {
    current: () => '1.0.0', latest: async () => '2.0.0', detect: () => 'npm' as 'npm' | 'pnpm',
    execute: (cmd: string, args: string[]) => { calls.push([cmd, args]); return ''; },
    verify: () => '2.0.0', log: (message: string) => { logs.push(message); },
  };
  await upgrade(true, { ...deps, detect: () => { throw new Error('must not detect'); }, verify: () => { throw new Error('must not verify'); } });
  assert.equal(calls.length, 0); assert.match(logs.join('\n'), /Update available/);
  await upgrade(false, { ...deps, current: () => '2.0.0' });
  assert.equal(calls.length, 0); assert.match(logs.join('\n'), /already up to date/);
  for (const manager of ['npm', 'pnpm'] as const) {
    await upgrade(false, { ...deps, detect: () => manager });
    assert.deepEqual(calls.at(-1), [manager, [manager === 'npm' ? 'install' : 'add', '-g', 'rex-pierre-diffs@latest']]);
  }
  assert.match(logs.at(-1)!, /Successfully upgraded to v2.0.0/);
  await assert.rejects(upgrade(false, { ...deps, execute: () => { throw new Error('permission denied'); } }), /permission denied/);
  logs.length = 0;
  await assert.rejects(upgrade(false, { ...deps, verify: () => '1.0.0' }), /verification failed.*still v1/);
  assert.ok(!logs.some(log => log.includes('Successfully')));
  await assert.rejects(upgrade(false, { ...deps, verify: () => { throw new Error('PATH conflict'); } }), /verification failed.*PATH conflict/);
  assert.throws(() => run('rpd-nonexistent-test-command', []), /on PATH/);
});

test('production version and upgrade argument routing work outside Git', () => {
  const result = spawnSync(process.execPath, [resolve('dist-node/cli.js'), '--version'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), installedVersion(resolve('.')));
  const invalid = spawnSync(process.execPath, [resolve('dist-node/cli.js'), 'upgrade', '--bad'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Usage: rpd upgrade/);
});
