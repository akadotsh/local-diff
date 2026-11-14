import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, findRepository, getSnapshot, startServer } from '../src/server.js';

let root: string;
function runGit(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'git failed');
  return result.stdout;
}
const git = (...args: string[]) => runGit(root, ...args);

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'rex-pierre-diffs-')));
  runGit(root, 'init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  await writeFile(join(root, 'mod.txt'), 'before\n');
  await writeFile(join(root, 'del.txt'), 'delete me\n');
  await writeFile(join(root, 'removed.txt'), 'remove me\n');
  git('add', '.');
  git('commit', '-qm', 'base');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('Git integration', () => {
  test('detects repository root and rejects directories outside Git', async () => {
    assert.equal(findRepository(root), await realpath(root));
    const outside = await mkdtemp(join(tmpdir(), 'not-git-'));
    try { assert.throws(() => findRepository(outside), /Not inside a Git repository/); }
    finally { await rm(outside, { recursive: true, force: true }); }
  });
  test('returns an empty patch for a clean repository', async () => { assert.equal((await getSnapshot(root)).patch, ''); });
  test('returns valid patches for staged/unstaged and all change kinds', async () => {
    await writeFile(join(root, 'mod.txt'), 'after\n');
    await writeFile(join(root, 'add.txt'), 'new\n');
    await rename(join(root, 'del.txt'), join(root, 'renamed.txt'));
    await rm(join(root, 'removed.txt'));
    git('add', 'mod.txt', 'del.txt', 'renamed.txt', 'removed.txt');
    await writeFile(join(root, 'renamed.txt'), 'delete me\n');
    git('add', '-A');
    await writeFile(join(root, 'mod.txt'), 'after unstaged\n');
    const all = await getSnapshot(root);
    const staged = await getSnapshot(root, 'staged');
    const working = await getSnapshot(root, 'working');
    assert.match(all.patch, /diff --git/);
    assert.match(all.patch, /\+\+\+ b\/add\.txt/);
    assert.match(all.patch, /deleted file mode/);
    assert.match(all.patch, /rename from del\.txt/);
    assert.equal(all.patch.split('diff --git a/mod.txt').length - 1, 1);
    assert.match(staged.patch, /after/);
    assert.match(working.patch, /after unstaged/);
    const pierre = await import('@pierre/diffs');
    const parsed = pierre.parsePatchFiles(all.patch);
    assert.ok(parsed[0]?.files.length >= 4);
    assert.ok(parsed[0]?.files.some(file => file.name === 'add.txt'));
  });
  test('validates diff mode and surfaces Git errors', async () => {
    await assert.rejects(getSnapshot(root, 'invalid'), /Unknown diff mode/);
    assert.throws(() => findRepository('/'), /Not inside a Git repository/);
  });
  test('handles an empty repository without commits and empty untracked files', async () => {
    const empty = await realpath(await mkdtemp(join(tmpdir(), 'rex-pierre-empty-')));
    try {
      runGit(empty, 'init', '-q');
      assert.equal((await getSnapshot(empty)).patch, '');
      await writeFile(join(empty, 'empty.ts'), '');
      const patch = (await getSnapshot(empty)).patch;
      assert.match(patch, /new file mode 100644/);
      assert.doesNotMatch(patch, /@@ -0,0 \+1/);
      await writeFile(join(empty, 'staged.ts'), 'index version\n');
      runGit(empty, 'add', 'staged.ts');
      await writeFile(join(empty, 'staged.ts'), 'working version\n');
      const combined = (await getSnapshot(empty)).patch;
      assert.match(combined, /working version/);
      assert.equal(combined.split('diff --git a/staged.ts').length - 1, 1);
    } finally { await rm(empty, { recursive: true, force: true }); }
  });
  test('does not read an untracked symlink that escapes the repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'rex-pierre-outside-'));
    try {
      await writeFile(join(outside, 'secret.ts'), 'local secret\n');
      await symlink(join(outside, 'secret.ts'), join(root, 'escape.ts'));
      assert.doesNotMatch((await getSnapshot(root)).patch, /local secret/);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  test('keeps a large text diff bounded and complete', async () => {
    const content = Array.from({ length: 5000 }, (_, i) => `export const line${i} = ${i};`).join('\n') + '\n';
    await writeFile(join(root, 'large.ts'), content);
    const patch = (await getSnapshot(root)).patch;
    assert.match(patch, /large\.ts/);
    assert.match(patch, /export const line4999 = 4999;/);
  });
});

describe('HTTP API', () => {
  test('reports the Rex session associated with a viewer server', async () => {
    const previous = process.env.REX_SESSION;
    process.env.REX_SESSION = 'session:viewer';
    try {
      const response = await createApp(root, 'test-token')(new Request('http://localhost/api/diff'));
      assert.equal((await response.json() as { session: string }).session, 'session:viewer');
    } finally {
      if (previous === undefined) delete process.env.REX_SESSION;
      else process.env.REX_SESSION = previous;
    }
  });

  test('serves diffs, validates review writes, persists reviews, and handles errors', async () => {
    const app = createApp(root, 'test-token', join(root, 'reviews.json'));
    const get = await app(new Request('http://localhost/api/diff'));
    assert.equal(get.status, 200);
    assert.equal((await get.json() as { root: string }).root, root);
    assert.equal((await app(new Request('http://localhost/api/diff?mode=nope'))).status, 400);
    assert.equal((await app(new Request('http://localhost/api/reviews', { method: 'POST', body: '[]' }))).status, 403);
    assert.equal((await app(new Request('http://localhost/api/reviews', { method: 'POST', headers: { 'x-review-token': 'test-token' }, body: '{}' }))).status, 400);
    const saved = await app(new Request('http://localhost/api/reviews', { method: 'POST', headers: { 'x-review-token': 'test-token' }, body: '[{"body":"note"}]' }));
    assert.equal(saved.status, 200);
    assert.deepEqual(await (await app(new Request('http://localhost/api/reviews'))).json(), [{ body: 'note' }]);
    assert.equal((await app(new Request('http://localhost/missing'))).status, 404);
  });
  test('lists active Rex panes and sends only to a verified pane as one text argument', async () => {
    const previous = process.env.REX_SESSION;
    process.env.REX_SESSION = 'session:test';
    const calls: string[][] = [];
    const fake = (args: string[]) => { calls.push(args); return { status: 0, stdout: args[0] === 'send' ? '' : JSON.stringify([{ block_id: 'block:agent', label: 'Codex' }]), stderr: '' }; };
    try {
      const app = createApp(root, 'test-token', join(root, 'review.json'), new Set(), fake);
      const targets = await app(new Request('http://localhost/api/targets'));
      assert.deepEqual(await targets.json(), { blocks: [{ id: 'block:agent', label: 'Codex' }] });
      const message = 'Review this line\nDo not submit it';
      const sent = await app(new Request('http://localhost/api/send', { method: 'POST', headers: { 'x-review-token': 'test-token', 'content-type': 'application/json' }, body: JSON.stringify({ blockId: 'block:agent', message }) }));
      assert.equal(sent.status, 200);
      assert.deepEqual(calls.at(-1), ['send', '-s', 'session:test', '-b', 'block:agent', message]);
      const rejected = await app(new Request('http://localhost/api/send', { method: 'POST', headers: { 'x-review-token': 'test-token', 'content-type': 'application/json' }, body: JSON.stringify({ blockId: 'block:other', message }) }));
      assert.equal(rejected.status, 403);
    } finally { if (previous === undefined) delete process.env.REX_SESSION; else process.env.REX_SESSION = previous; }
  });
  test('returns a helpful response when the frontend has not been built', async () => {
    const app = createApp(root, 'test-token');
    const response = await app(new Request('http://localhost/'));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Build the frontend first/);
  });
  test('starts a local HTTP server and stops cleanly', async t => {
    let server: Awaited<ReturnType<typeof startServer>>;
    try { server = await startServer(root, 0); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '')) {
        t.skip('loopback binding is restricted in this environment');
        return;
      }
      throw error;
    }
    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/diff`);
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { root: string }).root, root);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
