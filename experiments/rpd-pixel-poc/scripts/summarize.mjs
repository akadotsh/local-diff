import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`results/${name}.json`,'utf8'));
const quantile=(values,q)=>{const s=values.toSorted((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};
const summary={};
for(const name of ['rexweb','terminal-browser','chrome','pixel']){
 const probes=name==='pixel'?(await readFile('results/pixel-matched.jsonl','utf8')).trim().split('\n').map(JSON.parse).filter(r=>r.event==='browser-probe').map(r=>r.data):(await read(name)).map(r=>r.probe);
 summary[name]={runs:probes.length,viewport:probes[0].viewport,diffReadyMedianMs:quantile(probes.map(p=>p.diffReadyFromTimeOriginMs),.5),fpsMedian:quantile(probes.map(p=>p.scroll.fps),.5),rafP95MedianMs:quantile(probes.map(p=>p.scroll.rafIntervalP95Ms),.5),longIntervalsMedian:quantile(probes.map(p=>p.scroll.intervalsOver25ms),.5),syntheticKeyMedianMs:quantile(probes.map(p=>p.syntheticKeyboardToTwoRafMs),.5)};
 try{const resources=await read(name==='rexweb'?'rexweb-host-only-resources':`${name}-resources`);summary[name].resources={rssMedianMiB:quantile(resources.samples.map(s=>s.rssKiB/1024),.5),psCpuMedianPercent:quantile(resources.samples.map(s=>s.cpuPercent),.5),caveat:resources.note};}catch{}
 for(const suffix of ['layout-resize','split-resize'])try{const {samples}=await read(`${name}-${suffix}`);const key=suffix==='layout-resize'?'commandToTwoRafMs':'layoutRpcMs';summary[name][suffix]={n:samples.length,p50Ms:quantile(samples.map(s=>s[key]),.5),p95Ms:quantile(samples.map(s=>s[key]),.95)};}catch{}
}
const pixelEvents=(await readFile('results/pixel-matched.jsonl','utf8')).trim().split('\n').map(JSON.parse);const resize=pixelEvents.filter(r=>r.event==='resize-to-browser-two-raf').map(r=>r.data.ms);summary.pixel.hostResizeToBrowserTwoRaf={n:resize.length,p50Ms:quantile(resize,.5),p95Ms:quantile(resize,.95)};
const nativeResize=await read('rexweb-browser-resize');summary.rexweb.browserResizeToTwoRaf={n:nativeResize.length,valuesMs:nativeResize.map(r=>r.eventToTwoRafMs),note:'Only two coalesced browser resize events from 20 split requests; no meaningful p95.'};
await writeFile('results/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
