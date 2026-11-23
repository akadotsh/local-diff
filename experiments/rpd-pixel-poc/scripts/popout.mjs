import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runViewer } from './dev-session.mjs';

const [checkoutArg, repositoryArg] = process.argv.slice(2);
if (!checkoutArg || !repositoryArg) throw new Error('Usage: node scripts/popout.mjs CHECKOUT REPOSITORY');
const checkout = resolve(checkoutArg);
const repository = resolve(repositoryArg);
const { startServer } = await import(pathToFileURL(resolve(checkout, 'dist-node/server.js')).href);
const server = await startServer(repository, 0);
const url = `http://127.0.0.1:${server.address().port}`;
try {
  process.exitCode = await runViewer(server, resolve('node_modules/.bin/pixel'), ['dist/main.js', '--', url]);
} finally {
  if (server.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
