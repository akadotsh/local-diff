export type DiffSelection = { start:number; end:number; side?:'additions'|'deletions'; endSide?:'additions'|'deletions' };

export function selectionContext(patch:string, selection:DiffSelection) {
  const fileLine=patch.split('\n').find(line=>line.startsWith('diff --git '))||'';
  const name=fileLine.match(/^diff --git a\/(.+) b\/(.+)$/);
  const filename=(name?.[2]||name?.[1]||'unknown').replaceAll('"','');
  let oldLine=0,newLine=0; const rows:{old:number;next:number;text:string;oldSide:boolean;newSide:boolean}[]=[];
  for(const line of patch.split('\n')) {
    const hunk=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[2]);continue}
    if(!oldLine&&!newLine)continue;
    if(line.startsWith('-')){rows.push({old:oldLine++,next:-1,text:line.slice(1),oldSide:true,newSide:false});continue}
    if(line.startsWith('+')){rows.push({old:-1,next:newLine++,text:line.slice(1),oldSide:false,newSide:true});continue}
    if(line.startsWith(' ')){rows.push({old:oldLine++,next:newLine++,text:line.slice(1),oldSide:true,newSide:true});continue}
    if(line.startsWith('\\'))continue;
    oldLine=0;newLine=0;
  }
  const side=selection.side==='deletions'?'old':'new';
  const lines=rows.filter(row=>{const lineNumber=side==='old'?row.old:row.next;return lineNumber>=selection.start&&lineNumber<=selection.end&&(side==='old'?row.oldSide:row.newSide)});
  return {filename,start:selection.start,end:selection.end,side,code:lines.map(line=>line.text).join('\n')};
}

export function reviewMessage(repo:string, context:ReturnType<typeof selectionContext>, question:string) {
  const filename=context.filename.startsWith(repo+'/')?context.filename.slice(repo.length+1):context.filename;
  return `Please review this selected code context.\nRepository: ${repo}\nFile: ${filename}\nLines: ${context.start}${context.end===context.start?'':`–${context.end}`} (${context.side} side)\n\n\`\`\`\n${context.code}\n\`\`\`${question.trim()?`\n\nQuestion: ${question.trim()}`:''}`;
}
