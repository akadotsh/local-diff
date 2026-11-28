import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findRepository, startServer } from '../dist-node/server.js';
import { pixelCommand } from '../dist-node/pixel.js';
import { runViewer } from '../hosts/pixel/scripts/dev-session.mjs';

const run = promisify(execFile);
let server;
let pane;
let vite;
const dev = process.argv.includes('--dev');
try {
  const session = process.env.REX_SESSION || process.env.REX_BLOCK;
  if (session) process.env.REX_SESSION = session;
  let block = process.env.REX_BLOCK;
  if (block) {
    const args = ['block', 'ls', '--json'];
    if (session) args.push('-s', session);
    const listed = JSON.parse((await run('rex', args)).stdout);
    if (!listed.blocks.some(item => item.block_id === block)) block = undefined;
  }
  // A fresh port always serves this checkout, never an older installed local-diff server.
  const token = randomUUID();
  server = await startServer(findRepository(), 0, token);
  let url = `http://127.0.0.1:${server.address().port}`;
  if (dev) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': url, '/events': url } },
      plugins: [{
        name: 'local-review-token',
        transformIndexHtml: html => html.replace('</head>', `<meta name="review-token" content="${token}"></head>`),
      }],
    });
    await vite.listen();
    url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  }
  const [command, ...viewerArgs] = pixelCommand(url);
  console.log(`\nLocal checkout in Pixel: ${url}${dev ? " (frontend hot reload enabled)" : ""}\nCtrl+Q in Pixel or Ctrl+C here stops the preview.`);
  if (block) {
    const args = ['run', '-b', block, '--split=right', '--ratio', '50', '--focus=false', '--label', 'Local Diff', '--json', '-c', process.cwd()];
    if (session) args.push('-s', session);
    const opened = JSON.parse((await run('rex', [...args, '--', command, ...viewerArgs])).stdout);
    pane = opened.block_ids[0];
    const wait = ['wait', pane];
    if (session) wait.push('-s', session);
    process.exitCode = await runViewer(server, 'rex', wait);
  } else {
    process.exitCode = await runViewer(server, command, viewerArgs);
  }
} catch (error) {
  console.error(`Could not launch local preview: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (pane) await run('rex', ['block', 'close', pane]).catch(() => {});
  if (vite) await vite.close();
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
