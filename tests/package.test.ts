import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('publishes the local-diff command', async () => {
  const manifest = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
    bin: Record<string, string>;
    scripts: Record<string, string>;
    files: string[];
  };
  assert.deepEqual(manifest.bin, { 'local-diff': './dist-node/cli.js' });
  assert.equal(manifest.scripts.prepack, 'npm run build');
  assert.equal(manifest.scripts.prepublishOnly, 'npm run check && npm test');
  assert.ok(manifest.files.includes('dist-node'));
  assert.ok(manifest.files.includes('dist'));
  assert.ok(manifest.files.includes('hosts/pixel/dist'));
  assert.ok(manifest.files.includes('local-diff.lua'));
});
