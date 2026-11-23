import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const run=promisify(execFile);const at=performance.now();
const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[`--user-data-dir=${resolve('chrome-profile')}`,'--remote-debugging-port=9238','--no-first-run','--no-default-browser-check','--window-size=1171,1430','http://127.0.0.1:4189'],{stdio:'ignore'});
try{
 let ready=false;
 for(let i=0;i<150;i++){
  try{const pages=await fetch('http://127.0.0.1:9238/json/list').then(r=>r.json());ready=pages.some(p=>p.url.startsWith('http://127.0.0.1:4189')&&p.title==='Rex Pierre Diffs');}catch{}
  if(ready)break;await new Promise(r=>setTimeout(r,100));
 }
 if(!ready)throw Error('Chrome startup timeout');
 await writeFile('results/chrome-startup.json',JSON.stringify({launchToTitleUpperBoundMs:performance.now()-at,note:'Warm profile, target title observed by polling; not diff readiness or presentation.'},null,2));
 await run(process.execPath,['scripts/cdp-probe.mjs','9238','chrome'],{timeout:120000});
 await run(process.execPath,['scripts/resources.mjs','chrome',String(child.pid)]);
}finally{
 try{const b=await fetch('http://127.0.0.1:9238/json/version').then(r=>r.json());const socket=new WebSocket(b.webSocketDebuggerUrl);await new Promise(r=>{socket.onopen=()=>socket.send(JSON.stringify({id:1,method:'Browser.close'}));socket.onclose=r;setTimeout(r,2000);});}catch{child.kill('SIGTERM');}
}
console.log('Chrome benchmark complete');
