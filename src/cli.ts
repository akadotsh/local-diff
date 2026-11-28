#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseCliArgs } from './shared/cliArgs.js';
import { startServer } from './server.js';
import { pixelCommand, runPixelCLI } from './pixel.js';
import { installedVersion, standaloneVersion, upgrade } from './upgrade.js';

async function main() {
  const standalone = standaloneVersion !== undefined;
  const commandArgs = process.argv.slice(2);
  if (commandArgs[0] === '--version' && commandArgs.length === 1) { console.log(installedVersion()); return; }
  if (commandArgs[0] === 'upgrade') {
    if (standalone) throw new Error('To upgrade this standalone installation, rerun: curl -fsSL https://raw.githubusercontent.com/akadotsh/local-diff/main/install.sh | sh');
    if (commandArgs.length > 2 || (commandArgs[1] !== undefined && commandArgs[1] !== '--check')) throw new Error('Usage: local-diff upgrade [--check]');
    await upgrade(commandArgs[1] === '--check');
    return;
  }
  const options = parseCliArgs(process.argv.slice(2), process.cwd());
  if (options.help) {
    console.log('local-diff — review local Git changes inside Rex\n\nUsage: local-diff [--split right|left|above|below] [--cwd PATH] [--session ID] [--block ID]\n\nOther commands: local-diff upgrade [--check], local-diff --version\n\nRun inside a Git repository in a Rex terminal. Requires Git, Rex, and a Pixel-supported terminal. Requires Node.js 22 or newer for npm installations.');
    return;
  }

  const cwd = options.cwd;
  let session = options.session || process.env.REX_SESSION || undefined;
  let block = options.block || process.env.REX_BLOCK || undefined;
  const repoResult = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (repoResult.error || repoResult.status !== 0) throw new Error(`Run inside a Git repository: ${repoResult.stderr?.trim() || repoResult.error?.message || 'git failed'}`);
  const root = repoResult.stdout.trim();

  const check = spawnSync('rex', ['whoami', '--json'], { encoding: 'utf8' });
  if (check.error || check.status !== 0) throw new Error(`Required command rex is unavailable: ${check.stderr?.trim() || check.error?.message || `exit ${check.status}`}`);
  try {
    const whoami = JSON.parse(check.stdout) as { session_id?: string; block_id?: string };
    session = options.session || whoami.session_id || session;
    block = options.block || whoami.block_id || block;
  } catch {}
  session ||= block;

  const logPath = join(tmpdir(), `local-diff-server-${process.pid}.log`);
  const log = await open(logPath, 'a');
  const serverPath = standalone ? undefined : fileURLToPath(new URL('./server.js', import.meta.url));
  let info: { root: string; port: number } | undefined;
  for (let port = 4179; port < 4200; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/diff`, { signal: AbortSignal.timeout(250) });
      if (response.ok) {
        const data = await response.json() as { app?: string; root?: string; session?: string | null };
        if (data.app === 'local-diff' && data.root === root && data.session === (session ?? null)) {
          info = { root, port };
          break;
        }
      }
    } catch {}

    const env = {
      ...process.env,
      PORT: String(port),
      ...(session ? { REX_SESSION: session } : {}),
      ...(block ? { REX_BLOCK: block } : {}),
      ...(standalone ? { LOCAL_DIFF_DIST_DIR: join(process.execPath, '..', 'dist') } : {}),
    };
    const child = spawn(process.execPath, standalone ? ['--internal-server'] : [serverPath!], {
      cwd: root,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env,
    });
    child.unref();
    let startupError: Error | undefined;
    child.once('error', error => { startupError = error; });
    if (child.pid) await unlink(join(tmpdir(), `local-diff-${child.pid}.json`)).catch(() => {});

    for (let i = 0; i < 100 && child.pid; i++) {
      try {
        const childInfoPath = join(tmpdir(), `local-diff-${child.pid}.json`);
        info = JSON.parse(await readFile(childInfoPath, 'utf8')) as { root: string; port: number };
        await unlink(childInfoPath);
        break;
      } catch {}
      if (startupError || child.exitCode !== null) break;
      await delay(100);
    }
    if (!info && child.exitCode === null) child.kill('SIGTERM');
    if (info) break;
  }
  await log.close();
  if (!info) {
    const output = await readFile(logPath, 'utf8').catch(() => '(no server output)');
    throw new Error(`local-diff server did not become ready on ports 4179–4199. Log: ${logPath}\n${output.slice(-4000)}`);
  }

  const [command, ...viewerArgs] = pixelCommand(`http://127.0.0.1:${info.port}`);
  const args = ['run', `--split=${options.split}`, '--ratio', '50', '--focus=false', '--label', 'Local Diff', '-c', root];
  if (session) args.push('--session', session);
  if (block) args.push('--block', block);
  const result = spawnSync('rex', [...args, '--', command, ...viewerArgs], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`Pixel failed to open the viewer (exit ${result.status}). The server remains running at http://127.0.0.1:${info.port}. Log: ${logPath}${output ? `\n${output}` : ''}${result.error ? `\n${result.error.message}` : ''}`);
  }
}

const reportError = (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
};

if (process.argv[2] === '--internal-server') void startServer().catch(reportError);
else if (process.argv[2] === '--internal-pixel' && standaloneVersion !== undefined) runPixelCLI();
else void main().catch(reportError);
