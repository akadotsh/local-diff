#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = process.cwd();
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('rex-pierre-diffs — review local Git changes inside Rex\n\nUsage: rex-pierre-diffs\n\nRun inside a Git repository in a Rex terminal. Requires Node.js, Git, Rex, and terminal-browser.');
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('Unknown option. Run rex-pierre-diffs --help.');

const repoResult = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
if (repoResult.error || repoResult.status !== 0) throw new Error(`Run inside a Git repository: ${repoResult.stderr?.trim() || repoResult.error?.message || 'git failed'}`);
const root = repoResult.stdout.trim();
for (const [binary, args] of [['rex', ['whoami', '--json']], ['terminal-browser', ['--version']]] as const) {
  const check = spawnSync(binary, args, { encoding: 'utf8' });
  if (check.error || check.status !== 0) throw new Error(`Required command ${binary} is unavailable: ${check.stderr?.trim() || check.error?.message || `exit ${check.status}`}`);
}

const logPath = join(tmpdir(), `rex-pierre-diffs-server-${process.pid}.log`);
const log = await open(logPath, 'a');
const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
let info: { root: string; port: number } | undefined;
for (let port = 4179; port < 4200; port++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/diff`, { signal: AbortSignal.timeout(250) });
    if (response.ok) { const data = await response.json() as { app?: string; root?: string }; if (data.app === 'rex-pierre-diffs' && data.root === root) { info = { root, port }; break; } }
  } catch {}
  const child = spawn(process.execPath, [serverPath], { cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, PORT: String(port) } });
  child.unref();
  let startupError: Error | undefined;
  child.once('error', error => { startupError = error; });
  if (!child.pid) { startupError ??= new Error('Could not start the Node.js server process'); }
  for (let i = 0; i < 100 && child.pid; i++) {
    try {
      const infoPath = join(tmpdir(), `rex-pierre-diffs-${child.pid}.json`);
      info = JSON.parse(await readFile(infoPath, 'utf8')) as { root: string; port: number };
      await unlink(infoPath);
      break;
    } catch {}
    if (startupError || child.exitCode !== null) break;
    await delay(100);
  }
  if (info) break;
}
await log.close();
if (!info) { const output = await readFile(logPath, 'utf8').catch(() => '(no server output)'); throw new Error(`rex-pierre-diffs server did not become ready on ports 4179–4199. Log: ${logPath}\n${output.slice(-4000)}`); }

const args = ['run', '--split=right', '--ratio', '50', '--label', 'rex-pierre-diffs', '--focus=false', '--keep-open', '--cwd', root];
if (process.env.REX_SESSION) args.push('--session', process.env.REX_SESSION);
if (process.env.REX_BLOCK) args.push('--block', process.env.REX_BLOCK);
const result = spawnSync('rex', [...args, '--', 'terminal-browser', 'open', `http://127.0.0.1:${info.port}`], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error(`Rex failed to open the viewer (exit ${result.status}). Check rex and terminal-browser; the server remains running at http://127.0.0.1:${info.port}. Log: ${logPath}${result.error ? `\n${result.error.message}` : ''}`);
