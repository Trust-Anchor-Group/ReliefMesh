import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {neuroElicitationProxy,publicElicitationUrl} from '../src/elicitation.js';

const routing={publicOrigin:'https://reliefmesh.example',ports:{A:52482,B:52483}};

test('Actor A localhost elicitation becomes the public coordinator URL',()=>{
  assert.equal(publicElicitationUrl('A','http://localhost:52482/MCP/coordinator-token',routing),'https://reliefmesh.example/neuro/coordinator/MCP/coordinator-token');
});
test('Actor B localhost elicitation becomes the public volunteer URL',()=>{
  assert.equal(publicElicitationUrl('B','http://localhost:52483/MCP/volunteer-token',routing),'https://reliefmesh.example/neuro/volunteer/MCP/volunteer-token');
});
test('Opaque path bytes remain unchanged',()=>{
  const opaque='a%2Fb%2Bc%3Dd._~-';
  assert.equal(publicElicitationUrl('B','http://127.0.0.1:52483/MCP/'+opaque,routing),'https://reliefmesh.example/neuro/volunteer/MCP/'+opaque);
});
test('Query bytes remain unchanged',()=>{
  const query='?first=a%2Fb&second=x+y&empty=';
  assert.equal(publicElicitationUrl('B','http://localhost:52483/MCP/token'+query,routing),'https://reliefmesh.example/neuro/volunteer/MCP/token'+query);
});
test('Normalized URLs contain no localhost host',()=>{
  assert.doesNotMatch(publicElicitationUrl('A','http://localhost:52482/MCP/token',routing)!,/localhost/i);
});
test('Normalized URLs contain no loopback address',()=>{
  assert.doesNotMatch(publicElicitationUrl('B','http://127.0.0.1:52483/MCP/token',routing)!,/127\.0\.0\.1/);
});
test('Normalized URLs do not expose the coordinator port',()=>{
  assert.doesNotMatch(publicElicitationUrl('A','http://localhost:52482/MCP/token',routing)!,/:52482/);
});
test('Normalized URLs do not expose the volunteer port',()=>{
  assert.doesNotMatch(publicElicitationUrl('B','http://localhost:52483/MCP/token',routing)!,/:52483/);
});
test('Unsupported and cross-actor URLs are not rewritten',()=>{
  assert.equal(publicElicitationUrl('B','https://untrusted.example/MCP/token',routing),undefined);
  assert.equal(publicElicitationUrl('B','http://localhost:52482/MCP/token',routing),undefined);
  assert.equal(publicElicitationUrl('B','http://localhost:52483/not-mcp/token',routing),undefined);
});

