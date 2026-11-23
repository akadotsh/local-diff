import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const dir = resolve(process.argv[2] || 'fixtures/review');
await mkdir(dir, {recursive:true});
const git = (...args) => execFileSync('git', args, {cwd:dir});
try { git('rev-parse', '--git-dir'); throw Error('Fixture destination already contains a repository'); }
catch (e) { if (!e.status) throw e; }
git('init','-q');
const content = (n, changed) => Array.from({length:n}, (_,i) => `export const item${i} = ${i + (changed && i % 7 === 0 ? 1 : 0)};`).join('\n')+'\n';
for (const [name,n] of [['small.ts',100],['large.ts',20000]]) await writeFile(resolve(dir,name),content(n,false));
git('add','.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline');
for (const [name,n] of [['small.ts',100],['large.ts',20000]]) await writeFile(resolve(dir,name),content(n,true));
console.log(dir);
