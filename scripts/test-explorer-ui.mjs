// Native WebKit integration check; run after npm run build, inside Rex.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../dist-node/server.js';

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'rpd-explorer-ui-'));
let pane;
let server;
const evaluate = async code => JSON.parse((await run('rexweb', ['eval', '-b', pane, code])).stdout);
const wait = async expression => {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Timed out: ' + expression);
};
const tree = 'document.querySelector(".repository-tree").shadowRoot';
const row = path => `${tree}.querySelector('[data-item-path=${JSON.stringify(path)}]')`;
const switchTo = mode => evaluate(`document.querySelector('button[aria-label="${mode}"]').click(); return true`);
const showFiles = () => evaluate('document.querySelectorAll(".mobile-tabs button")[1].click(); return true');
try {
  await mkdir(join(root, 'src/components'), { recursive: true });
  await mkdir(join(root, 'bulk'));
  await writeFile(join(root, 'src/components/Button.tsx'), 'export const Button = () => <button>Source preview</button>;\n');
  await writeFile(join(root, 'review.ts'), 'export const value = 1;\n');
  await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1]));
  await writeFile(join(root, 'empty.ts'), '');
  await Promise.all(Array.from({ length: 3000 }, (_, i) => writeFile(join(root, 'bulk', `file-${i}.ts`), '')));
  await run('git', ['init', '-q'], { cwd: root });
  await run('git', ['add', '.'], { cwd: root });
  await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base'], { cwd: root });
  await writeFile(join(root, 'review.ts'), 'export const value = 2;\n');
  server = await startServer(root, 0);
  const url = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env };
  delete env.REX_BLOCK;
  const opened = await run('rexweb', ['open', url, '--tab', '--focus=false', '--json'], { env });
  pane = JSON.parse(opened.stdout).id;
  await wait('document.querySelector("article diffs-container")?.shadowRoot?.querySelector("[data-line]") != null');
  await evaluate('window.originalDiff = document.querySelector("article diffs-container"); window.originalPage = performance.timeOrigin; document.querySelector(".diff-content").scrollTop = 10; return true');
  await evaluate('const el = document.querySelector("article diffs-container").shadowRoot.querySelector("[data-gutter] [data-line-type=change-addition]"); el.dispatchEvent(new PointerEvent("pointerdown", {bubbles:true,composed:true,pointerType:"mouse",pointerId:1,button:0})); document.dispatchEvent(new PointerEvent("pointerup", {bubbles:true,composed:true,pointerType:"mouse",pointerId:1,button:0})); return true');
  await wait('document.querySelector(".inline-composer") != null');
  await evaluate('const input = document.querySelector(".inline-composer textarea"); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; setter.call(input, "Review question"); input.dispatchEvent(new Event("input", {bubbles:true})); return true');
  await switchTo('Explorer');
  await showFiles();
  await wait(`${row('src/components/')} != null`);
  await evaluate(`${row('src/components/')}.click(); return true`);
  await wait(`${row('src/components/Button.tsx')} != null`);
  await evaluate(`${row('src/components/Button.tsx')}.click(); return true`);
  await wait('document.querySelector(".source-content diffs-container")?.shadowRoot?.textContent.includes("Source preview") === true');
  assert.equal(await evaluate('document.querySelector(".source-content").hidden'), false);
  await switchTo('Changes');
  assert.equal(await evaluate('document.querySelector(".diff-content").hidden'), false);
  assert.equal(await evaluate('document.querySelector(".inline-composer textarea").value'), 'Review question');
  assert.equal(await evaluate('window.originalDiff === document.querySelector("article diffs-container") && performance.timeOrigin === window.originalPage'), true);
  await switchTo('Explorer');
  await showFiles();
  await wait(`${row('src/components/Button.tsx')}?.getAttribute('aria-selected') === 'true'`);
  // A keyboard action must work through the library's own event handling.
  await evaluate(`${row('src/components/Button.tsx')}.focus(); ${row('src/components/Button.tsx')}.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true,composed:true})); return true`);
  assert.equal(await evaluate(`${row('binary.bin')}?.getAttribute('tabindex') === '0'`), true);
  await evaluate(`${row('binary.bin')}.click(); return true`);
  await wait('document.querySelector(".source-content [role=alert]")?.textContent.includes("Binary") === true');
  await showFiles();
  await evaluate(`${row('empty.ts')}.click(); return true`);
  await wait('document.querySelector(".source-empty")?.textContent.includes("empty") === true');
  await showFiles();
  await evaluate(`${row('bulk/')}.click(); return true`);
  await wait(`${row('bulk/file-0.ts')} != null`);
  assert.ok(await evaluate(`${tree}.querySelectorAll('[role=treeitem]').length < 100`), 'large tree must be virtualized');
  await writeFile(join(root, 'new.ts'), 'export {};\n');
  await wait(`await fetch('/api/files',{headers:{'x-review-token':document.querySelector('meta[name=review-token]').content}}).then(r=>r.json()).then(d=>d.statuses['new.ts'] === '??')`);
  await run('git', ['add', 'new.ts'], { cwd: root });
  await wait(`await fetch('/api/files',{headers:{'x-review-token':document.querySelector('meta[name=review-token]').content}}).then(r=>r.json()).then(d=>d.statuses['new.ts'] === 'A ')`);
  await switchTo('Changes');
  await wait('document.querySelectorAll("article").length === 2');
  assert.equal(await evaluate('document.querySelector(".app-error") == null'), true);
  console.log('PASS: RexWeb switching, source preview, selection/expansion preservation, preview errors, empty files, 3,000-file virtualization, and live Git updates.');
} finally {
  if (pane) await run('rexweb', ['close', '-b', pane]);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(root, { recursive: true, force: true });
}
