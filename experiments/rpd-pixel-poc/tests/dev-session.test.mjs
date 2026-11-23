import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runViewer } from '../scripts/dev-session.mjs';

async function backend() {
  const server = createServer((req, res) => res.end('ready'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('viewer exit propagates status and closes its backend', async () => {
  const server = await backend();
  assert.equal(await runViewer(server, process.execPath, ['-e', 'process.exit(7)']), 7);
  assert.equal(server.listening, false);
});

test('failed viewer launch still closes its backend and removes signal handlers', async () => {
  const server = await backend();
  const before = process.listenerCount('SIGTERM');
  await assert.rejects(runViewer(server, '/nonexistent/rpd-pixel-viewer', []), { code: 'ENOENT' });
  assert.equal(server.listening, false);
  assert.equal(process.listenerCount('SIGTERM'), before);
});

test('interrupting the launcher stops its child and backend', async () => {
  const server = await backend();
  const before = process.listenerCount('SIGTERM');
  const finished = runViewer(server, process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  process.emit('SIGTERM');
  assert.equal(await finished, 1);
  assert.equal(server.listening, false);
  assert.equal(process.listenerCount('SIGTERM'), before);
});
