import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const executable = resolve('dist-standalone/rpd');
let built = true;
try { await access(executable); } catch { built = false; }

test('standalone SEA runs without Node on PATH and serves packaged frontend and Git diffs', { skip: !built, timeout: 20_000 }, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'rpd-standalone-'));
  const pathDir = join(sandbox, 'bin');
  const root = join(sandbox, 'repo');
  await mkdir(pathDir);
  await mkdir(root);
  const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  assert.ok(gitPath, 'Git is available for the standalone server');
  await symlink(gitPath, join(pathDir, 'git'));
  const env = { ...process.env, PATH: pathDir, REX_SESSION: '', REX_BLOCK: '' };
  let child: ReturnType<typeof spawn> | undefined;
  let serverOutput = '';
  let infoPath = '';
  try {
    const help = spawnSync(executable, ['--help'], { encoding: 'utf8', env });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: rex-pierre-diffs/);
    const alias = spawnSync(resolve('dist-standalone/rex-pierre-diffs'), ['--help'], { encoding: 'utf8', env });
    assert.equal(alias.status, 0, alias.stderr);
    assert.match(alias.stdout, /Usage: rex-pierre-diffs/);
    assert.equal((spawnSync('node', ['--version'], { env }).error as NodeJS.ErrnoException | undefined)?.code, 'ENOENT');
    const invalid = spawnSync(executable, ['--split', 'diagonal'], { cwd: root, encoding: 'utf8', env });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /must be right, left, above, or below/);
    const outsideGit = spawnSync(executable, ['--internal-server'], { cwd: sandbox, encoding: 'utf8', env: { ...env, PORT: '0' } });
    assert.equal(outsideGit.status, 1);
    assert.match(outsideGit.stderr, /Not inside a Git repository/);

    const git = (...args: string[]) => {
      const result = spawnSync(gitPath, args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    git('init', '-q');
    await writeFile(join(root, 'tracked.txt'), 'base\n');
    git('add', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('commit', '-qm', 'base');
    await writeFile(join(root, 'tracked.txt'), 'changed\n');
    await writeFile(join(root, 'untracked.txt'), 'new file\n');

    const port = 30000 + Math.floor(Math.random() * 30000);
    child = spawn(executable, ['--internal-server'], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', chunk => { serverOutput += String(chunk); });
    child.stderr?.on('data', chunk => { serverOutput += String(chunk); });
    infoPath = join(tmpdir(), `rex-pierre-diffs-${child.pid}.json`);
    let info: { port: number } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { info = JSON.parse(await readFile(infoPath, 'utf8')) as { port: number }; break; }
      catch { if (child.exitCode !== null) break; await delay(50); }
    }
    assert.ok(info, `standalone server wrote its readiness file${serverOutput ? `: ${serverOutput}` : ''}`);
    const base = `http://127.0.0.1:${info.port}`;
    const html = await (await fetch(base, { signal: AbortSignal.timeout(5000) }).catch(error => { throw new Error(`frontend HTML request failed: ${error}`); })).text();
    assert.match(html, /review-token/);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]!);
    assert.ok(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')), 'HTML references JavaScript and CSS');
    for (const path of assets) {
      const assetResponse = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5000) }).catch(error => { throw new Error(`frontend asset request failed: ${error}`); });
      assert.equal(assetResponse.status, 200, path);
      assert.ok((await assetResponse.text()).length > 100, path);
    }
    const diff = await (await fetch(`${base}/api/diff`, { signal: AbortSignal.timeout(5000) }).catch(error => { throw new Error(`Git diff request failed: ${error}`); })).json() as { patch: string };
    assert.match(diff.patch, /changed/);
    assert.match(diff.patch, /untracked\.txt/);

    const events = await fetch(`${base}/events`, { signal: AbortSignal.timeout(5000) }).catch(error => { throw new Error(`watch event request failed: ${error}`); });
    const reader = events.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /: connected/);
    await delay(500);
    await writeFile(join(root, 'watched.txt'), 'refresh\n');
    const update = await Promise.race([reader.read(), delay(3000).then(() => { throw new Error('watch refresh timed out'); })]);
    assert.match(new TextDecoder().decode(update.value), /data: update/);
    await reader.cancel();
  } finally {
    if (child) {
      const exited = new Promise<void>(resolveExit => child!.once('exit', () => resolveExit()));
      child.kill('SIGTERM');
      await Promise.race([exited, delay(3000)]);
    }
    if (infoPath) await rm(infoPath, { force: true });
    await rm(sandbox, { recursive: true, force: true });
  }
});
