import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('publishes both CLI command names', async () => {
  const manifest = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.deepEqual(manifest.bin, { 'rex-pierre-diffs': './dist-node/cli.js', rpd: './dist-node/cli.js' });
});
