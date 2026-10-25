import http from 'node:http';
import crypto from 'node:crypto';
import worker from '../worker/index.mjs';

const objects=new Map();
const bucket={
  async get(key) {
    const value=objects.get(key);if(!value)return null;
    const bytes=new Uint8Array(value.bytes);
    return {etag:value.etag,body:new Blob([bytes]).stream(),text:async()=>new TextDecoder().decode(bytes),json:async()=>JSON.parse(new TextDecoder().decode(bytes)),arrayBuffer:async()=>bytes.buffer};
  },
  async put(key,body,options={}) {
    const previous=objects.get(key),condition=options.onlyIf;
    const matches=condition instanceof Headers?condition.get('If-Match'):condition?.etagMatches;
    const notMatches=condition instanceof Headers?condition.get('If-None-Match'):condition?.etagDoesNotMatch;
    if(matches && previous?.etag!==matches)return null;
    if(notMatches==='*' && previous)return null;
    const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(await new Response(body).arrayBuffer());
    const etag=crypto.createHash('sha256').update(bytes).digest('hex');objects.set(key,{bytes,etag});return {etag};
  }
};
const server=http.createServer(async(req,res)=>{
  try {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request(`http://127.0.0.1:4173${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,{BUCKET:bucket,DEPLOY_TOKEN:'local-preview-only-deployment-token'});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(500);res.end('Preview error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Worker preview: http://127.0.0.1:4173'));
