(async () => {
 const wait = ms => new Promise(r=>setTimeout(r,ms));
 const start=performance.now();
 while (!document.querySelector('article diffs-container')?.shadowRoot?.querySelector('[data-line]')) {
   if (performance.now()-start>30000) throw Error('Diff readiness timeout'); await wait(50);
 }
 const readyMs=performance.now();
 const scroll=document.querySelector('.diff-content');
 if (!scroll || scroll.scrollHeight <= scroll.clientHeight) throw Error('No scrollable diff');
 const deltas=[]; let previous; const end=performance.now()+3000;
 await new Promise(resolve=> {const frame=t=> {if(previous!==undefined)deltas.push(t-previous); previous=t;
 scroll.scrollTop += 32; if(t<end)requestAnimationFrame(frame); else resolve();};requestAnimationFrame(frame);});
 const sorted=deltas.toSorted((a,b)=>a-b); const p=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];
 const separator=document.querySelector('[role=separator]'); if(!separator)throw Error('Sidebar keyboard target missing');
 const keyStart=performance.now(); separator.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return {userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
 navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),diffReadyFromTimeOriginMs:readyMs,
 scroll:{frames:deltas.length,fps:1000/(deltas.reduce((a,b)=>a+b,0)/deltas.length),rafIntervalP50Ms:p(.5),rafIntervalP95Ms:p(.95),intervalsOver25ms:deltas.filter(x=>x>25).length},
 syntheticKeyboardToTwoRafMs:performance.now()-keyStart,scrollHeight:scroll.scrollHeight,
 note:'Browser rAF cadence and synthetic DOM input only; not terminal presentation or physical input latency.'};
})()
