import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [label,pidText]=process.argv.slice(2); const pid=Number(pidText);
if(!/^[a-z-]+$/.test(label)||!Number.isInteger(pid)||pid<=0)throw Error('Usage: node scripts/resources.mjs LABEL ROOT_PID');
const samples=[];
for(let i=0;i<20;i++){
 const rows=execFileSync('ps',['-axo','pid=,ppid=,%cpu=,rss=,comm='],{encoding:'utf8'}).trim().split('\n').map(row=>{const match=row.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);return match?{pid:+match[1],ppid:+match[2],cpuPercent:+match[3],rssKiB:+match[4],name:match[5].split('/').at(-1)}:null;}).filter(Boolean);
 const ids=new Set([pid]); let last; do{last=ids.size;for(const row of rows)if(ids.has(row.ppid))ids.add(row.pid);}while(last!==ids.size);
 const processes=rows.filter(row=>ids.has(row.pid));
 samples.push({at:Date.now(),cpuPercent:processes.reduce((s,r)=>s+r.cpuPercent,0),rssKiB:processes.reduce((s,r)=>s+r.rssKiB,0),processes});
 await new Promise(r=>setTimeout(r,250));
}
writeFileSync(`results/${label}-resources.json`,JSON.stringify({note:'ps CPU is a decaying average, not interval CPU; summed RSS double-counts shared pages. Descendant tree only, excludes terminal host.',samples},null,2));
