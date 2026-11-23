import {execFile}from'node:child_process';import{promisify}from'node:util';import{writeFile}from'node:fs/promises';
const run=promisify(execFile);const list=async()=>JSON.parse((await run('terminal-browser',['ls','--all','--json'])).stdout).browsers;
const existing=new Set((await list()).map(b=>b.key));const at=performance.now();
const opened=JSON.parse((await run('rex',['run','-s',process.env.REX_SESSION,'-b',process.env.REX_BLOCK,'--split=right','--ratio','50','--focus=false','--keep-open','--json','--','terminal-browser','open','http://127.0.0.1:4189','--no-merge'])).stdout);const pane=opened.block_ids[0];
try{
 let browser;
 for(let i=0;i<100;i++){browser=(await list()).find(b=>!existing.has(b.key)&&b.tabs.some(t=>t.url.startsWith('http://127.0.0.1:4189')&&t.title==='Rex Pierre Diffs'));if(browser)break;await new Promise(r=>setTimeout(r,100));}
 if(!browser)throw Error('Terminal Browser startup timeout');
 await writeFile('results/terminal-browser-startup.json',JSON.stringify({launchToTitleUpperBoundMs:performance.now()-at,note:'Warm installed runtime, daemon state uncontrolled; CLI polling upper bound to target title, not diff readiness.'},null,2));
 await run('rex',['send-key','-s',process.env.REX_SESSION,'-b',pane,'ctrl+0']);
 await run(process.execPath,['scripts/cdp-probe.mjs',String(browser.cdpPort),'terminal-browser'],{timeout:120000});
 await run(process.execPath,['scripts/resources.mjs','terminal-browser',String(browser.pid)]);
 await run(process.execPath,['scripts/resize-rex.mjs',pane,'terminal-browser']);
}finally{await run('rex',['block','close','-s',process.env.REX_SESSION,pane]);}
console.log('Terminal Browser benchmark complete');
