import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile,writeFile} from 'node:fs/promises';
const run=promisify(execFile);const at=performance.now();
const {stdout}=await run('rexweb',['open','http://127.0.0.1:4189','-s',process.env.REX_SESSION,'-b',process.env.REX_BLOCK,'--split=right','--ratio','50','--focus=false','--json']);
const pane=JSON.parse(stdout).id;
await writeFile('results/rexweb-startup.json',JSON.stringify({openToDocumentRpcMs:performance.now()-at,note:'Warm shared RexWeb app; open waits for document load, not diff readiness or presentation.'},null,2));
try{
 await run(process.execPath,['scripts/rexweb-probe.mjs',pane],{timeout:120000});
 await run('rexweb',['eval','-b',pane,`window.pocResize=[]; addEventListener('resize',()=>{const at=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.pocResize.push({eventToTwoRafMs:performance.now()-at,width:innerWidth,height:innerHeight})));}); return true`]);
 await run(process.execPath,['scripts/resize-rex.mjs',pane,'rexweb'],{timeout:60000});
 const result=await run('rexweb',['eval','-b',pane,'window.pocResize']);
 await writeFile('results/rexweb-browser-resize.json',result.stdout);
 // Only the app host; WebKit XPC children have PPID 1, so full process-tree attribution is unavailable.
 const host=(await run('pgrep',['-f','/RexWeb.app/Contents/MacOS/RexWeb$'])).stdout.trim().split('\n')[0];
 if(host)await run(process.execPath,['scripts/resources.mjs','rexweb-host-only',host]);
}finally{await run('rexweb',['close','-b',pane]);}
console.log('RexWeb benchmark complete');
