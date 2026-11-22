import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'rex-pierre-diffs';
const manual = 'Upgrade manually with npm install -g rex-pierre-diffs@latest or pnpm add -g rex-pierre-diffs@latest, using the manager that installed RPD.';
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function installedVersion(root = packageRoot): string {
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (metadata.name !== name || typeof metadata.version !== 'string') throw new Error('Cannot read RPD package metadata. Standalone upgrades are unsupported.');
  compareVersions(metadata.version, metadata.version);
  return metadata.version;
}

function parseVersion(value: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value);
  if (!match || match[4]?.split('.').some(id => /^\d+$/.test(id) && id.length > 1 && id[0] === '0')) throw new Error(`Invalid semantic version: ${value}`);
  return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') };
}
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a), right = parseVersion(b);
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1;
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}. Check permissions and that the command is on PATH.`);
  return result.stdout.trim();
}
function real(path: string): string | undefined {
  try { return realpathSync(path); } catch { return undefined; }
}
function pointsToPackage(path: string, target: string): boolean {
  if (real(path) === target) return true;
  // pnpm creates shell shims as well as symlinks on Unix.
  try {
    const shim = readFileSync(path, 'utf8');
    const reference = `$basedir/${relative(real(dirname(path)) ?? dirname(path), target)}`;
    return shim.startsWith('#!/bin/sh') && shim.includes(`"${reference}"`) && shim.includes('exec ');
  } catch { return false; }
}

export function pathExecutables(path = process.env.PATH ?? ''): string[] {
  const paths: string[] = [];
  for (const dir of path.split(delimiter)) for (const bin of ['rpd', name]) {
    const candidate = resolve(dir || '.', bin);
    try { accessSync(candidate, constants.X_OK); paths.push(candidate); } catch {}
  }
  return paths;
}

type Manager = 'npm' | 'pnpm';
export function detectInstallation(root: string, executable: string, paths: string[], execute = run): Manager {
  const target = real(executable);
  if (!target || target !== real(join(root, 'dist-node/cli.js')) || existsSync(join(root, '.git')) || root.split(/[\\/]/).includes('_npx')) throw new Error(`Unsupported development, npx, or standalone installation. ${manual}`);
  if (!paths.length || paths.some(path => !pointsToPackage(path, target))) throw new Error(`Multiple or conflicting RPD executables on PATH, or the active installation is not on PATH. Remove conflicting installations first. ${manual}`);
  const owners: Manager[] = [];
  for (const manager of ['npm', 'pnpm'] as const) {
    try {
      const globalRoot = execute(manager, ['root', '-g']);
      const bin = manager === 'npm' ? join(execute(manager, ['prefix', '-g']), 'bin') : execute(manager, ['bin', '-g']);
      if (real(join(globalRoot, name)) === real(root) && paths.every(path => real(dirname(path)) === real(bin))) owners.push(manager);
    } catch { /* A missing manager cannot establish ownership. */ }
  }
  if (owners.length !== 1) throw new Error(`Cannot determine a unique npm/pnpm global installation owner. Ensure its package manager is on PATH. ${manual}`);
  return owners[0];
}

export async function latestVersion(request: typeof fetch = fetch): Promise<string> {
  try {
    const response = await request(`https://registry.npmjs.org/${name}/latest`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`registry returned HTTP ${response.status}`);
    const data = await response.json() as { name?: unknown; version?: unknown };
    if (data.name !== name || typeof data.version !== 'string' || parseVersion(data.version).pre) throw new Error('invalid stable release metadata');
    return data.version;
  } catch (error) {
    throw new Error(`Cannot check npm for updates: ${error instanceof Error ? error.message : String(error)}. Check your connection and retry.`);
  }
}

export async function upgrade(check: boolean, deps = {
  current: () => installedVersion(), latest: () => latestVersion(),
  detect: () => detectInstallation(packageRoot, process.argv[1], pathExecutables()),
  execute: run,
  verify: () => {
    detectInstallation(packageRoot, process.argv[1], pathExecutables());
    const metadata = installedVersion();
    const executable = pathExecutables()[0];
    const active = run(executable, ['--version']);
    if (active !== metadata) throw new Error('Active executable and package metadata disagree.');
    return active;
  },
  log: console.log,
}): Promise<void> {
  deps.log('Checking for updates...');
  const current = deps.current(), latest = await deps.latest();
  deps.log(`Current version: ${current}\nLatest version:  ${latest}`);
  if (compareVersions(current, latest) >= 0) { deps.log('RPD is already up to date.'); return; }
  if (check) { deps.log('Update available.\nRun `rpd upgrade` to install.'); return; }
  const manager = deps.detect();
  deps.log(`Upgrading RPD using ${manager}...`);
  deps.execute(manager, manager === 'npm' ? ['install', '-g', `${name}@latest`] : ['add', '-g', `${name}@latest`]);
  try {
    const version = deps.verify();
    if (compareVersions(version, latest) < 0) throw new Error(`Active executable is still v${version}; expected at least v${latest}.`);
    deps.log(`Successfully upgraded to v${version}`);
  } catch (error) {
    throw new Error(`Upgrade ran, but verification failed: ${error instanceof Error ? error.message : String(error)} Check your PATH and global installation. ${manual}`);
  }
}
