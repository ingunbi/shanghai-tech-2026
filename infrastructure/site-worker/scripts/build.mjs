import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',txt:'text/plain; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
const files={};
async function visit(dir,prefix='') {
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if(entry.isSymbolicLink() || entry.name.startsWith('.')) throw Error('Invalid fallback asset');
    const name=prefix+entry.name;
    if(entry.isDirectory()) await visit(path.join(dir,entry.name),name+'/');
    else {const bytes=await fs.readFile(path.join(dir,entry.name));files[name]={path:name,base64:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,contentType:mime[entry.name.split('.').pop()] || 'application/octet-stream'};}
  }
}
await visit(path.join(root,'public'));
const config=JSON.parse(await fs.readFile(path.join(root,'worker/fallback-version.json'),'utf8'));
if(!/^[a-f0-9]{40}$/.test(config.commit)) throw Error('Invalid fallback commit');
const generated=`export const fallbackCommit=${JSON.stringify(config.commit)};\nexport const fallbackFiles=${JSON.stringify(files)};\n`;
await fs.writeFile(path.join(root,'worker/fallback.generated.mjs'),generated);
const deployment=await fs.readFile(path.join(root,'worker/deployment.mjs'),'utf8');
const entry=await fs.readFile(path.join(root,'worker/index.mjs'),'utf8');
const bundle='const {handleDeployment,readActive}=(()=>{\n'+deployment.replace(/^export\s+/gm,'')+'\nreturn {handleDeployment,readActive};\n})();\n'+generated.replace(/^export\s+/gm,'')+'\n'+entry.replace(/^import .* from ['"].*['"];\s*$/gm,'');
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(path.join(out,'server'),{recursive:true});
await fs.mkdir(path.join(out,'.openai'),{recursive:true});
await fs.writeFile(path.join(out,'server/index.js'),bundle);
await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(out,'.openai/hosting.json'));
console.log(`Built Worker with ${Object.keys(files).length} fallback assets.`);
