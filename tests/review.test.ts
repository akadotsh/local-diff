import { expect, test } from 'bun:test';
import { reviewMessage, selectionContext } from '../src/shared/review';

test('formats selected added and removed patch lines into agent context',()=>{
  const patch='diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -3,2 +3,2 @@\n keep\n-old\n+new';
  const added=selectionContext(patch,{start:4,end:4,side:'additions'});
  expect(added.code).toBe('new'); expect(added.filename).toBe('src/a.ts');
  expect(selectionContext(patch,{start:3,end:4,side:'additions'}).code).toBe('keep\nnew');
  const deleted=selectionContext(patch,{start:4,end:4,side:'deletions'});
  expect(deleted.code).toBe('old'); expect(reviewMessage('/repo',{...deleted,filename:'/repo/src/a.ts'},'Why?')).toContain('File: src/a.ts');
  expect(reviewMessage('/repo',added,'Explain this')).toContain('Question: Explain this');
});

test('preserves selected source lines that resemble Git file headers',()=>{
  const patch='diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n--- old marker\n+++ new marker';
  expect(selectionContext(patch,{start:1,end:1,side:'deletions'}).code).toBe('-- old marker');
  expect(selectionContext(patch,{start:1,end:1,side:'additions'}).code).toBe('++ new marker');
});
