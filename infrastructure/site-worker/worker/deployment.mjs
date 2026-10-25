// Authenticated snapshot ingestion. Public files are immutable within a commit;
// active.json changes only after every validated asset has reached R2.
const DEPLOY_REPOSITORY = 'ingunbi/shanghai-tech-2026';
const DEPLOY_LIMITS = {body:12 * 1024 * 1024, total:8 * 1024 * 1024, file:5 * 1024 * 1024, count:300};
const DEPLOY_REQUIRED = ['index.html','data-public.js','app-public.js','journey-map.js','styles.css'];
const DEPLOY_MIME = {
  html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8',
  json:'application/json; charset=utf-8', geojson:'application/geo+json; charset=utf-8',
  svg:'image/svg+xml; charset=utf-8', txt:'text/plain; charset=utf-8', webmanifest:'application/manifest+json; charset=utf-8',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif',
  ico:'image/x-icon', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf'
};
const DEPLOY_TEXT = new Set(['html','css','js','json','geojson','svg','txt','webmanifest']);
const DEPLOY_BLOCKED_SEGMENTS = new Set(['private','notes-private','node_modules','bookings','passports','receipts','server','scripts','worker','tests']);
const DEPLOY_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/,
  /["']?(?:pnr|booking[_-]?(?:number|code|ref(?:erence)?|id)|reservation[_-]?(?:number|code|id)|confirmation[_-]?(?:number|code)|passport[_-]?(?:number|no)|passenger[_-]?name|traveler[_-]?name)["']?\s*[:=]\s*["']?\s*[A-Za-z0-9가-힣][^\n,;}]{2,}/i,
  /(?:예약\s*번호|여권\s*번호|항공사\s*예약\s*코드)\s*[:：=]\s*[A-Za-z0-9-]{5,}/i,
  /["']?(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{12,}["']/i
];

class DeploymentError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const deployFail = (status, code) => { throw new DeploymentError(status, code); };
const deployJSON = (body, status=200, more={}) => new Response(JSON.stringify(body), {
  status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...more}
});
const deployObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const deployHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
const deployHash = async bytes => deployHex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));

