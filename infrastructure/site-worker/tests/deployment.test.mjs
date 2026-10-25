import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {handleDeployment,readActive} from '../worker/deployment.mjs';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const token='test-only-deployment-secret-with-adequate-length';
const sha=value=>createHash('sha256').update(value).digest('hex');

class MockBucket {
  objects=new Map();
  writes=[];
  serial=0;
  failKey=null;
  beforeActivePut=null;
  async get(key) {
    const entry=this.objects.get(key);
    if (!entry) return null;
    return {...entry,key,json:async()=>JSON.parse(entry.bytes.toString()),text:async()=>entry.bytes.toString(),arrayBuffer:async()=>entry.bytes};
  }
  async head(key) {
    const entry=this.objects.get(key);
    return entry ? {...entry,key} : null;
  }
  async put(key,value,options={}) {
    if (this.beforeActivePut && key==='active.json') {
      const hook=this.beforeActivePut;this.beforeActivePut=null;await hook();
    }
    if (this.failKey===key) throw Error('simulated provider error');
    const old=this.objects.get(key);
    const condition=options.onlyIf;
    if (condition instanceof Headers && condition.get('If-None-Match')==='*' && old) return null;
    if (condition?.etagMatches && old?.etag!==condition.etagMatches) return null;
    const bytes=typeof value==='string' ? Buffer.from(value) : Buffer.from(value);
    if (options.sha256) assert.equal(sha(bytes),options.sha256);
    const entry={bytes,size:bytes.length,etag:String(++this.serial),httpMetadata:options.httpMetadata || {},customMetadata:options.customMetadata || {}};
    this.writes.push(key);this.objects.set(key,entry);
    return {...entry,key};
  }
}

function snapshot(commit='a'.repeat(40),runNumber=1) {
  const contents={
    'index.html':'<!doctype html><html><body>Travel guide</body></html>',
    'data-public.js':'window.TRIP_DATA = {days: []};',
    'app-public.js':'console.log("travel");',
    'journey-map.js':'console.log("map");',
    'styles.css':'body { color: #123; }',
    'assets/picture.png':Buffer.from([137,80,78,71,13,10,26,10])
  };
  return {schemaVersion:1,repository:'ingunbi/shanghai-tech-2026',commit,runNumber,
    files:Object.entries(contents).map(([path,content])=>{const b=Buffer.from(content);return {path,base64:b.toString('base64'),sha256:sha(b)};})};
}
function env(bucket=new MockBucket()) {return {BUCKET:bucket,DEPLOY_TOKEN:token};}
function request(payload,authorization=`Bearer ${token}`,headers={}) {
  return new Request('https://example.test/__deploy',{method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization,...headers},body:JSON.stringify(payload)});
}
function replaceFile(payload,path,content) {
  const bytes=Buffer.from(content);
  payload.files=payload.files.filter(f=>f.path!==path);
  payload.files.push({path,base64:bytes.toString('base64'),sha256:sha(bytes)});
}

test('unauthorized requests do not read the body or write storage',async()=>{
  const e=env();let read=false;
  const r={url:'https://example.test/__deploy',method:'POST',headers:new Headers({Authorization:'Bearer incorrect','Content-Type':'application/json'}),
    get body(){read=true;throw Error('body must not be read');}};
  const response=await handleDeployment(r,e);
  assert.equal(response.status,401);assert.equal(e.BUCKET.writes.length,0);
  assert.equal(read,false);
  assert.equal(await readActive(e),null);
});

test('missing configuration does not accept uploads',async()=>{
  assert.equal((await handleDeployment(request(snapshot()),{BUCKET:new MockBucket()})).status,503);
  assert.equal((await handleDeployment(request(snapshot()),{DEPLOY_TOKEN:token})).status,503);
});

test('rejects traversal, hidden, reserved server, and unsupported private files before writes',async()=>{
  for (const path of ['../index.html','/index.html','.openai/hosting.json','assets/.secret.txt','worker/index.js','scripts/a.js','private/info.txt','manifest.json','a\\b.js','%2e%2e/a.js','file.pdf','assets/a.js?x']) {
    const e=env(),p=snapshot();replaceFile(p,path,'some text');
    const r=await handleDeployment(request(p),e);
    assert.equal(r.status,400,path);assert.equal(e.BUCKET.writes.length,0,path);
  }
});

test('rejects invalid payload repository, required files, duplicate files, hash, UTF8 and base64',async()=>{
  const invalid=[];
  const repo=snapshot();repo.repository='other/project';invalid.push(repo);
  const missing=snapshot();missing.files=missing.files.filter(f=>f.path!=='styles.css');invalid.push(missing);
  const duplicate=snapshot();duplicate.files.push({...duplicate.files[0]});invalid.push(duplicate);
  const hash=snapshot();hash.files[0].sha256='0'.repeat(64);invalid.push(hash);
  const utf8=snapshot();replaceFile(utf8,'bad.txt',Buffer.from([0xff,0xfe]));invalid.push(utf8);
  const base64=snapshot();base64.files[0].base64='not base64';invalid.push(base64);
  for (const p of invalid) {
    const e=env(),r=await handleDeployment(request(p),e);
    assert.equal(r.status,400);assert.equal(e.BUCKET.writes.length,0);
  }
});

