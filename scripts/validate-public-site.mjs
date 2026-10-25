#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const LIMITS = Object.freeze({ body: 12 * 1024 ** 2, total: 8 * 1024 ** 2, file: 5 * 1024 ** 2, files: 300 });
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set(['.html', '.css', '.js', '.json', '.geojson', '.svg', '.txt', '.webmanifest', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf']);
const TEXT = new Set(['.html', '.css', '.js', '.json', '.geojson', '.svg', '.txt', '.webmanifest']);
const FORBIDDEN = new Set(['private', 'notes-private', 'node_modules', 'bookings', 'passports', 'receipts', 'server', 'scripts']);
const REQUIRED = ['index.html', 'data-public.js', 'app-public.js', 'journey-map.js', 'styles.css'];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/,
  /["']?(?:pnr|booking[_-]?(?:number|code|ref(?:erence)?|id)|reservation[_-]?(?:number|code|id)|confirmation[_-]?(?:number|code)|passport[_-]?(?:number|no)|passenger[_-]?name|traveler[_-]?name)["']?\s*[:=]\s*["']?\s*[A-Za-z0-9가-힣][^\n,;}]{2,}/i,
  /(?:예약\s*번호|여권\s*번호|항공사\s*예약\s*코드)\s*[:：=]\s*[A-Za-z0-9-]{5,}/i,
  /["']?(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{12,}["']/i,
];

function fail(message) { throw new Error(message); }
function decodeText(text) {
  let decoded = text;
  try { decoded = decodeURIComponent(decoded); } catch { /* Scan malformed encoded text as-is too. */ }
  return decoded.replace(/&(?:quot|apos|amp|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const named = { '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const value = entity.slice(2, -1);
    const point = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : parseInt(value, 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

export function validatePath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || path.startsWith('/') || /[\\\u0000-\u001f\u007f%?#]/.test(path)) fail('Invalid public file path.');
  const segments = path.split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || part.startsWith('.') || FORBIDDEN.has(part.toLowerCase()))) fail(`Forbidden public file path: ${path}`);
  if (!ALLOWED.has(extname(path).toLowerCase())) fail(`Unsupported public file type: ${path}`);
}

export function scanPublicText(text, label) {
  if (SECRET_PATTERNS.some(pattern => pattern.test(decodeText(text)))) fail(`Privacy check blocked ${label}; inspect it locally without posting matching content.`);
}

function localReference(ref, from) {
  const decoded = decodeText(ref).trim();
  if (!decoded || decoded.startsWith('#') || decoded.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(decoded)) return null;
  const base = new URL(from, 'https://local.invalid/');
  const target = new URL(decoded, base);
  if (target.origin !== base.origin) return null;
  try { return decodeURIComponent(target.pathname).replace(/^\//, ''); } catch { fail(`Invalid local reference in ${from}`); }
}

function validateReferences(files, texts, data) {
  const names = new Set(files.map(file => file.path));
  const ensure = (ref, from) => {
    const target = localReference(ref, from);
    if (target !== null && !names.has(target)) fail(`Missing local asset referenced by ${from}: ${target}`);
  };
  for (const [path, text] of texts) {
    if (extname(path) === '.html') {
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) ensure(match[1], path);
    } else if (extname(path) === '.css') {
      for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) ensure(match[1], path);
    }
  }
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && /^(?:image|heroImage|icon|thumbnail)$/i.test(key)) ensure(child, 'index.html');
      else visit(child);
    }
  };
  visit(data);
}

function validateTripData(source) {
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 1000, filename: 'data-public.js', contextCodeGeneration: { strings: false, wasm: false } });
  const data = context.window.TRIP_DATA;
  if (!data || !Array.isArray(data.days) || !data.days.length) fail('TRIP_DATA.days is missing.');
  const dates = data.days.map(day => day.date);
  if (new Set(dates).size !== dates.length || dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) fail('Travel dates must be unique ISO dates.');
  const points = data.journeyMap?.places;
  const routes = data.journeyMap?.days;
  if (!Array.isArray(points) || !Array.isArray(routes)) fail('Journey map data is missing.');
  const ids = new Set(points.map(point => point.id));
  if (ids.size !== points.length) fail('Journey map place IDs are duplicated.');
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 85 || Math.abs(point.lng) > 180) fail(`Invalid map coordinates for ${point.id}`);
  }
  for (const route of routes) {
    if (!dates.includes(route.date) || !Array.isArray(route.placeIds) || route.placeIds.some(id => !ids.has(id))) fail(`Invalid map route for ${route.date}`);
  }
  if (new Set(routes.map(route => route.date)).size !== routes.length || dates.some(date => !routes.some(route => route.date === date))) fail('Each travel date needs one matching map route.');
  for (const place of data.videoGuide?.places || []) {
    if (place.mapPlaceId && !ids.has(place.mapPlaceId)) fail(`Unknown map place for video candidate ${place.id}`);
    if (place.includedDate && !routes.find(route => route.date === place.includedDate)?.placeIds.includes(place.mapPlaceId)) fail(`Video candidate date and map disagree for ${place.id}`);
  }
  const experiences = new Set((data.experiences || []).map(item => item.id));
  for (const day of data.days) {
    if (!Array.isArray(day.stops)) fail(`Missing stops for ${day.date}`);
    for (const stop of day.stops) if (stop.accessId && !experiences.has(stop.accessId)) fail(`Unknown experience for ${day.date}`);
  }
  scanPublicText(JSON.stringify(data), 'evaluated travel data');
  return data;
}

