import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('curl installer installs, upgrades, verifies checksums and preserves installations on failure', t => {
  const dir = mkdtempSync(join(tmpdir(), 'local-diff-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'tools'), home = join(dir, 'home with spaces'), release = join(dir, 'release');
  for (const path of [bin, home, release, join(release, 'dist'), join(release, 'THIRD_PARTY_NOTICES')]) mkdirSync(path, { recursive: true });
  const script = (name: string, body: string) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 }); };
  // Exercise the same POSIX script on CI without needing a real GitHub release.
  script('uname', 'case "$1" in -s) echo "${TEST_OS:-Darwin}";; -m) echo "${TEST_ARCH:-arm64}";; esac');
  script('sw_vers', 'echo "${TEST_MACOS:-14.0}"');
  script('curl', 'while [ "$#" -gt 0 ]; do case "$1" in https://*) url=$1;; -o) shift; output=$1;; esac; shift; done\n[ "${TEST_DOWNLOAD_FAIL:-}" != yes ] || exit 22\ncase "$url" in https://github.com/akadotsh/local-diff/releases/latest/download/*) cp "$TEST_RELEASE/${url##*/}" "$output";; *) exit 1;; esac');
  for (const tool of ['cp', 'cut', 'tar', 'shasum', 'mkdir', 'mktemp', 'rm', 'mv', 'ln', 'chmod']) {
    const found = spawnSync('which', [tool], { encoding: 'utf8' }).stdout.trim();
    assert.ok(found, tool); symlinkSync(found, join(bin, tool));
  }
  const realBinary = resolve('dist-standalone/local-diff');
  if (existsSync(realBinary)) cpSync(realBinary, join(release, 'local-diff'));
  else writeFileSync(join(release, 'local-diff'), '#!/bin/sh\necho fixture-v1\n', { mode: 0o755 });
  chmodSync(join(release, 'local-diff'), 0o755);
  writeFileSync(join(release, 'dist/index.html'), '<html>fixture</html>');
  writeFileSync(join(release, 'local-diff.lua'), '-- fixture');
  writeFileSync(join(release, 'LICENSE'), 'fixture');
  const asset = 'local-diff-darwin-arm64.tar.gz', archive = join(dir, asset);
  const pack = () => {
    const result = spawnSync('tar', ['-czf', archive, '-C', release, 'local-diff', 'dist', 'local-diff.lua', 'LICENSE', 'THIRD_PARTY_NOTICES']);
    assert.equal(result.status, 0);
    writeFileSync(`${archive}.sha256`, `${createHash('sha256').update(readFileSync(archive)).digest('hex')}  ${asset}\n`);
  };
  pack();
  const env = { ...process.env, HOME: home, PATH: bin, TEST_RELEASE: dir };
  const install = (extra = {}) => spawnSync('/bin/sh', [], { input: readFileSync(resolve('install.sh')), env: { ...env, ...extra }, encoding: 'utf8' });
  const executable = join(home, '.local/bin/local-diff');
  const first = install();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /export PATH=/);
  assert.ok(existsSync(join(readlinkSync(executable), '../dist/index.html')));
  assert.equal(spawnSync(executable, ['--version'], { env }).status, 0);
  assert.equal((spawnSync('node', ['--version'], { env }).error as NodeJS.ErrnoException)?.code, 'ENOENT', 'Node is absent');
  const old = readlinkSync(executable);
  writeFileSync(join(release, 'local-diff'), '#!/bin/sh\necho fixture-v2\n', { mode: 0o755 }); pack();
  const second = install({ PATH: `${home}/.local/bin:${bin}` });
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stdout, /export PATH=/);
  assert.notEqual(readlinkSync(executable), old);
  assert.equal(spawnSync(executable, [], { env, encoding: 'utf8' }).stdout.trim(), 'fixture-v2');
  const current = readlinkSync(executable);
  for (const extra of [{ TEST_OS: 'Linux' }, { TEST_ARCH: 'x86_64' }, { TEST_MACOS: '13.0' }, { TEST_DOWNLOAD_FAIL: 'yes' }]) {
    assert.notEqual(install(extra).status, 0);
    assert.equal(readlinkSync(executable), current);
  }
  writeFileSync(archive, 'tampered');
  assert.match(install().stderr, /SHA-256 verification failed/);
  assert.equal(readlinkSync(executable), current);
  writeFileSync(`${archive}.sha256`, `${createHash('sha256').update('tampered').digest('hex')}  ${asset}\n`);
  assert.match(install().stderr, /Invalid release archive/);
  assert.equal(readlinkSync(executable), current);
});
