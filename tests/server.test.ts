import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile, rename, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, findRepository, getSnapshot, startServer } from '../src/server';

let root: string;
const git = (...args: string[]) => { const p = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' }); if (p.exitCode) throw new Error(p.stderr.toString()); return p.stdout.toString(); };
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'rex-pierre-diffs-'))); git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test'); await writeFile(join(root, 'mod.txt'), 'before\n'); await writeFile(join(root, 'del.txt'), 'delete me\n'); await writeFile(join(root, 'removed.txt'), 'remove me\n'); git('add', '.'); git('commit', '-qm', 'base'); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('Git integration', () => {
  test('detects repository root and rejects directories outside Git', async () => { expect(findRepository(root)).toBe(await realpath(root)); const outside = await mkdtemp(join(tmpdir(), 'not-git-')); try { expect(() => findRepository(outside)).toThrow('Not inside a Git repository'); } finally { await rm(outside, { recursive: true, force: true }); } });
  test('returns an empty patch for a clean repository', async () => { expect((await getSnapshot(root)).patch).toBe(''); });
  test('returns valid patches for staged/unstaged and all change kinds', async () => {
    await writeFile(join(root, 'mod.txt'), 'after\n'); await writeFile(join(root, 'add.txt'), 'new\n'); await rename(join(root, 'del.txt'), join(root, 'renamed.txt')); await rm(join(root, 'removed.txt')); git('add', 'mod.txt', 'del.txt', 'renamed.txt', 'removed.txt');
    // Stage the rename with Git's similarity detection and delete the former path.
    await Bun.write(join(root, 'renamed.txt'), 'delete me\n'); git('add', '-A');
    await writeFile(join(root, 'mod.txt'), 'after unstaged\n');
    const all = await getSnapshot(root); const staged = await getSnapshot(root, 'staged'); const working = await getSnapshot(root, 'working');
    expect(all.patch).toContain('diff --git'); expect(all.patch).toContain('+++ b/add.txt'); expect(all.patch).toContain('deleted file mode'); expect(all.patch).toContain('rename from del.txt');
    expect(all.patch.split('diff --git a/mod.txt').length - 1).toBe(1);
    expect(staged.patch).toContain('after'); expect(working.patch).toContain('after unstaged');
    const pierre = await import('@pierre/diffs'); const parsed = pierre.parsePatchFiles(all.patch); expect(parsed[0]?.files.length).toBeGreaterThanOrEqual(4); expect(parsed[0]?.files.some(file => file.name === 'add.txt')).toBe(true);
  });
  test('validates diff mode and surfaces Git errors', async () => { await expect(getSnapshot(root, 'invalid')).rejects.toThrow('Unknown diff mode'); expect(() => findRepository('/')).toThrow(); });
  test('handles an empty repository without commits and empty untracked files', async () => {
    const empty=await realpath(await mkdtemp(join(tmpdir(),'rex-pierre-empty-')));
    try { Bun.spawnSync(['git','init','-q'],{cwd:empty}); expect((await getSnapshot(empty)).patch).toBe(''); await writeFile(join(empty,'empty.ts'),''); const patch=(await getSnapshot(empty)).patch; expect(patch).toContain('new file mode 100644'); expect(patch).not.toContain('@@ -0,0 +1'); await writeFile(join(empty,'staged.ts'),'index version\n'); Bun.spawnSync(['git','add','staged.ts'],{cwd:empty}); await writeFile(join(empty,'staged.ts'),'working version\n'); const combined=(await getSnapshot(empty)).patch; expect(combined).toContain('working version'); expect(combined.split('diff --git a/staged.ts').length-1).toBe(1); }
    finally { await rm(empty,{recursive:true,force:true}); }
  });
  test('does not read an untracked symlink that escapes the repository', async () => { const outside=await mkdtemp(join(tmpdir(),'rex-pierre-outside-')); try { await writeFile(join(outside,'secret.ts'),'local secret\n'); await symlink(join(outside,'secret.ts'),join(root,'escape.ts')); expect((await getSnapshot(root)).patch).not.toContain('local secret'); } finally { await rm(outside,{recursive:true,force:true}); } });
  test('keeps a large text diff bounded and complete', async () => {
    const content=Array.from({length:5000},(_,i)=>`export const line${i} = ${i};`).join('\n')+'\n';
    await writeFile(join(root,'large.ts'),content); const patch=(await getSnapshot(root)).patch; expect(patch).toContain('large.ts'); expect(patch).toContain('export const line4999 = 4999;');
  });
});

