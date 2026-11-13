import { serve, type Server } from 'bun';
import { resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { watch } from 'chokidar';

export function findRepository(cwd = process.cwd()) {
  const result = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode) throw new Error(`Not inside a Git repository: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}

export function git(root: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode) throw new Error(result.stderr.toString().trim() || `git ${args[0]} failed`);
  return result.stdout.toString();
}

export function reviewFile(root:string) {
  const result=Bun.spawnSync(['git','rev-parse','--git-path','rex-pierre-diffs.json'],{cwd:root,stdout:'pipe',stderr:'pipe'});
  if(result.exitCode)throw new Error(result.stderr.toString().trim());
  return resolve(root,result.stdout.toString().trim());
}

async function addedFilePatch(root:string,file:string) {
  const path=resolve(root,file);
  if(!path.startsWith(root+sep))return '';
  try {
    const filePath=await realpath(path);
    if(!filePath.startsWith(root+sep))return '';
    const source=Bun.file(filePath);
    if(source.size>1_000_000|| (await source.text()).includes('\0'))return '';
    const result=Bun.spawnSync(['git','diff','--no-index','--no-ext-diff','--binary','--',process.platform==='win32'?'NUL':'/dev/null',filePath],{cwd:root,stdout:'pipe',stderr:'pipe'});
    if(result.exitCode!==0&&result.exitCode!==1)throw new Error(result.stderr.toString().trim()||'Could not read added file');
    return result.stdout.toString().replaceAll(filePath,`/${file}`);
  } catch(error) {
    if(error instanceof Error&&error.message.includes('ENOENT'))return '';
    throw error;
  }
}

export async function getSnapshot(root: string, mode = 'all') {
  if (!['all', 'working', 'staged'].includes(mode)) throw new Error(`Unknown diff mode: ${mode}`);
  let tracked = '';
  if (mode === 'all') {
    const head = Bun.spawnSync(['git', 'rev-parse', '--verify', 'HEAD'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    if(head.exitCode===0) tracked=git(root,['diff','HEAD','--no-ext-diff','--binary','--find-renames']);
    else for(const file of git(root,['ls-files','--cached','-z']).split('\0').filter(Boolean))tracked+=await addedFilePatch(root,file);
  } else tracked = mode === 'staged'
    ? git(root, ['diff', '--cached', '--no-ext-diff', '--binary', '--find-renames'])
    : git(root, ['diff', '--no-ext-diff', '--binary', '--find-renames']);
  const untracked = mode === 'staged' ? [] : git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  let extra = '';
  for (const file of untracked) extra+=await addedFilePatch(root,file);
  return { app:'rex-pierre-diffs', root, branch: git(root, ['branch', '--show-current']).trim(), patch: tracked + extra };
}

export function createApp(root: string, token: string, reviewsPath = reviewFile(root), clients = new Set<ReadableStreamDefaultController>(), rexCommand = (args:string[]) => Bun.spawnSync(['rex', ...args], { stdout:'pipe', stderr:'pipe' })) {
  const dist = resolve(import.meta.dir, '../dist');
  const rexSession = process.env.REX_SESSION;
  return async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === '/events') return new Response(new ReadableStream({ start(c) { clients.add(c); req.signal.addEventListener('abort', () => clients.delete(c)); } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
    if (url.pathname === '/api/diff' && req.method === 'GET') {
      try { return Response.json(await getSnapshot(root, url.searchParams.get('mode') || 'all')); }
      catch (error) { return Response.json({ error: String(error) }, { status: 400 }); }
    }
    if (url.pathname === '/api/reviews' && req.method === 'GET') return Response.json(await Bun.file(reviewsPath).json().catch(() => []));
    if (url.pathname === '/api/reviews' && req.method === 'POST') {
      if (req.headers.get('x-review-token') !== token) return new Response('Forbidden', { status: 403 });
      try { const reviews = await req.json(); if (!Array.isArray(reviews)) return new Response('Reviews must be an array', { status: 400 }); await Bun.write(reviewsPath, JSON.stringify(reviews, null, 2)); return Response.json({ ok: true }); }
      catch { return new Response('Invalid JSON', { status: 400 }); }
    }
    if (url.pathname === '/api/targets' && req.method === 'GET') {
      if (!rexSession) return Response.json({ error:'This CLI was not launched from a Rex pane.' }, { status:503 });
      const result=rexCommand(['block','ls','-s',rexSession,'--json']);
      if(result.exitCode) return Response.json({ error:result.stderr.toString().trim()||'Could not list Rex panes' }, { status:502 });
      try {
        const data=JSON.parse(result.stdout.toString());
        const blocks:Array<{id:string;label:string}> = [];
        const visit=(value:any)=>{if(Array.isArray(value)){value.forEach(visit);return}if(value&&typeof value==='object'){const id=value.block_id||value.blockId;if(typeof id==='string')blocks.push({id,label:String(value.label||value.title||id)});Object.values(value).forEach(visit)}};
        visit(data); return Response.json({blocks});
      } catch { return Response.json({error:'Rex returned invalid pane data'}, {status:502}); }
    }
    if (url.pathname === '/api/send' && req.method === 'POST') {
      if(req.headers.get('x-review-token')!==token)return new Response('Forbidden',{status:403});
      if(!rexSession)return Response.json({error:'Rex session is unavailable'},{status:503});
      try {
        const {blockId,message}=await req.json();
        if(typeof blockId!=='string'||typeof message!=='string'||!message.trim()||message.length>30000)return new Response('Invalid destination or message',{status:400});
        const listed=rexCommand(['block','ls','-s',rexSession,'--json']);
        if(listed.exitCode)return Response.json({error:listed.stderr.toString().trim()||'Could not verify pane'}, {status:502});
        const blocks=JSON.parse(listed.stdout.toString());
        const ids=new Set<string>();const visit=(v:any)=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){if(typeof(v.block_id||v.blockId)==='string')ids.add(v.block_id||v.blockId);Object.values(v).forEach(visit)}};visit(blocks);
        if(!ids.has(blockId))return new Response('Selected pane is not in the active Rex session',{status:403});
        const result=rexCommand(['send','-s',rexSession,'-b',blockId,message]);
        if(result.exitCode)return Response.json({error:result.stderr.toString().trim()||'Rex could not send to that pane'},{status:502});
        return Response.json({ok:true});
      } catch(error) { return Response.json({error:String(error)},{status:400}); }
    }
    if (url.pathname === '/') {
      const index = Bun.file(resolve(dist, 'index.html'));
      if(!index.size)return new Response('Build the frontend first with `npm run build`.', { status:503 });
      return new Response((await index.text()).replace('</head>',`<meta name="review-token" content="${token}"></head>`),{headers:{'content-type':'text/html; charset=utf-8'}});
    }
    if (url.pathname.startsWith('/assets/')) {
      const path = resolve(dist, url.pathname.slice(1));
      if (!path.startsWith(dist + sep)) return new Response('Not found', { status: 404 });
      const asset = Bun.file(path);
      return asset.size ? new Response(asset) : new Response('Not found', { status: 404 });
    }
    return new Response('Not found', { status: 404 });
  };
}

export function startServer(root = findRepository(), port = Number(process.env.PORT) || 4179): Server<unknown> {
  const token = crypto.randomUUID();
  const clients = new Set<ReadableStreamDefaultController>();
  let refreshTimer:ReturnType<typeof setTimeout>|undefined;
  const server = serve({ hostname: '127.0.0.1', port, fetch: createApp(root, token, undefined, clients) });
  const watcher = watch(root, { ignored: [/\/\.git\//, /\/node_modules\//], ignoreInitial: true }).on('all', () => { clearTimeout(refreshTimer); refreshTimer=setTimeout(() => { for (const c of clients) try { c.enqueue('data: update\n\n'); } catch { clients.delete(c); } }, 250); });
  const info = { root, port: server.port };
  const infoPath = resolve(tmpdir(), `rex-pierre-diffs-${process.pid}.json`);
  void Bun.write(infoPath, JSON.stringify(info));
  console.log(`[rex-pierre-diffs] listening at http://127.0.0.1:${server.port} (root ${root})`);
  process.on('SIGINT', () => { void watcher.close(); server.stop(); process.exit(); });
  process.on('SIGTERM', () => { void watcher.close(); server.stop(); process.exit(); });
  return server;
}

if (import.meta.main) startServer();
