// Import the existing built RPD server, without copying or rebuilding its source.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [checkout, fixture] = process.argv.slice(2);
if (!checkout || !fixture) throw Error('Usage: node scripts/serve.mjs RPD_CHECKOUT FIXTURE');
const { startServer } = await import(pathToFileURL(resolve(checkout,'dist-node/server.js')).href);
await startServer(resolve(fixture), Number(process.env.PORT || 4189));