export async function collectPublicSnapshot(dist = resolve(PROJECT, 'dist')) {
  const root = resolve(dist);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail('dist must be a regular directory.');
  const files = [];
  const texts = new Map();
  let total = 0;
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = resolve(directory, name), path = relative(root, absolute).split(sep).join('/');
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) fail(`Symlinks are not allowed: ${path}`);
      if (info.isDirectory()) {
        if (name.startsWith('.') || FORBIDDEN.has(name.toLowerCase())) fail(`Forbidden public directory: ${path}`);
        await walk(absolute);
        continue;
      }
      if (!info.isFile()) fail(`Only regular files may be published: ${path}`);
      validatePath(path);
      if (info.size > LIMITS.file || total + info.size > LIMITS.total || files.length >= LIMITS.files) fail('Public snapshot exceeds its deployment size limits.');
      const bytes = await readFile(absolute);
      total += bytes.length;
      const extension = extname(path).toLowerCase();
      if (TEXT.has(extension)) {
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`Public text must be UTF-8: ${path}`); }
        scanPublicText(text, path);
        texts.set(path, text);
        if (extension === '.js') {
          const check = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8' });
          if (check.status !== 0) fail(`JavaScript syntax check failed: ${path}`);
        }
      } else if (bytes.includes(Buffer.from('Exif\0\0')) || bytes.includes(Buffer.from('<exif:GPS')) || (extension === '.png' && bytes.includes(Buffer.from('eXIf')))) {
        fail(`Image metadata needs review before deployment: ${path}`);
      }
      files.push({ path, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await walk(root);
  for (const path of REQUIRED) if (!files.some(file => file.path === path)) fail(`Required public file is missing: ${path}`);
  const data = validateTripData(texts.get('data-public.js'));
  validateReferences(files, texts, data);
  return { files, totalBytes: total, travelDays: data.days.length, includedVideoPlaces: (data.videoGuide?.places || []).filter(place => place.includedDate).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) fail('Usage: node scripts/validate-public-site.mjs [dist-directory]');
    const snapshot = await collectPublicSnapshot(process.argv[2]);
    console.log(`Public site validated: ${snapshot.files.length} files, ${snapshot.totalBytes} bytes, ${snapshot.travelDays} travel days.`);
  } catch (error) {
    console.error(`Public validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
