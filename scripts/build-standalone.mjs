import { build } from 'esbuild';
import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist-standalone');
const temp = resolve(root, '.tmp/standalone');

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The standalone build currently targets macOS ARM64.');
}
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) {
  throw new Error('Building a SEA requires Node.js 25.5 or newer (26 LTS recommended).');
}

await rm(output, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'dist'), resolve(output, 'dist'), { recursive: true });
const main = resolve(temp, 'main.mjs');
await build({ entryPoints: [resolve(root, 'src/cli.ts')], bundle: true, platform: 'node', target: 'node26', format: 'esm', outfile: main });

const config = resolve(temp, 'sea-config.json');
await writeFile(config, JSON.stringify({
  main,
  mainFormat: 'module',
  executable: process.execPath,
  output: resolve(output, 'local-diff'),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}, null, 2));
const result = spawnSync(process.execPath, ['--build-sea', config], { cwd: root, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) {
  if (result.stderr?.includes('Single executable application is disabled')) throw new Error('This Node.js build disables SEA (Homebrew disables it for shared libnode builds); use the official Node.js macOS binary.');
  throw new Error(`Node SEA build failed with exit ${result.status}`);
}

const signature = spawnSync('codesign', ['--sign', '-', resolve(output, 'local-diff')], { stdio: 'inherit' });
if (signature.error) throw signature.error;
if (signature.status !== 0) throw new Error(`Ad-hoc signing failed with exit ${signature.status}`);
await chmod(resolve(output, 'local-diff'), 0o755);
console.log(`Standalone distribution created at ${output}`);