test('blocks booking fields, credentials, encoded secrets, and unreviewed image metadata',async()=>{
  for (const [path,content] of [
    ['notes.txt','pnr: "ABC123"'],
    ['notes.txt','api_key: "abcdefghijklmnop"'],
    ['notes.txt','api_key%3A%20%22abcdefghijklmnop%22'],
    ['notes.txt','api_key&#58; &quot;abcdefghijklmnop&quot;'],
    ['assets/photo.jpg',Buffer.from('binary Exif\u0000\u0000 metadata')],
    ['assets/photo.png',Buffer.from('png eXIf metadata')]
  ]) {
    const e=env(),p=snapshot();replaceFile(p,path,content);
    const r=await handleDeployment(request(p),e);
    assert.equal(r.status,400,path);assert.equal(e.BUCKET.writes.length,0,path);
  }
});

test('checks declared and streamed request size limits before activation',async()=>{
  const e=env();
  assert.equal((await handleDeployment(request(snapshot(),undefined,{'Content-Length':String(12*1024*1024+1)}),e)).status,413);
  const huge=new Uint8Array(12*1024*1024+1);
  const stream=new ReadableStream({start(controller){controller.enqueue(huge);controller.close();}});
  const r=new Request('https://example.test/__deploy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:stream,duplex:'half'});
  assert.equal((await handleDeployment(r,e)).status,413);assert.equal(e.BUCKET.writes.length,0);
});

test('checks per-file and total decoded snapshot size limits',async()=>{
  for (const sizes of [[5*1024*1024+1],[4*1024*1024,4*1024*1024]]) {
    const e=env(),p=snapshot();
    sizes.forEach((size,i)=>replaceFile(p,`assets/large-${i}.jpg`,Buffer.alloc(size)));
    const r=await handleDeployment(request(p),e);
    assert.equal(r.status,413);assert.equal(e.BUCKET.writes.length,0);
  }
});

test('stores a complete immutable snapshot then atomically activates it',async()=>{
  const e=env(),p=snapshot(),r=await handleDeployment(request(p),e);
  assert.equal(r.status,200);const result=await r.json();assert.equal(result.ok,true);assert.equal(result.idempotent,false);
  assert.equal(e.BUCKET.writes.at(-1),'active.json');
  const active=await readActive(e);assert.equal(active.commit,p.commit);assert.equal(active.runNumber,1);assert.equal(active.files.length,p.files.length);
  for (const file of active.files) {
    const stored=await e.BUCKET.get(`releases/${p.commit}/${file.path}`);
    assert.equal(stored.customMetadata.sha256,file.sha256);assert.equal(stored.size,file.size);
  }
  const authGet=new Request('https://example.test/__deploy',{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await (await handleDeployment(authGet,e)).json()).active.commit,p.commit);
});

test('upload failure never moves the active release, and a matching partial upload can resume',async()=>{
  const e=env();await handleDeployment(request(snapshot()),e);
  const p=snapshot('b'.repeat(40),2);e.BUCKET.failKey=`releases/${p.commit}/journey-map.js`;
  const response=await handleDeployment(request(p),e);assert.equal(response.status,503);assert.equal((await readActive(e)).commit,'a'.repeat(40));
  e.BUCKET.failKey=null;
  assert.equal((await handleDeployment(request(p),e)).status,200);assert.equal((await readActive(e)).commit,p.commit);
});

test('same release retry is idempotent, and commit contents cannot be changed',async()=>{
  const e=env(),p=snapshot();await handleDeployment(request(p),e);
  const before=e.BUCKET.writes.length;
  const repeat=await handleDeployment(request(p),e);assert.equal((await repeat.json()).idempotent,true);assert.equal(e.BUCKET.writes.length,before);
  const changed=snapshot('a'.repeat(40),2);replaceFile(changed,'styles.css','body{color:red}');
  assert.equal((await handleDeployment(request(changed),e)).status,409);assert.equal(e.BUCKET.writes.length,before);
});

test('blocks old runs and different commits reusing a run number',async()=>{
  const e=env();await handleDeployment(request(snapshot('c'.repeat(40),3)),e);
  const writes=e.BUCKET.writes.length;
  assert.equal((await handleDeployment(request(snapshot('b'.repeat(40),2)),e)).status,409);
  assert.equal((await handleDeployment(request(snapshot('d'.repeat(40),3)),e)).status,409);
  assert.equal(e.BUCKET.writes.length,writes);assert.equal((await readActive(e)).commit,'c'.repeat(40));
});

test('conditional active pointer protects a newer concurrent release',async()=>{
  const e=env();await handleDeployment(request(snapshot('a'.repeat(40),1)),e);
  e.BUCKET.beforeActivePut=async()=>{
    const winner={...(await readActive(e)),commit:'c'.repeat(40),runNumber:3};
    await e.BUCKET.put('active.json',JSON.stringify(winner));
  };
  const r=await handleDeployment(request(snapshot('b'.repeat(40),2)),e);
  assert.equal(r.status,409);assert.equal((await readActive(e)).commit,'c'.repeat(40));
});

test('failed first activation does not create a partial active snapshot',async()=>{
  const e=env();e.BUCKET.failKey='active.json';
  assert.equal((await handleDeployment(request(snapshot()),e)).status,503);assert.equal(await readActive(e),null);
});
