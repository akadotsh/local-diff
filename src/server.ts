import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
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
    if (!info.isFile() || info.size > 1_000_000) return '';
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

export async function repositoryFiles(root: string) {
  const run = (args: string[]) => new Promise<string>((done, reject) => {
    execFile('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : done(stdout));
  });
  const [listing, porcelain] = await Promise.all([
    run(['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
    run(['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  const statuses: Record<string, string> = Object.create(null);
  const records = porcelain.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const code = record.slice(0, 2);
    statuses[record.slice(3)] = code;
    if (/[RC]/.test(code)) i++;
  }
  // Git has no empty directories; deleted tracked paths remain visible with their status.
  return { paths: [...new Set(listing.split('\0').filter(path => path && !path.split('/').includes('.git')))], statuses };
}

export async function repositoryFile(root: string, path: string) {
  if (!path || isAbsolute(path) || /^[a-z]:/i.test(path) || (process.platform === 'win32' && path.includes('\\')) || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.' || part === '.git' || !part)) {
    return Response.json({ error: 'Expected a repository-relative file path' }, { status: 400 });
  }
  try {
    const base = await realpath(root);
    const target = await realpath(resolve(base, path));
    if (!target.startsWith(base + sep)) return Response.json({ error: 'File is outside the repository' }, { status: 403 });
    if (target.slice(base.length + 1).split(sep).includes('.git')) return Response.json({ error: 'Git metadata cannot be previewed' }, { status: 403 });
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile()) return Response.json({ error: 'Not a regular file' }, { status: 400 });
      if (info.size > 1_000_000) return Response.json({ error: 'File is too large to preview (1 MB limit)' }, { status: 413 });
      const bytes = Buffer.alloc(1_000_001);
      let bytesRead = 0;
      while (bytesRead < bytes.length) {
        const chunk = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead > 1_000_000) return Response.json({ error: 'File is too large to preview (1 MB limit)' }, { status: 413 });
      const content = bytes.subarray(0, bytesRead);
      if (content.includes(0)) return Response.json({ error: 'Binary files cannot be previewed' }, { status: 415 });
      let contents: string;
      try { contents = new TextDecoder('utf-8', { fatal: true }).decode(content); }
      catch { return Response.json({ error: 'File is binary or is not UTF-8 text' }, { status: 415 }); }
      return Response.json({ name: path, contents });
    } finally { await handle.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return Response.json({ error: code === 'ENOENT' ? 'File no longer exists' : 'Could not read file' }, { status: code === 'ENOENT' ? 404 : 400 });
  }
}

function agentPanes(session: string, rexCommand: (args: string[]) => CommandResult) {
  const listed = rexCommand(['block', 'ls', '-s', session, '--json']);
  if (listed.error || listed.status !== 0) throw new Error(listed.stderr.trim() || listed.error?.message || 'Could not list Rex panes');
  const candidates = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const id = record.block_id || record.blockId;
      if (typeof id === 'string') candidates.add(id);
      Object.values(record).forEach(visit);
    }
  };
  visit(JSON.parse(listed.stdout));
  // shortcut: generic node/python wrappers are not detected; extend detection when Rex exposes their agent command.
  const names: Record<string, string> = { codex: 'Codex', claude: 'Claude', opencode: 'OpenCode', gemini: 'Gemini', aider: 'Aider', amp: 'Amp', goose: 'Goose', 'cursor-agent': 'Cursor Agent', droid: 'Droid' };
  const blocks: Array<{ id: string; label: string; agent: string }> = [];
  for (const id of candidates) {
    const result = rexCommand(['block', 'call', '-s', session, '-b', id, 'process']);
    if (result.error || result.status !== 0) continue;
    try {
      const { foreground } = JSON.parse(result.stdout);
      const agent = typeof foreground?.name === 'string' && Object.hasOwn(names, foreground.name) ? names[foreground.name] : undefined;
      if (!agent) continue;
      const cwd = typeof foreground.cwd === 'string' ? foreground.cwd.split(/[\\/]/).filter(Boolean).pop() : undefined;
      blocks.push({ id, agent, label: cwd ? `${agent} · ${cwd}` : agent });
    } catch { /* A pane may exit while its process is being inspected. */ }
  }
  return blocks;
}

export function createApp(root: string, token: string, reviewsPath = reviewFile(root), clients = new Set<ReviewClient>(), rexCommand = (args: string[]) => command('rex', args)) {
  const dist = process.env.RPD_DIST_DIR ? resolve(process.env.RPD_DIST_DIR) : resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  let listing: ReturnType<typeof repositoryFiles> | undefined;
  const handler = async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === '/api/file-asset' && req.method === 'GET') {
      const host = new URL('http://' + (req.headers.get('host') || url.host)).hostname;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host) || (req.headers.get('x-review-token') !== token && url.searchParams.get('token') !== token)) return new Response('Forbidden', { status: 403 });
      const files = await repositoryFiles(root).catch(() => null);
      const path = url.searchParams.get('path') || '';
      if (!files?.paths.includes(path)) return new Response('File not found', { status: 404 });
      if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) return new Response('Unsupported image', { status: 415 });
      try {
        const base = await realpath(root), target = await realpath(resolve(base, path));
        if (!target.startsWith(base + sep) || target.slice(base.length + 1).split(sep).includes('.git')) return new Response('Forbidden', { status: 403 });
        const info = await stat(target);
        if (!info.isFile() || info.size > 5_000_000) return new Response('Image too large', { status: 413 });
        const bytes = await readFile(target);
        if (bytes.includes(0) && extname(path).toLowerCase() === '.svg') return new Response('Invalid SVG', { status: 415 });
        const type = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml'} as Record<string,string>)[extname(path).toLowerCase()];
        if (type === 'image/svg+xml') return new Response(bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/\s+on\w+\s*=\s*(["']).*?\1/gi, ''), {headers:{'content-type':type,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
        return new Response(bytes, {headers:{'content-type':type,'x-content-type-options':'nosniff'}});
      } catch { return new Response('File not found', { status:404 }); }
    }
    if (url.pathname === '/api/files' || url.pathname === '/api/file') {
      if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      const host = new URL('http://' + (req.headers.get('host') || url.host)).hostname;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return new Response('Forbidden host', { status: 403 });
      if (req.headers.get('x-review-token') !== token) return new Response('Forbidden', { status: 403 });
      if (!listing) {
        const pending = repositoryFiles(root);
        listing = pending;
        pending.catch(() => { if (listing === pending) listing = undefined; });
      }
      try {
        const files = await listing;
        if (url.pathname === '/api/files') return Response.json(files);
        const path = url.searchParams.get('path') || '';
        if (!files.paths.includes(path)) return Response.json({ error: 'File is not in the repository listing' }, { status: 404 });
        return repositoryFile(root, path);
      } catch { return Response.json({ error: 'Could not list repository files' }, { status: 500 }); }
    }
    if (url.pathname === '/events') return new Response(new ReadableStream<Uint8Array>({ start(c) { clients.add(c); c.enqueue(new TextEncoder().encode(': connected\n\n')); req.signal.addEventListener('abort', () => clients.delete(c), { once: true }); } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
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
      try { return Response.json({ blocks: agentPanes(rexSession, rexCommand) }); }
      catch (error) { return Response.json({ error: String(error) }, { status: 502 }); }
    }
    if (url.pathname === '/api/send' && req.method === 'POST') {
      if (req.headers.get('x-review-token') !== token) return new Response('Forbidden', { status: 403 });
      const rexSession = process.env.REX_SESSION;
      if (!rexSession) return Response.json({ error: 'Rex session is unavailable' }, { status: 503 });
      try {
        const { blockId, message } = await req.json() as { blockId?: unknown; message?: unknown };
        if (typeof blockId !== 'string' || typeof message !== 'string' || !message.trim() || message.length > 30000) return new Response('Invalid destination or message', { status: 400 });
        let blocks: ReturnType<typeof agentPanes>;
        try { blocks = agentPanes(rexSession, rexCommand); }
        catch (error) { return Response.json({ error: String(error) }, { status: 502 }); }
        if (!blocks.some(block => block.id === blockId)) return Response.json({ error: 'Selected pane is no longer running a recognized coding agent in this Rex session' }, { status: 403 });
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
  return Object.assign(handler, { invalidateFiles: () => { listing = undefined; } });
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

export async function startServer(root = findRepository(), port = Number(process.env.PORT) || 4179, token = randomUUID()): Promise<HttpServer> {
  const clients = new Set<ReviewClient>();
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const app = createApp(root, token, undefined, clients);
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
  const watcher = watch(root, { ignored: [/\/\.git\/(?:objects|logs)(?:\/|$)/, /\/\.git\/rex-pierre-diffs\.json$/, /\/node_modules(?:\/|$)/], ignoreInitial: true }).on('all', () => {
    app.invalidateFiles();
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

if (process.argv[1] && /(?:^|[\\/])server\.js$/.test(process.argv[1])) void startServer();
