#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseCliArgs } from './shared/cliArgs.js';
import { startServer } from './server.js';

async function main() {
  const options = parseCliArgs(process.argv.slice(2), process.cwd());
  if (options.help) {
    console.log('rex-pierre-diffs — review local Git changes inside Rex\n\nUsage: rex-pierre-diffs [--split right|left|above|below] [--cwd PATH] [--session ID] [--block ID]\n\nRun inside a Git repository in a Rex terminal. Requires Git, Rex, and terminal-browser. Requires Node.js only for npm installations.');
    return;
  }

  const cwd = options.cwd;
  let session = options.session || process.env.REX_SESSION || undefined;
  let block = options.block;
  const repoResult = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (repoResult.error || repoResult.status !== 0) throw new Error(`Run inside a Git repository: ${repoResult.stderr?.trim() || repoResult.error?.message || 'git failed'}`);
  const root = repoResult.stdout.trim();

  for (const [binary, args] of [['rex', ['whoami', '--json']], ['terminal-browser', ['--version']]] as const) {
    const check = spawnSync(binary, args, { encoding: 'utf8' });
    if (check.error || check.status !== 0) throw new Error(`Required command ${binary} is unavailable: ${check.stderr?.trim() || check.error?.message || `exit ${check.status}`}`);
    if (binary === 'rex') {
      try {
        const whoami = JSON.parse(check.stdout) as { session_id?: string; block_id?: string };
        if (whoami.session_id && whoami.block_id) {
          session = options.session || whoami.session_id;
          block = options.block || whoami.block_id;
        }
      } catch {}
    }
  }

  const logPath = join(tmpdir(), `rex-pierre-diffs-server-${process.pid}.log`);
  const log = await open(logPath, 'a');
  const standalone = (() => { try { return createRequire(import.meta.url)('node:sea').isSea(); } catch { return false; } })();
  const serverPath = standalone ? undefined : fileURLToPath(new URL('./server.js', import.meta.url));
  let info: { root: string; port: number } | undefined;
  for (let port = 4179; port < 4200; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/diff`, { signal: AbortSignal.timeout(250) });
      if (response.ok) {
        const data = await response.json() as { app?: string; root?: string; session?: string | null };
        if (data.app === 'rex-pierre-diffs' && data.root === root && data.session === (session ?? null)) {
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
      ...(standalone ? { RPD_DIST_DIR: join(fileURLToPath(new URL('.', import.meta.url)), 'dist') } : {}),
    };
    const child = spawn(standalone ? process.argv[1]! : process.execPath, standalone ? ['--internal-server'] : [serverPath!], {
      cwd: root,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env,
    });
    child.unref();
    let startupError: Error | undefined;
    child.once('error', error => { startupError = error; });
    if (child.pid) await unlink(join(tmpdir(), `rex-pierre-diffs-${child.pid}.json`)).catch(() => {});

    for (let i = 0; i < 100 && child.pid; i++) {
      try {
        const childInfoPath = join(tmpdir(), `rex-pierre-diffs-${child.pid}.json`);
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
    throw new Error(`rex-pierre-diffs server did not become ready on ports 4179–4199. Log: ${logPath}\n${output.slice(-4000)}`);
  }

  const args = ['run', `--split=${options.split}`, '--ratio', '50', '--label', 'rex-pierre-diffs', '--focus=false', '--keep-open', '-c', root];
  if (session) args.push('--session', session);
  if (block) args.push('--block', block);
  const result = spawnSync('rex', [...args, '--', 'terminal-browser', 'open', `http://127.0.0.1:${info.port}`], {
    encoding: 'utf8',
    env: { ...process.env, TERMINAL_BROWSER_NO_CHROME: '1' },
  });
  if (result.error || result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`Rex failed to open the viewer (exit ${result.status}). Check rex and terminal-browser; the server remains running at http://127.0.0.1:${info.port}. Log: ${logPath}${output ? `\n${output}` : ''}${result.error ? `\n${result.error.message}` : ''}`);
  }
}

const reportError = (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
};

if (process.argv[2] === '--internal-server') void startServer().catch(reportError);
else void main().catch(reportError);
