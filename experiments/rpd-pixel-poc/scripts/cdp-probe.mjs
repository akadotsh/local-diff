import {readFile,writeFile} from 'node:fs/promises';
const [port,label]=process.argv.slice(2);
if(!port||!label||!/^[a-z-]+$/.test(label))throw Error('Usage: node scripts/cdp-probe.mjs PORT LABEL');
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const target=targets.find(t=>t.url.startsWith('http://127.0.0.1:4189'));
if(!target)throw Error('Fixture page not found');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0; const waiting=new Map();
socket.onmessage=e=>{const r=JSON.parse(e.data); if(waiting.has(r.id)){const {resolve,reject,timer}=waiting.get(r.id);clearTimeout(timer);waiting.delete(r.id);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{waiting.delete(key);reject(Error('CDP timeout: '+method));},45000); waiting.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));});
try {
 await call('Emulation.setDeviceMetricsOverride',{width:1155,height:1344,deviceScaleFactor:1,mobile:false});
 const results=[]; const expression=await readFile('scripts/probe.js','utf8');
 for(let i=0;i<3;i++){
  const started=performance.now(); await call('Page.reload',{ignoreCache:false});
  // Wait for the new document, rather than evaluating into the outgoing context.
  await new Promise(r=>setTimeout(r,500));
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  results.push({reloadToProbeCompleteMs:performance.now()-started,probe:result.result.value});
  await writeFile(`results/${label}.json`,JSON.stringify(results,null,2));
 }
 const resize=[];
 for(let i=0;i<20;i++){
   const at=performance.now();
   await call('Emulation.setDeviceMetricsOverride',{width:i%2?1155:1055,height:1344,deviceScaleFactor:1,mobile:false});
   const result=await call('Runtime.evaluate',{expression:'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r({width:innerWidth,height:innerHeight}))))',awaitPromise:true,returnByValue:true});
   resize.push({commandToTwoRafMs:performance.now()-at,viewport:result.result.value});
 }
 await writeFile(`results/${label}-layout-resize.json`,JSON.stringify({note:'CDP viewport emulation to two browser animation callbacks; includes RPC overhead, excludes terminal resize and display presentation.',samples:resize},null,2));
 console.log(label+' probes saved');
} finally {socket.close();}
