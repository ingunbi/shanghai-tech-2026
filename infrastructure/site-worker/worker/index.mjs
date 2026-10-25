import { handleDeployment, readActive } from './deployment.mjs';
import { fallbackFiles, fallbackCommit } from './fallback.generated.mjs';

const VERSION_PREFIX = '/__release/';
const manifests = new Map();
const MIME = { html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8', json:'application/json; charset=utf-8', svg:'image/svg+xml', txt:'text/plain; charset=utf-8', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', ico:'image/x-icon', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf' };
const plain = (message, status=404) => new Response(message, {status, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

function safePath(raw) {
  let value;
  try { value=decodeURIComponent(raw); } catch { return null; }
  if (value==='/' || value==='') return 'index.html';
  if (!value.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  const parts=value.slice(1).split('/');
  if (parts.some(part=>!part || part.startsWith('.') || ['server','scripts','private','bookings','passports'].includes(part.toLowerCase()))) return null;
  return parts.join('/');
}

function pinned(value, commit) {
  if (!value || /^(?:#|\/\/|[a-z][a-z\d+.-]*:)/i.test(value)) return value;
  const resolved=new URL(value,'https://snapshot.invalid/');
  const path=safePath(resolved.pathname);
  if (!path || path==='index.html' || path.startsWith('__')) return value;
  return `${VERSION_PREFIX}${commit}/${path}${resolved.search}${resolved.hash}`;
}

function rewriteText(text, path, commit) {
  if (path.endsWith('.html')) return text.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (match,key,quote,value)=>`${key}=${quote}${pinned(value,commit)}${quote}`);
  if (path==='data-public.js') return text.replace(/(["'])((?:assets|vendor)\/[^"'\s]+)\1/g, (match,quote,value)=>`${quote}${pinned(value,commit)}${quote}`);
  return text;
}

async function releaseInfo(env, commit, active) {
  if (commit===fallbackCommit) return {commit, files:fallbackFiles};
  if (active?.commit===commit) return {commit, files:active.files};
  const cached=manifests.get(commit);
  if (cached) return cached;
  const object=await env.BUCKET.get(`releases/${commit}/manifest.json`);
  if (!object) return null;
  const parsed=await object.json();
  if (parsed.commit!==commit || !Array.isArray(parsed.files)) return null;
  const result={commit,files:parsed.files};
  if (manifests.size>=8) manifests.delete(manifests.keys().next().value);
  manifests.set(commit,result);
  return result;
}

function fileInfo(release, path) {
  return Array.isArray(release.files) ? release.files.find(file=>file.path===path) : release.files[path];
}

async function serve(request, env) {
  const url=new URL(request.url);
  if (url.pathname==='/__deploy') return handleDeployment(request,env);
  if (!['GET','HEAD'].includes(request.method)) return plain('Method not allowed',405);
  let path,commit,versioned=false;
  if (url.pathname.startsWith(VERSION_PREFIX)) {
    const match=url.pathname.match(/^\/__release\/([a-f0-9]{40})(\/.*)$/);
    if (!match) return plain('Not found');
    commit=match[1];path=safePath(match[2]);versioned=true;
  } else path=safePath(url.pathname);
  if (!path) return plain('Not found');
  let active=null,storageUnavailable=!env.BUCKET;
  if (!(versioned && commit===fallbackCommit) && env.BUCKET) {
    try { active=await readActive(env); } catch { storageUnavailable=true; }
  }
  if (url.pathname==='/__version') return Response.json({commit:active?.commit || fallbackCommit, activatedAt:active?.activatedAt || null, fallback:!active, storageUnavailable}, {headers:{'Cache-Control':'no-store'}});
  if (!versioned) commit=active?.commit || fallbackCommit;
  if (versioned && commit!==fallbackCommit && storageUnavailable) return plain('Snapshot is temporarily unavailable',503);
  const release=await releaseInfo(env,commit,active);
  const info=release && fileInfo(release,path);
  if (!info) return plain('Not found');
  let body;
  if (commit===fallbackCommit) {
    const file=fallbackFiles[path];
    if (!file) return plain('Not found');
    body=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
  } else {
    const object=await env.BUCKET.get(`releases/${commit}/${path}`);
    if (!object) return plain('Snapshot is temporarily unavailable',503);
    body=object.body;
    if (path.endsWith('.html') || path==='data-public.js') body=rewriteText(await object.text(),path,commit);
  }
  if (commit===fallbackCommit && (path.endsWith('.html') || path==='data-public.js')) body=rewriteText(new TextDecoder().decode(body),path,commit);
  const headers=new Headers({'Content-Type':info.contentType || MIME[path.split('.').pop()] || 'application/octet-stream','Cache-Control':versioned?'public, max-age=31536000, immutable':'no-cache','ETag':`"${commit}-${info.sha256}"`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Site-Commit':commit});
  if (request.headers.get('If-None-Match')===headers.get('ETag')) return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:body,{headers});
}

export default {
  async fetch(request, env) {
    try { return await serve(request,env); }
    catch { return plain('The site is temporarily unavailable',503); }
  }
};
