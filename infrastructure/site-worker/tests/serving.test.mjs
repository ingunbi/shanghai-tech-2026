import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {fallbackCommit} from '../worker/fallback.generated.mjs';

const envFor=items=>({BUCKET:{async get(key){const value=items.get(key);if(!value)return null;const bytes=new TextEncoder().encode(value);return {json:async()=>JSON.parse(value),text:async()=>value,body:new Blob([bytes]).stream()};}},DEPLOY_TOKEN:'test-only-secret-token-long-enough-for-authentication'});
const request=(path,init)=>new Request('https://example.test'+path,init);

test('bootstrap preserves the site and pins script/style URLs to a snapshot',async()=>{
  const response=await worker.fetch(request('/'),envFor(new Map()));assert.equal(response.status,200);
  const html=await response.text();assert.match(html,/상하이/);assert(html.includes(`/__release/${fallbackCommit}/data-public.js`));assert(html.includes('href="#itinerary"'));
  const data=await worker.fetch(request(`/__release/${fallbackCommit}/data-public.js`),envFor(new Map()));assert.equal(data.status,200);assert((await data.text()).includes(`/__release/${fallbackCommit}/assets/`));
});
test('HEAD and conditional reads retain MIME and ETag without a response body',async()=>{
  const env=envFor(new Map()),response=await worker.fetch(request('/styles.css',{method:'HEAD'}),env);
  assert.equal(response.status,200);assert.equal(await response.text(),'');assert.match(response.headers.get('content-type'),/text\/css/);
  const cached=await worker.fetch(request('/styles.css',{headers:{'If-None-Match':response.headers.get('etag')}}),env);assert.equal(cached.status,304);
});
test('server files and unknown assets are never served',async()=>{
  const env=envFor(new Map());for(const path of ['/.git/config','/server/index.js','/missing.js','/__release/nope/data-public.js'])assert.equal((await worker.fetch(request(path),env)).status,404);
});
test('bootstrap remains usable when active storage cannot be read',async()=>{
  let calls=0;
  const env={BUCKET:{async get(){calls++;throw Error('private storage diagnostic');}}};
  const response=await worker.fetch(request('/'),env);assert.equal(response.status,200);assert((await response.text()).includes('상하이'));
  calls=0;const pinned=await worker.fetch(request(`/__release/${fallbackCommit}/styles.css`),env);assert.equal(pinned.status,200);assert.equal(calls,0);
  const missingBinding=await worker.fetch(request('/'),{});assert.equal(missingBinding.status,200);
});
test('activation serves the new snapshot while old pinned assets still work',async()=>{
  const commit='a'.repeat(40),files=[{path:'index.html',sha256:'b'.repeat(64),contentType:'text/html; charset=utf-8'},{path:'data-public.js',sha256:'c'.repeat(64),contentType:'text/javascript; charset=utf-8'}];
  const active={schemaVersion:1,commit,runNumber:1,activatedAt:'2026-10-25T00:00:00Z',files};
  const store=new Map([['active.json',JSON.stringify(active)],[`releases/${commit}/manifest.json`,JSON.stringify(active)],[`releases/${commit}/index.html`,'<script src="data-public.js"></script><h1>New snapshot</h1>'],[`releases/${commit}/data-public.js`,'window.TRIP_DATA={image:"assets/hero.jpg"};']]);
  const env=envFor(store),response=await worker.fetch(request('/'),env);assert.equal(response.status,200);const html=await response.text();assert(html.includes('New snapshot'));assert(html.includes(`/__release/${commit}/data-public.js`));
  assert.equal((await worker.fetch(request(`/__release/${fallbackCommit}/styles.css`),env)).status,200);
  const metadata=await worker.fetch(request('/__version'),env);assert.equal((await metadata.json()).commit,commit);
});
test('deployment endpoints require authentication without exposing its value',async()=>{
  const response=await worker.fetch(request('/__deploy',{method:'POST',body:'{}'}),envFor(new Map()));assert.equal(response.status,401);assert(!(await response.text()).includes('test-only-secret-token'));
});