describe('HTTP API and server', () => {
  test('serves diff, validates review writes, persists reviews and returns errors', async () => {
    const app = createApp(root, 'test-token', join(root, 'reviews.json'));
    const get = await app(new Request('http://localhost/api/diff')); expect(get.status).toBe(200); expect((await get.json() as any).root).toBe(root);
    expect((await app(new Request('http://localhost/api/diff?mode=nope'))).status).toBe(400);
    expect((await app(new Request('http://localhost/api/reviews', { method: 'POST', body: '[]' }))).status).toBe(403);
    expect((await app(new Request('http://localhost/api/reviews', { method: 'POST', headers: { 'x-review-token': 'test-token' }, body: '{}' }))).status).toBe(400);
    const saved = await app(new Request('http://localhost/api/reviews', { method: 'POST', headers: { 'x-review-token': 'test-token' }, body: '[{"body":"note"}]' })); expect(saved.status).toBe(200);
    expect(await (await app(new Request('http://localhost/api/reviews'))).json()).toEqual([{ body: 'note' }]);
    expect((await app(new Request('http://localhost/missing'))).status).toBe(404);
  });
  test('serves the built application and its JavaScript bundle', async () => {
    const app = createApp(root, 'test-token');
    const html = await app(new Request('http://localhost/')); expect(html.status).toBe(200);
    const markup = await html.text(); expect(markup).toContain('/assets/');
    const bundle = markup.match(/src="([^"]+\.js)"/)?.[1]; expect(bundle).toBeTruthy();
    const js = await app(new Request(`http://localhost${bundle}`)); expect(js.status).toBe(200); expect(js.headers.get('content-type')).toContain('javascript');
  });
  test('lists active Rex panes and sends only to a verified pane with one argv text value', async () => {
    const previous=process.env.REX_SESSION;process.env.REX_SESSION='session:test';const calls:string[][]=[];
    const fake=(args:string[])=>{calls.push(args);const out=args[0]==='send'?'':JSON.stringify([{block_id:'block:agent',label:'Codex'}]);return{exitCode:0,stdout:Buffer.from(out),stderr:Buffer.from('')}};
    try {
      const app=createApp(root,'test-token',join(root,'review.json'),new Set(),fake);
      const targets=await app(new Request('http://localhost/api/targets'));expect(await targets.json()).toEqual({blocks:[{id:'block:agent',label:'Codex'}]});
      const message='Review this line\\nDo not submit it';
      const sent=await app(new Request('http://localhost/api/send',{method:'POST',headers:{'x-review-token':'test-token','content-type':'application/json'},body:JSON.stringify({blockId:'block:agent',message})}));expect(sent.status).toBe(200);expect(calls.at(-1)).toEqual(['send','-s','session:test','-b','block:agent',message]);
      const rejected=await app(new Request('http://localhost/api/send',{method:'POST',headers:{'x-review-token':'test-token','content-type':'application/json'},body:JSON.stringify({blockId:'block:other',message})}));expect(rejected.status).toBe(403);
    } finally { if(previous===undefined)delete process.env.REX_SESSION;else process.env.REX_SESSION=previous; }
  });
  test('binds loopback and accepts HTTP requests, then stops cleanly', async () => {
    const server = startServer(root, 0); try { const response = await fetch(`http://127.0.0.1:${server.port}/api/diff`); expect(response.status).toBe(200); expect((await response.json() as any).root).toBe(root); } finally { server.stop(true); }
  });
});