async function deploymentAuthorized(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const header = request.headers.get('Authorization') || '';
  if (header.length > 512) return false;
  const token = /^Bearer ([^\s]+)$/.exec(header)?.[1] || '';
  const encoder = new TextEncoder();
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(secret)),
    crypto.subtle.digest('SHA-256',encoder.encode(token))
  ]);
  const a = new Uint8Array(expected), b = new Uint8Array(supplied);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function deploymentBody(request) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    deployFail(415,'json_required');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) deployFail(400,'invalid_length');
  if (length !== null && Number(length) > DEPLOY_LIMITS.body) deployFail(413,'snapshot_too_large');
  if (!request.body) deployFail(400,'empty_snapshot');
  const reader = request.body.getReader(), chunks=[];
  let size=0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DEPLOY_LIMITS.body) {
        await reader.cancel();
        deployFail(413,'snapshot_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { deployFail(400,'invalid_json'); }
}

function deploymentPath(path) {
  if (typeof path !== 'string' || !path || path.length > 220 || path !== path.normalize('NFC') || /[\\\u0000-\u001f\u007f%?#:]/.test(path)) {
    deployFail(400,'invalid_file_path');
  }
  const segments = path.split('/');
  if (path === 'manifest.json') deployFail(400,'reserved_file_path');
  if (segments.some(part => !part || part.startsWith('.') || DEPLOY_BLOCKED_SEGMENTS.has(part.toLowerCase()))) {
    deployFail(400,'private_file_path');
  }
  const extension = /\.([a-z0-9]+)$/i.exec(segments.at(-1))?.[1].toLowerCase();
  if (!Object.hasOwn(DEPLOY_MIME,extension || '')) deployFail(400,'unsupported_file_type');
  return extension;
}

function deploymentDecodedText(text) {
  let decoded = text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (all,hex,decimal) => {
    const n = parseInt(hex || decimal,hex ? 16 : 10);
    return Number.isInteger(n) && n <= 0x10ffff && !(n>=0xd800 && n<=0xdfff) ? String.fromCodePoint(n) : all;
  }).replace(/&(?:quot|apos|colon|amp|lt|gt);/gi, entity => ({'&quot;':'"','&apos;':"'",'&colon;':':','&amp;':'&','&lt;':'<','&gt;':'>'}[entity.toLowerCase()]));
  for (let n=0;n<2;n++) { try { decoded=decodeURIComponent(decoded); } catch { break; } }
  return decoded;
}

function deploymentContainsBytes(bytes, sequence) {
  const target = new TextEncoder().encode(sequence);
  outer: for (let i=0;i<=bytes.length-target.length;i++) {
    if (bytes[i] !== target[0]) continue;
    for (let j=1;j<target.length;j++) if (bytes[i+j] !== target[j]) continue outer;
    return true;
  }
  return false;
}

async function validatedDeployment(payload) {
  if (!deployObject(payload) || payload.schemaVersion !== 1 || payload.repository !== DEPLOY_REPOSITORY ||
      !/^[a-f0-9]{40}$/.test(payload.commit || '') || !Number.isSafeInteger(payload.runNumber) || payload.runNumber < 0 ||
      !Array.isArray(payload.files) || !payload.files.length || payload.files.length > DEPLOY_LIMITS.count) {
    deployFail(400,'invalid_snapshot');
  }
  const seen = new Set(), files=[];
  let total=0;
  for (const entry of payload.files) {
    if (!deployObject(entry)) deployFail(400,'invalid_file');
    const extension = deploymentPath(entry.path);
    if (seen.has(entry.path)) deployFail(400,'duplicate_file');
    seen.add(entry.path);
    if (typeof entry.base64 !== 'string' || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      deployFail(400,'invalid_file_encoding');
    }
    if (entry.base64.length > Math.ceil(DEPLOY_LIMITS.file/3)*4) deployFail(413,'file_too_large');
    const firstPadding=entry.base64.indexOf('=');
    if (entry.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(entry.base64) ||
        (firstPadding !== -1 && (firstPadding < entry.base64.length-2 || !/^={1,2}$/.test(entry.base64.slice(firstPadding))))) {
      deployFail(400,'invalid_file_encoding');
    }
    let binary;
    try { binary=atob(entry.base64); } catch { deployFail(400,'invalid_file_encoding'); }
    if (btoa(binary) !== entry.base64) deployFail(400,'invalid_file_encoding');
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    if (bytes.byteLength > DEPLOY_LIMITS.file) deployFail(413,'file_too_large');
    total += bytes.byteLength;
    if (total > DEPLOY_LIMITS.total) deployFail(413,'snapshot_too_large');
    if (DEPLOY_REQUIRED.includes(entry.path) && !bytes.length) deployFail(400,'empty_required_file');
    if (await deployHash(bytes) !== entry.sha256) deployFail(400,'file_hash_mismatch');
    if (DEPLOY_TEXT.has(extension)) {
      let text;
      try { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { deployFail(400,'invalid_text_encoding'); }
      if (DEPLOY_SECRET_PATTERNS.some(pattern=>pattern.test(deploymentDecodedText(text)))) deployFail(400,'private_content');
    } else if (deploymentContainsBytes(bytes,'Exif\u0000\u0000') || deploymentContainsBytes(bytes,'<exif:GPS') ||
               (extension === 'png' && deploymentContainsBytes(bytes,'eXIf'))) deployFail(400,'image_metadata_review_required');
    files.push({path:entry.path,sha256:entry.sha256,size:bytes.byteLength,contentType:DEPLOY_MIME[extension],bytes});
  }
  if (DEPLOY_REQUIRED.some(path=>!seen.has(path))) deployFail(400,'required_file_missing');
  files.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {commit:payload.commit,runNumber:payload.runNumber,files,total};
}

const deploymentFileMetadata = files => files.map(({path,sha256,size,contentType})=>({path,sha256,size,contentType}));
const deploymentManifestIdentity = files => JSON.stringify(deploymentFileMetadata(files));

async function deploymentActiveObject(env) {
  const object = await env.BUCKET.get('active.json');
  if (!object) return {object:null,active:null};
  const active = await object.json();
  if (!deployObject(active) || active.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(active.commit || '') ||
      !Number.isSafeInteger(active.runNumber) || active.runNumber < 0 || !Array.isArray(active.files) ||
      active.files.some(file=>!deployObject(file) || typeof file.path !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256 || ''))) {
    throw new Error('Invalid active snapshot');
  }
  return {object,active};
}

export async function readActive(env) {
  if (!env.BUCKET) return null;
  return (await deploymentActiveObject(env)).active;
}

function deploymentCheckOrder(active, release) {
  if (!active) return;
  if (release.runNumber < active.runNumber || (release.runNumber === active.runNumber && release.commit !== active.commit)) {
    deployFail(409,'stale_deployment');
  }
  if (release.commit === active.commit && deploymentManifestIdentity(release.files) !== deploymentManifestIdentity(active.files)) {
    deployFail(409,'immutable_release_conflict');
  }
}

async function deploymentPutImmutable(bucket, key, value, options, metadata) {
  const result = await bucket.put(key,value,{...options,onlyIf:new Headers({'If-None-Match':'*'})});
  if (result) return;
  const existing = await bucket.head(key);
  if (!existing || existing.customMetadata?.sha256 !== metadata.sha256 || existing.size !== metadata.size) {
    deployFail(409,'immutable_release_conflict');
  }
}

async function storeDeployment(release, env) {
  const first = await deploymentActiveObject(env);
  deploymentCheckOrder(first.active,release);
  if (first.active?.commit === release.commit && first.active.runNumber === release.runNumber) {
    return {active:first.active,idempotent:true};
  }
  const prefix = `releases/${release.commit}/`;
  const manifest = {schemaVersion:1,commit:release.commit,files:deploymentFileMetadata(release.files)};
  const existingManifest = await env.BUCKET.get(prefix+'manifest.json');
  if (existingManifest) {
    const stored = await existingManifest.json();
    if (stored.commit !== release.commit || deploymentManifestIdentity(stored.files || []) !== deploymentManifestIdentity(release.files)) {
      deployFail(409,'immutable_release_conflict');
    }
  } else {
    for (const file of release.files) {
      await deploymentPutImmutable(env.BUCKET,prefix+file.path,file.bytes,{
        sha256:file.sha256,httpMetadata:{contentType:file.contentType,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{sha256:file.sha256}
      },file);
    }
    const manifestText=JSON.stringify(manifest), manifestBytes=new TextEncoder().encode(manifestText), manifestHash=await deployHash(manifestBytes);
    await deploymentPutImmutable(env.BUCKET,prefix+'manifest.json',manifestText,{
      sha256:manifestHash,httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{sha256:manifestHash}
    },{sha256:manifestHash,size:manifestBytes.byteLength});
  }
  // Re-read after the uploads so an older concurrent request cannot move the
  // active pointer back. Conditional put closes the remaining compare/write gap.
  const current = await deploymentActiveObject(env);
  deploymentCheckOrder(current.active,release);
  if (current.active?.commit === release.commit && current.active.runNumber === release.runNumber) {
    return {active:current.active,idempotent:true};
  }
  const active = {...manifest,runNumber:release.runNumber,activatedAt:new Date().toISOString()};
  const condition = current.object ? {etagMatches:current.object.etag} : new Headers({'If-None-Match':'*'});
  const updated = await env.BUCKET.put('active.json',JSON.stringify(active),{
    onlyIf:condition,httpMetadata:{contentType:'application/json',cacheControl:'no-store'}
  });
  if (!updated) {
    const winner = (await deploymentActiveObject(env)).active;
    if (winner?.commit === release.commit && winner.runNumber === release.runNumber &&
        deploymentManifestIdentity(winner.files) === deploymentManifestIdentity(release.files)) return {active:winner,idempotent:true};
    deployFail(409,'active_release_changed');
  }
  return {active,idempotent:false};
}

export async function handleDeployment(request, env) {
  if (new URL(request.url).pathname !== '/__deploy') return deployJSON({error:'not_found'},404);
  try {
    if (typeof env.DEPLOY_TOKEN !== 'string' || env.DEPLOY_TOKEN.length < 32) return deployJSON({error:'deployment_not_configured'},503);
    if (!await deploymentAuthorized(request,env.DEPLOY_TOKEN)) return deployJSON({error:'unauthorized'},401);
    if (!env.BUCKET) return deployJSON({error:'deployment_storage_unavailable'},503);
    if (request.method === 'GET') return deployJSON({active:await readActive(env)});
    if (request.method !== 'POST') return deployJSON({error:'method_not_allowed'},405,{Allow:'GET, POST'});
    const release = await validatedDeployment(await deploymentBody(request));
    const {active,idempotent} = await storeDeployment(release,env);
    return deployJSON({ok:true,commit:active.commit,runNumber:active.runNumber,activatedAt:active.activatedAt,fileCount:active.files.length,idempotent});
  } catch (error) {
    if (error instanceof DeploymentError) return deployJSON({error:error.code},error.status);
    // Do not return provider errors, request contents, or credentials.
    return deployJSON({error:'snapshot_storage_failed'},503);
  }
}
