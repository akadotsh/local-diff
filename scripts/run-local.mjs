import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findRepository, startServer } from '../dist-node/server.js';

const run = promisify(execFile);
let server;
let pane;
let vite;
const dev = process.argv.includes('--dev');
try {
  const location = JSON.parse((await run('rex', ['whoami', '--json'])).stdout);
  const session = location.session_id || process.env.REX_SESSION;
  let block = location.block_id || process.env.REX_BLOCK;
  if (block) {
    const args = ['block', 'ls', '--json'];
    if (session) args.push('-s', session);
    const listed = JSON.parse((await run('rex', args)).stdout);
    if (!listed.blocks.some(item => item.block_id === block)) block = undefined;
  }
  if (session) process.env.REX_SESSION = session;
  // A fresh port always serves this checkout, never an older installed local-diff server.
  const token = randomUUID();
  server = await startServer(findRepository(), 0, token);
  server.once('close', () => {
    if (vite) void vite.close();
    if (pane) void run('rexweb', ['close', '-b', pane]).catch(() => {});
  });
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
  const args = ['open', url, '--focus=false', '--json'];
  if (session) args.push('-s', session);
  if (block) args.push('-b', block);
  const env = { ...process.env };
  if (!block) delete env.REX_BLOCK;
  const result = await run('rexweb', args, { env });
  const opened = JSON.parse(result.stdout);
  pane = opened.id;
  if (opened.error) throw new Error(opened.error);
  console.log(`\nLocal checkout opened in RexWeb: ${url}${dev ? " (frontend hot reload enabled)" : ""}\nTry Changes → Explorer → select a file → Changes.\nPress Ctrl+C to stop the server and close this preview.\nAutomated checks: npm run test:local`);
} catch (error) {
  if (server) { server.close(); server.closeAllConnections(); }
  console.error(`Could not launch local preview: ${error.message}\nCheck that Rex is running and rexweb doctor passes.`);
  process.exitCode = 1;
}