type Received={
  actor:'A'|'B';method?:string;url?:string;body:string;bodyHex:string;
  host?:string;origin?:string;referer?:string;contentType?:string;contentLength?:string;
};
const shape=({actor,method,url,body}:Received)=>({actor,method,url,body});
async function listen(server:Server){
  await new Promise<void>((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  return (server.address() as {port:number}).port;
}
async function close(server:Server){await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
async function withProxy(run:(base:string,received:Received[],ports:{A:number;B:number})=>Promise<void>){
  const received:Received[]=[];
  const actorServer=(actor:'A'|'B')=>createServer((request,response)=>{
    const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
      const body=Buffer.concat(chunks);
      received.push({actor,method:request.method,url:request.url,body:body.toString(),bodyHex:body.toString('hex'),
        host:request.headers.host,origin:request.headers.origin,referer:request.headers.referer,
        contentType:request.headers['content-type'],contentLength:request.headers['content-length']});
      if(request.method==='GET'){
        const privateAction='http://'+request.headers.host+request.url;
        response.setHeader('Content-Type','text/html');response.end(`<form action="${privateAction}" method="post">${actor}</form>`);
      }else{response.setHeader('Content-Type','text/plain');response.end(actor);}
    });
  });
  const actorA=actorServer('A'),actorB=actorServer('B');
  const portA=await listen(actorA),portB=await listen(actorB);
  const app=express();
  const proxy=createServer(app),proxyPort=await listen(proxy);
  const base='http://127.0.0.1:'+proxyPort;
  app.use(neuroElicitationProxy({publicOrigin:base,ports:{A:portA,B:portB}}));
  app.use((_request,response)=>response.sendStatus(404));
  try{await run(base,received,{A:portA,B:portB});}finally{await close(proxy);await close(actorA);await close(actorB);}
}

test('Public form GET reaches the correct private actor',()=>withProxy(async(base,received)=>{
  const response=await fetch(base+'/neuro/volunteer/MCP/token%2Bvalue?view=a%2Fb',{headers:{Origin:base}});
  assert.equal(response.status,200);
  assert.equal(await response.text(),`<form action="${base}/neuro/volunteer/MCP/token%2Bvalue?view=a%2Fb" method="post">B</form>`);
  assert.deepEqual(received.map(shape),[{actor:'B',method:'GET',url:'/MCP/token%2Bvalue?view=a%2Fb',body:''}]);
}));
test('Public form POST reaches the same actor and exact path',()=>withProxy(async(base,received)=>{
  const response=await fetch(base+'/neuro/volunteer/MCP/token?step=1',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:'choice=accept'});
  assert.equal(await response.text(),'B');
  assert.deepEqual(received.map(shape),[{actor:'B',method:'POST',url:'/MCP/token?step=1',body:'choice=accept'}]);
}));
test('Sandboxed browser form POST with a null origin reaches the private actor',()=>withProxy(async(base,received,ports)=>{
  const response=await fetch(base+'/neuro/volunteer/MCP/token',{method:'POST',headers:{Origin:'null','Content-Type':'application/x-www-form-urlencoded'},body:'choice=accept'});
  assert.equal(response.status,200);
  assert.deepEqual(received.map(shape),[{actor:'B',method:'POST',url:'/MCP/token',body:'choice=accept'}]);
  assert.equal(received[0].host,'localhost:'+ports.B);
  assert.equal(received[0].origin,'http://localhost:'+ports.B);
}));
test('Foreign form origins are rejected before reaching either actor',()=>withProxy(async(base,received)=>{
  const response=await fetch(base+'/neuro/volunteer/MCP/token',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/x-www-form-urlencoded'},body:'choice=accept'});
  assert.equal(response.status,403);
  assert.deepEqual(received,[]);
}));
test('Waher form POST semantics are preserved and scoped to Actor B',()=>withProxy(async(base,received,ports)=>{
  const path='/MCP/a%2Fb%2Bc%3Dd._~-?first=a%2Fb&second=x+y&empty=';
  const publicPath='/neuro/volunteer'+path;
  const contentType='multipart/form-data; boundary=ReliefMeshBoundary';
  const body=Buffer.from('--ReliefMeshBoundary\r\nContent-Disposition: form-data; name="_r_"\r\n\r\ntrue\r\n--ReliefMeshBoundary--\r\n');
  const response=await fetch(base+publicPath,{method:'POST',headers:{Origin:base,Referer:base+publicPath,'Content-Type':contentType},body});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'B');
  assert.equal(received.length,1);
  const request=received[0];
  assert.equal(request.actor,'B');
  assert.equal(request.method,'POST');
  assert.equal(request.url,path);
  assert.equal(request.bodyHex,body.toString('hex'));
  assert.equal(request.contentType,contentType);
  assert.equal(request.contentLength,String(body.length));
  assert.equal(request.host,'localhost:'+ports.B);
  assert.equal(request.origin,'http://localhost:'+ports.B);
  assert.equal(request.referer,'http://localhost:'+ports.B+path);
}));
test('Coordinator and volunteer public routes cannot cross-route',()=>withProxy(async(base,received)=>{
  assert.equal(await (await fetch(base+'/neuro/coordinator/MCP/a',{headers:{Origin:base}})).text(),`<form action="${base}/neuro/coordinator/MCP/a" method="post">A</form>`);
  assert.equal(await (await fetch(base+'/neuro/volunteer/MCP/b',{headers:{Origin:base}})).text(),`<form action="${base}/neuro/volunteer/MCP/b" method="post">B</form>`);
  assert.deepEqual(received.map(value=>value.actor),['A','B']);
  assert.match(received[0].host!,/^localhost:\d+$/);
  assert.match(received[1].host!,/^localhost:\d+$/);
  assert.notEqual(received[0].host,received[1].host);
  assert.equal((await fetch(base+'/neuro/volunteer/not-mcp',{headers:{Origin:base}})).status,404);
}));
test('Deployment does not publish internal Neuro ports',async()=>{
  const service=await readFile(new URL('../deploy/reliefmesh.service',import.meta.url),'utf8');
  const dockerfile=await readFile(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.doesNotMatch(service,/-p\s+[^\r\n]*(?:52482|52483)/);
  assert.doesNotMatch(dockerfile,/EXPOSE[^\r\n]*(?:52482|52483)/);
});