import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
const run=promisify(execFile);
const [pane,label]=process.argv.slice(2);
if(!pane||!/^[a-z-]+$/.test(label))throw Error('Usage: node scripts/resize-rex.mjs PANE LABEL');
const samples=[];
for(let i=0;i<20;i++){
 const at=performance.now();const epoch=Date.now();
 await run('rex',['move','-s',process.env.REX_SESSION,pane,'right',process.env.REX_BLOCK,'--ratio',String(i%2?50:45)]);
 samples.push({epoch,layoutRpcMs:performance.now()-at});
 await new Promise(r=>setTimeout(r,350));
}
await writeFile(`results/${label}-split-resize.json`,JSON.stringify({note:'Rex layout RPC completion only. Not terminal frame presentation.',samples},null,2));
