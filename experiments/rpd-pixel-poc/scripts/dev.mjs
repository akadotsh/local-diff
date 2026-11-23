import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runViewer } from './dev-session.mjs';

const run = promisify(execFile);
const checkout = resolve(process.env.RPD_CHECKOUT || '../rex-pierre-code-review');
const repository = resolve(process.argv[2] || checkout);
const { startServer } = await import(pathToFileURL(resolve(checkout, 'dist-node/server.js')).href);
// Own a fresh backend on an available port; leave existing viewers alone.
const server = await startServer(repository, 0);
const url = `http://127.0.0.1:${server.address().port}`;
const pixel = resolve('node_modules/.bin/pixel');
let pane;
try {
  if (process.env.REX_SESSION && process.env.REX_BLOCK) {
    const instrumentation = ['RPD_PIXEL_LOG', 'RPD_PIXEL_PROBE', 'RPD_PIXEL_RUNS']
      .filter(key => process.env[key]).map(key => `${key}=${process.env[key]}`);
    instrumentation.push(`RPD_CHECKOUT_PATH=${checkout}`, `RPD_REPO_PATH=${repository}`);
    const opened = await run('rex', [
      'run', '-s', process.env.REX_SESSION, '-b', process.env.REX_BLOCK,
      '--split=right', '--ratio', '50', '-c', process.cwd(), '--label', 'RPD Pixel POC',
      '--focus=false', '--keep-open', '--json', '--',
      'env', ...instrumentation, pixel, 'dist/main.js', '--', url,
    ]);
    pane = JSON.parse(opened.stdout).block_ids[0];
    console.log(`Opened Pixel beside this terminal. Ctrl+Q in Pixel or Ctrl+C here stops both.`);
    process.exitCode = await runViewer(server, 'rex', ['wait', '-s', process.env.REX_SESSION, pane]);
  } else {
    process.exitCode = await runViewer(server, pixel, ['dist/main.js', '--', url]);
  }
} finally {
  if (pane) await run('rex', ['block', 'close', '-s', process.env.REX_SESSION, pane]).catch(() => {});
  if (server.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
