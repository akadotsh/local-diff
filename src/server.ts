import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { watch } from 'chokidar';
import type { SpawnSyncReturns } from 'node:child_process';

type CommandResult = { status: number | null; stdout: string; stderr: string; error?: Error };
type ReviewClient = ReadableStreamDefaultController<Uint8Array>;

function command(name: string, args: string[], cwd?: string): CommandResult {
  const result: SpawnSyncReturns<string> = spawnSync(name, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error };
}

export function findRepository(cwd = process.cwd()) {
  const result = command('git', ['rev-parse', '--show-toplevel'], cwd);
  if (result.error || result.status !== 0) throw new Error(`Not inside a Git repository: ${result.stderr.trim() || result.error?.message || 'git failed'}`);
  return result.stdout.trim();
}

export function git(root: string, args: string[]) {
  const result = command('git', args, root);
  if (result.error || result.status !== 0) throw new Error(result.stderr.trim() || result.error?.message || `git ${args[0]} failed`);
  return result.stdout;
}

export function reviewFile(root: string) {
  return resolve(root, git(root, ['rev-parse', '--git-path', 'rex-pierre-diffs.json']).trim());
}

async function addedFilePatch(root: string, file: string) {
  const path = resolve(root, file);
  if (!path.startsWith(root + sep)) return '';
  try {
    const filePath = await realpath(path);
    if (!filePath.startsWith(root + sep)) return '';
    const info = await stat(filePath);
    if (info.size > 1_000_000) return '';
    if ((await readFile(filePath)).includes(0)) return '';
    const result = command('git', ['diff', '--no-index', '--no-ext-diff', '--binary', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', filePath], root);
    if (result.error || (result.status !== 0 && result.status !== 1)) throw new Error(result.stderr.trim() || result.error?.message || 'Could not read added file');
    return result.stdout.replaceAll(filePath, `/${file}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export async function getSnapshot(root: string, mode = 'all') {
  if (!['all', 'working', 'staged'].includes(mode)) throw new Error(`Unknown diff mode: ${mode}`);
  let tracked = '';
  if (mode === 'all') {
    const head = command('git', ['rev-parse', '--verify', 'HEAD'], root);
    if (head.error) throw head.error;
    if (head.status === 0) tracked = git(root, ['diff', 'HEAD', '--no-ext-diff', '--binary', '--find-renames']);
    else for (const file of git(root, ['ls-files', '--cached', '-z']).split('\0').filter(Boolean)) tracked += await addedFilePatch(root, file);
  } else tracked = mode === 'staged'
    ? git(root, ['diff', '--cached', '--no-ext-diff', '--binary', '--find-renames'])
    : git(root, ['diff', '--no-ext-diff', '--binary', '--find-renames']);
  const untracked = mode === 'staged' ? [] : git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  let extra = '';
  for (const file of untracked) extra += await addedFilePatch(root, file);
  return { app: 'rex-pierre-diffs', root, branch: git(root, ['branch', '--show-current']).trim(), patch: tracked + extra };
}

export function createApp(root: string, token: string, reviewsPath = reviewFile(root), clients = new Set<ReviewClient>(), rexCommand = (args: string[]) => command('rex', args)) {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  return async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === '/events') return new Response(new ReadableStream<Uint8Array>({ start(c) { clients.add(c); req.signal.addEventListener('abort', () => clients.delete(c), { once: true }); } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
    if (url.pathname === '/api/diff' && req.method === 'GET') {
      try { return Response.json({ ...await getSnapshot(root, url.searchParams.get('mode') || 'all'), session: process.env.REX_SESSION || null }); }
      catch (error) { return Response.json({ error: String(error) }, { status: 400 }); }
    }
    if (url.pathname === '/api/reviews' && req.method === 'GET') {
      try { return Response.json(JSON.parse(await readFile(reviewsPath, 'utf8'))); }
      catch { return Response.json([]); }
    }
    if (url.pathname === '/api/reviews' && req.method === 'POST') {
      if (req.headers.get('x-review-token') !== token) return new Response('Forbidden', { status: 403 });
      try { const reviews = await req.json(); if (!Array.isArray(reviews)) return new Response('Reviews must be an array', { status: 400 }); await writeFile(reviewsPath, JSON.stringify(reviews, null, 2)); return Response.json({ ok: true }); }
      catch { return new Response('Invalid JSON', { status: 400 }); }
    }
    if (url.pathname === '/api/targets' && req.method === 'GET') {
      const rexSession = process.env.REX_SESSION;
      if (!rexSession) return Response.json({ error: 'This CLI was not launched from a Rex pane.' }, { status: 503 });
      const result = rexCommand(['block', 'ls', '-s', rexSession, '--json']);
      if (result.error || result.status !== 0) return Response.json({ error: result.stderr.trim() || result.error?.message || 'Could not list Rex panes' }, { status: 502 });
      try {
        const data = JSON.parse(result.stdout);
        const blocks: Array<{ id: string; label: string }> = [];
        const visit = (value: unknown): void => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') { const record = value as Record<string, unknown>; const id = record.block_id || record.blockId; if (typeof id === 'string') blocks.push({ id, label: String(record.label || record.title || id) }); Object.values(record).forEach(visit); } };
        visit(data); return Response.json({ blocks });
      } catch { return Response.json({ error: 'Rex returned invalid pane data' }, { status: 502 }); }
    }
    if (url.pathname === '/api/send' && req.method === 'POST') {
      if (req.headers.get('x-review-token') !== token) return new Response('Forbidden', { status: 403 });
      const rexSession = process.env.REX_SESSION;
      if (!rexSession) return Response.json({ error: 'Rex session is unavailable' }, { status: 503 });
      try {
        const { blockId, message } = await req.json() as { blockId?: unknown; message?: unknown };
        if (typeof blockId !== 'string' || typeof message !== 'string' || !message.trim() || message.length > 30000) return new Response('Invalid destination or message', { status: 400 });
        const listed = rexCommand(['block', 'ls', '-s', rexSession, '--json']);
        if (listed.error || listed.status !== 0) return Response.json({ error: listed.stderr.trim() || listed.error?.message || 'Could not verify pane' }, { status: 502 });
        const data = JSON.parse(listed.stdout);
        const ids = new Set<string>();
        const visit = (value: unknown): void => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') { const record = value as Record<string, unknown>; const id = record.block_id || record.blockId; if (typeof id === 'string') ids.add(id); Object.values(record).forEach(visit); } };
        visit(data);
        if (!ids.has(blockId)) return new Response('Selected pane is not in the active Rex session', { status: 403 });
        const result = rexCommand(['send', '-s', rexSession, '-b', blockId, message]);
        if (result.error || result.status !== 0) return Response.json({ error: result.stderr.trim() || result.error?.message || 'Rex could not send to that pane' }, { status: 502 });
        return Response.json({ ok: true });
      } catch (error) { return Response.json({ error: String(error) }, { status: 400 }); }
    }
    if (url.pathname === '/') {
      try { const index = await readFile(resolve(dist, 'index.html'), 'utf8'); return new Response(index.replace('</head>', `<meta name="review-token" content="${token}"></head>`), { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
      catch { return new Response('Build the frontend first with `npm run build`.', { status: 503 }); }
    }
    if (url.pathname.startsWith('/assets/')) {
      const path = resolve(dist, url.pathname.slice(1));
      if (!path.startsWith(dist + sep)) return new Response('Not found', { status: 404 });
      try {
        const info = await stat(path);
        if (!info.isFile()) return new Response('Not found', { status: 404 });
        const type = ({ '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8' } as Record<string, string>)[extname(path)] || 'application/octet-stream';
        return new Response(await readFile(path), { headers: { 'content-type': type } });
      } catch { return new Response('Not found', { status: 404 }); }
    }
    return new Response('Not found', { status: 404 });
  };
}

async function toRequest(incoming: IncomingMessage, signal: AbortSignal) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  let body: Buffer | undefined;
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    body = Buffer.concat(chunks);
  }
  return new Request(`http://127.0.0.1${incoming.url || '/'}`, { method: incoming.method || 'GET', headers, body, signal, ...(body ? { duplex: 'half' } : {}) } as RequestInit);
}

async function sendResponse(response: Response, outgoing: ServerResponse) {
  const headers = Object.fromEntries(response.headers.entries());
  outgoing.writeHead(response.status, headers);
  if (!response.body) { outgoing.end(); return; }
  Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(outgoing);
}

export async function startServer(root = findRepository(), port = Number(process.env.PORT) || 4179): Promise<HttpServer> {
  const clients = new Set<ReviewClient>();
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const app = createApp(root, randomUUID(), undefined, clients);
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController();
    incoming.once('aborted', () => abort.abort());
    outgoing.once('close', () => { if (!outgoing.writableEnded) abort.abort(); });
    try { await sendResponse(await app(await toRequest(incoming, abort.signal)), outgoing); }
    catch (error) { if (!outgoing.headersSent) outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); outgoing.end(String(error)); }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => rejectListen(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolveListen(); });
  });
  const watcher = watch(root, { ignored: [/\/\.git\//, /\/node_modules\//], ignoreInitial: true }).on('all', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { for (const client of clients) try { client.enqueue(new TextEncoder().encode('data: update\n\n')); } catch { clients.delete(client); } }, 250);
  });
  const address = server.address() as AddressInfo;
  const infoPath = resolve(tmpdir(), `rex-pierre-diffs-${process.pid}.json`);
  try { await writeFile(infoPath, JSON.stringify({ root, port: address.port })); }
  catch (error) { await watcher.close(); server.close(); throw error; }
  const cleanup = () => { clearTimeout(refreshTimer); void watcher.close(); void unlink(infoPath).catch(() => {}); };
  server.once('close', cleanup);
  const shutdown = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('close', () => { process.off('SIGINT', shutdown); process.off('SIGTERM', shutdown); });
  console.log(`[rex-pierre-diffs] listening at http://127.0.0.1:${address.port} (root ${root})`);
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void startServer();
