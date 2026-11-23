import {test} from 'node:test'; import assert from 'node:assert/strict'; import {viewerURL} from '../dist/url.js';
test('only local viewer URLs',()=>{assert.equal(viewerURL('http://127.0.0.1:4189'),'http://127.0.0.1:4189/'); for(const value of [undefined,'file:///tmp/a','https://example.com','http://evil.example','http://user@localhost']) assert.throws(()=>viewerURL(value));});
