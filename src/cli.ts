#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const cwd=process.cwd();
if(process.argv.includes('--help')||process.argv.includes('-h')){console.log('rex-pierre-diffs — review local Git changes inside Rex\n\nUsage: rex-pierre-diffs\n\nRun inside a Git repository in a Rex terminal. Requires Bun, Rex, and terminal-browser.');process.exit(0)}
if(process.argv.length>2)throw new Error('Unknown option. Run rex-pierre-diffs --help.');
const repoResult=Bun.spawnSync(['git','rev-parse','--show-toplevel'],{cwd,stdout:'pipe',stderr:'pipe'});
if(repoResult.exitCode)throw new Error(`Run inside a Git repository: ${repoResult.stderr.toString().trim()}`);
const root=repoResult.stdout.toString().trim();
for(const [command,args] of [['rex',['whoami','--json']],['terminal-browser',['--version']]] as const){
  try{const check=Bun.spawnSync([command,...args],{stdout:'pipe',stderr:'pipe'});if(check.exitCode)throw new Error(check.stderr.toString().trim()||`exit ${check.exitCode}`)}catch(error){throw new Error(`Required command ${command} is unavailable: ${String(error)}`)}
}
const logPath=join(tmpdir(),`rex-pierre-diffs-server-${process.pid}.log`);
const log=await open(logPath,'a');
let info:any;
for(let port=4179;port<4200;port++){
  try { const response=await fetch(`http://127.0.0.1:${port}/api/diff`,{signal:AbortSignal.timeout(250)}); if(response.ok){const data=await response.json();if(data.app==='rex-pierre-diffs'&&data.root===root){info={port};break}} } catch {}
  const p=spawn('bun',['run',new URL('./server.ts',import.meta.url).pathname],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,PORT:String(port)}});p.unref();
  for(let i=0;i<100;i++){
    try{const infoPath=join(tmpdir(),`rex-pierre-diffs-${p.pid}.json`);info=await Bun.file(infoPath).json();await unlink(infoPath);break}catch{}
    if(p.exitCode!==null)break;
    await Bun.sleep(100);
  }
  if(info)break;
}
await log.close();
if(!info){const output=await readFile(logPath,'utf8').catch(()=>'(no server output)');throw new Error(`rex-pierre-diffs server did not become ready on ports 4179–4199. Log: ${logPath}\n${output.slice(-4000)}`)}
const args=['run','--split=right','--ratio','50','--label','rex-pierre-diffs','--focus=false','--keep-open','--cwd',root];
if(process.env.REX_SESSION)args.push('--session',process.env.REX_SESSION);
if(process.env.REX_BLOCK)args.push('--block',process.env.REX_BLOCK);
const result=Bun.spawnSync(['rex',...args,'--','terminal-browser','open',`http://127.0.0.1:${info.port}`],{stdio:['inherit','inherit','inherit']});
if(result.exitCode)throw new Error(`Rex failed to open the viewer (exit ${result.exitCode}). Check rex and terminal-browser; the server remains running at http://127.0.0.1:${info.port}. Log: ${logPath}`);
