import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import type { ElicitRequestParams, ElicitResult } from '@modelcontextprotocol/client';
import { NeuroActor, type ActorId } from './actor.js';
import { neuroResult } from './result.js';

const app = express();
const port = 4317;
const origin = 'http://localhost:' + port;
const ajv = new Ajv({strict:false});
const events: Record<string,unknown>[] = [];
const streams = new Set<express.Response>();
type Pending = {id:string; actor:ActorId; params:ElicitRequestParams; resolve:(result:ElicitResult)=>void};
const pending = new Map<string,Pending>();
const readiness: Record<ActorId,string> = {A:'Not checked',B:'Not checked'};
type Onboarding = { credentialsConfirmed?:boolean; stage?:string; legalId?:string; identityState?:string };
await mkdir('.runtime',{recursive:true});
let onboarding: Onboarding = {};
try { onboarding=JSON.parse(await readFile('.runtime/onboarding-B.json','utf8')); } catch(error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
async function saveOnboarding() { await writeFile('.runtime/onboarding-B.json',JSON.stringify(onboarding)); }
if(onboarding.credentialsConfirmed) readiness.B='XMPP operation succeeded; identity approval not verified';
const operations = new Map<string,{actor:ActorId;name:string;status:string}>();
function snapshot() {
  return {onboarding,actors:Object.values(actors).map(a=>({id:a.id,connected:a.connected,tools:a.tools.length,
    requiredTools:required.every(n=>a.tools.some(t=>t.name===n)),busy:a.busy,readiness:readiness[a.id]})),
    pending:[...pending.values()].map(({id,actor,params})=>({id,actor,params})),
    operations:[...operations.entries()].map(([id,value])=>({id,...value})),events};
}
function broadcast() {
  const data = 'data: ' + JSON.stringify(snapshot()) + '\n\n';
  for (const response of streams) response.write(data);
}
function elicit(actor:ActorId, params:ElicitRequestParams, signal:AbortSignal):Promise<ElicitResult> {
  return new Promise(resolveResult=>{
    const id=randomUUID();
    const done=(result:ElicitResult)=>{pending.delete(id);signal.removeEventListener('abort',cancel);resolveResult(result);broadcast();};
    const cancel=()=>done({action:'cancel'});
    pending.set(id,{id,actor,params,resolve:done});
    signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted) cancel();
    broadcast();
  });
}
const actors = {
  A:new NeuroActor('A','C:\\Users\\alile\\NeuroAli\\.neuroali-data',52482,elicit),
  B:new NeuroActor('B','C:\\Users\\alile\\NeuroAli\\.neuroali-data-b',52483,elicit)
};
const required=['SendChatMessage','GetMessage','PopMessage','PetitionLegalIdentity'];
for(const actor of Object.values(actors)) actor.on('activity',event=>{
  events.push(event); if(events.length>200) events.shift(); broadcast();
});
app.disable('x-powered-by');
app.use((req,res,next)=>{
  if(!['localhost:4317','127.0.0.1:4317'].includes(req.headers.host??'')) {res.sendStatus(403);return;}
  if(req.headers.origin && ![origin,'http://127.0.0.1:4317'].includes(req.headers.origin)) {res.sendStatus(403);return;}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if(req.method==='POST' && req.headers['x-reliefmesh']!=='1') {res.sendStatus(403);return;}
  next();
});
app.use(express.json({limit:'64kb'}));
app.get('/api/status',(_req,res)=>res.json(snapshot()));
app.get('/api/events',(req,res)=>{
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Connection','keep-alive');res.flushHeaders();
  streams.add(res);res.write('data: '+JSON.stringify(snapshot())+'\n\n');
  const timer=setInterval(()=>res.write(': keepalive\n\n'),15_000);
  req.on('close',()=>{clearInterval(timer);streams.delete(res);});
});
app.get('/api/actors/:actor/tools',(req,res)=>{
  const actor=actors[req.params.actor as ActorId];
  if(!actor) {res.sendStatus(404);return;} res.json(actor.tools);
});
app.post('/api/elicitation/:id',(req,res)=>{
  const item=pending.get(req.params.id);
  if(!item) {res.status(409).json({error:'Interaction no longer pending'});return;}
  const {action,content}=req.body;
  if(!['accept','decline','cancel'].includes(action)) {res.sendStatus(400);return;}
  if(action==='accept' && item.params.mode!=='url') {
    if(!ajv.validate(item.params.requestedSchema,content)) {res.status(400).json({error:'Check the form fields'});return;}
  }
  item.resolve(action==='accept' && item.params.mode!=='url' ? {action,content} : {action});
  res.json({ok:true});
});
// Only the safe initial onboarding operation is enabled until live schemas are inspected.
app.post('/api/actors/:actor/connect-neuro',(req,res)=>{
  const actor=actors[req.params.actor as ActorId];
  if(!actor) {res.sendStatus(404);return;}
  if(actor.id==='B' && onboarding.credentialsConfirmed) {res.status(409).json({error:'Credential operation already succeeded; continue identity onboarding'});return;}
  if(actor.busy) {res.status(409).json({error:'Continue the existing interaction'});return;}
  const id=randomUUID();
  operations.set(id,{actor:actor.id,name:'GetIdentityApplicationProperties',status:'pending'});
  res.status(202).json({id});
  void actor.callTool('GetIdentityApplicationProperties',{}).then(async result=>{
    // Tool result contents never enter activity logs or browser status.
    const payload=neuroResult(result);
    const success=!result.isError && payload.Success===true;
    readiness[actor.id]=success?'XMPP operation succeeded; identity approval not verified':'Operation returned; readiness not confirmed';
    operations.get(id)!.status=success?'success':'not-confirmed';
    if(actor.id==='B' && success){onboarding.credentialsConfirmed=true;await saveOnboarding();}
  }).catch(()=>{operations.get(id)!.status='error';readiness[actor.id]='MCP operation failed';})
    .finally(broadcast);
});
// Durable write-before-dispatch guard. Ambiguous or failed creates never retry.
app.post('/api/actors/B/identity',async (_req,res)=>{
  const actor=actors.B;
  if(!actor.connected || actor.busy || !onboarding.credentialsConfirmed) {
    res.status(409).json({error:'Actor B must be connected, idle and credential-ready'});return;
  }
  try {
    await writeFile('.runtime/identity-B.create-once',new Date().toISOString(),{flag:'wx'});
  } catch {
    res.status(409).json({error:'Identity creation already reserved; never retry. Continue the existing application.'});return;
  }
  onboarding.stage='creating';
  await saveOnboarding();
  const id=randomUUID();
  operations.set(id,{actor:'B',name:'ApplyForNewPersonalIdentity',status:'pending'});
  res.status(202).json({id});
  void actor.callTool('ApplyForNewPersonalIdentity',{}).then(async result=>{
    const value=neuroResult(result);
    if(!result.isError && value.Success===true && typeof value.Id==='string' && value.Id.length>0){
      onboarding.legalId=value.Id;
      onboarding.identityState=typeof value.State==='string'?value.State:undefined;
      onboarding.stage='photo-required';
      operations.get(id)!.status='success';
    } else {onboarding.stage='creation-needs-review';operations.get(id)!.status='not-confirmed';}
    await saveOnboarding();
  }).catch(async ()=>{
    onboarding.stage='creation-needs-review';operations.get(id)!.status='error';await saveOnboarding();
  }).finally(broadcast);
});
app.use(express.static(resolve('web-dist')));
app.get(['/', '/setup','/volunteer'],(_req,res)=>res.sendFile(resolve('web-dist/index.html')));
app.use((_err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'Request failed'}));
const server=app.listen(port,'127.0.0.1',()=>console.log('ReliefMesh: '+origin+'/setup'));
for(const actor of Object.values(actors)) {
  try {
    await actor.connect();
    await mkdir('.runtime',{recursive:true});
    await writeFile('.runtime/tools-'+actor.id+'.json',JSON.stringify(actor.tools,null,2));
    console.log('ACTOR_'+actor.id+'_MCP=PASS ACTOR_'+actor.id+'_TOOLS='+actor.tools.length);
  } catch {console.log('ACTOR_'+actor.id+'_MCP=FAIL');}
}
broadcast();
let closing=false;
async function shutdown(){if(closing)return;closing=true;for(const p of pending.values())p.resolve({action:'cancel'});await Promise.allSettled(Object.values(actors).map(a=>a.close()));server.close();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());

