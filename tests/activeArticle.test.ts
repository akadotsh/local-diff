import assert from 'node:assert/strict';
import test from 'node:test';
import { activeArticle } from '../src/web/activeArticle.js';

test('tracks the active diff at boundaries without scanning every file', () => {
  let reads = 0;
  const articles = Array.from({ length: 1024 }, (_, index) => ({
    getBoundingClientRect() { reads++; return { top: index * 100 }; },
  })) as HTMLElement[];
  assert.equal(activeArticle([], 40), undefined);
  assert.equal(activeArticle(articles, -10), articles[0]);
  assert.equal(activeArticle(articles, 0), articles[0]);
  assert.equal(activeArticle(articles, 99), articles[0]);
  assert.equal(activeArticle(articles, 100), articles[1]);
  reads = 0;
  assert.equal(activeArticle(articles, 200000), articles[1023]);
  assert.ok(reads <= 11, `${reads} layout reads for 1024 files`);
});
