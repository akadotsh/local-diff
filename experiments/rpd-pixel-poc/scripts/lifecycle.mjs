import {execFile} from 'node:child_process'; import {promisify} from 'node:util'; import {writeFile} from 'node:fs/promises';
const run=promisify(execFile);const [pane,pidText,method='quit']=process.argv.slice(2);const pid=Number(pidText);
if(!pane||!pid||!['quit','close','term'].includes(method))throw Error('Usage: node scripts/lifecycle.mjs PANE ROOT_PID [quit|close|term]');
const ps=async()=> (await run('ps',['-axo','pid=,ppid='])).stdout.trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
const before=await ps();const owned=new Set([pid]);let previous;do{previous=owned.size;for(const [id,parent]of before)if(owned.has(parent))owned.add(id);}while(previous!==owned.size);
const at=performance.now();
if(method==='term')process.kill(pid,'SIGTERM');else if(method==='close')await run('rex',['block','close','-s',process.env.REX_SESSION,pane]);else await run('rex',['send-key','-s',process.env.REX_SESSION,'-b',pane,'ctrl+q']);
let remaining=[];
for(let i=0;i<50;i++){const live=new Set((await ps()).map(r=>r[0]));remaining=[...owned].filter(id=>live.has(id));if(!remaining.length)break;await new Promise(r=>setTimeout(r,100));}
const result={method,pid,ownedPids:[...owned],remainingPids:remaining,elapsedMs:performance.now()-at,passed:!remaining.length};
await writeFile(`results/pixel-lifecycle-${method}.json`,JSON.stringify(result,null,2));console.log(result);if(remaining.length)process.exitCode=1;
