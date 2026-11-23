import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const run=promisify(execFile);const results=[];
for(const method of ['close','term']){
 const log=resolve(`results/pixel-${method}.jsonl`);await writeFile(log, ""); const at=performance.now();
 const {stdout}=await run('rex',['run','-s',process.env.REX_SESSION,'-b',process.env.REX_BLOCK,'--split=right','--ratio','50','-c',process.cwd(),'--focus=false','--keep-open','--json','--','env',`RPD_PIXEL_LOG=${log}`,resolve('node_modules/.bin/pixel'),'dist/main.js','--','http://127.0.0.1:4189']);
 const pane=JSON.parse(stdout).block_ids[0];
 try{
 let loaded=false;for(let i=0;i<150;i++){try{loaded=(await readFile(log,'utf8')).includes('document-loaded');}catch{}if(loaded)break;await new Promise(r=>setTimeout(r,100));}
 if(!loaded)throw Error('Document did not load');
 const startupDocumentUpperBoundMs=performance.now()-at;
 const processInfo=JSON.parse((await run('rex',['block','call','-s',process.env.REX_SESSION,'-b',pane,'process'])).stdout);
 const result=await run(process.execPath,['scripts/lifecycle.mjs',pane,String(processInfo.child.pid),method]);
 results.push({method,startupDocumentUpperBoundMs,result:result.stdout});
 }finally{if(method!=='close')await run('rex',['block','close','-s',process.env.REX_SESSION,pane]);}
}
await writeFile('results/pixel-startup.json',JSON.stringify({note:'Warm host launch RPC through observed document load; 100 ms polling upper bound, excludes diff readiness.',samples:results},null,2));console.log(results);
