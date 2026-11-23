import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
const run=promisify(execFile);
const pane=process.argv[2];
if(!pane)throw Error('Pass explicit RexWeb pane ID');
const code=await readFile('scripts/probe.js','utf8');
const results=[];
for(let i=0;i<3;i++){
 const t=performance.now();
 await run('rexweb',['reload','-b',pane]);
 const reloadRpcMs=performance.now()-t;
 const {stdout}=await run('rexweb',['eval','-b',pane,code],{timeout:45000,maxBuffer:1024*1024});
 results.push({reloadRpcMs,probe:JSON.parse(stdout)});
 await writeFile('results/rexweb.json',JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));
