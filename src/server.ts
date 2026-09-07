import express from 'express';
import {Mission} from './mission.js';
import { CoordinationAgent } from './agent.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import type { ElicitRequestParams, ElicitResult } from '@modelcontextprotocol/client';
import { NeuroActor, type ActorId } from './actor.js';
import { neuroResult } from './result.js';
import { Messaging, validateNetwork } from './messaging.js';

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
let trust: {status:string;petitionId?:string;recipientInteraction?:boolean;responseReceived?:boolean}={status:'not-tested'};
try{trust=JSON.parse(await readFile('.runtime/trust.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
async function saveTrust(){await writeFile('.runtime/trust.json',JSON.stringify(trust));}
async function saveOnboarding() { await writeFile('.runtime/onboarding-B.json',JSON.stringify(onboarding)); }
if(onboarding.credentialsConfirmed) readiness.B='XMPP operation succeeded; identity approval not verified';
if(onboarding.stage==='readiness-confirmed')readiness.B='Post-approval MCP readiness confirmed';
const operations = new Map<string,{actor:ActorId;name:string;status:string}>();
function safeInteraction(params:ElicitRequestParams):ElicitRequestParams {
 let message=params.message;
 if(message.startsWith('A petition for one of your Legal Identities ('))message='ReliefMesh Crisis Coordination is requesting access to your verified identity for this assignment. Review the secure form and choose whether to disclose your identity.';
 else if(message.startsWith('A Legal Identity you petitioned ('))message='The requested identity response has arrived through Neuro. Acknowledge the secure response to complete the trust check.';
 return {...params,message};
}
function snapshot() {
  const missionState=mission.snapshot as any;
  const latestHistory=mission.historySnapshot.at(-1);
  const coordinatorBalance=missionState.balances?.A??latestHistory?.balancesAfter?.A;
  const identitiesReady=(missionState.identityReadiness?.A&&missionState.identityReadiness?.B)||mission.historySnapshot.length>0;
  const templateApproved=missionState.templates?.some((template:any)=>template.id==='323064dd-0e43-4f7b-6833-3d05e10bb267@legal.lab.tagroot.io'&&template.state==='Approved'&&template.template===true)||mission.historySnapshot.some(entry=>entry.templateId==='323064dd-0e43-4f7b-6833-3d05e10bb267@legal.lab.tagroot.io');
  return {mission:missionState,missionHistory:mission.historySnapshot,readinessSummary:{identitiesReady,templateApproved,coordinatorBalance},onboarding:{...onboarding,legalId:undefined},trust,agent:agent.status,conversation:agent.conversation,networkConfigured:!!messaging.network,messages:messaging.messages,proof:messaging.proof,actors:Object.values(actors).map(a=>({id:a.id,connected:a.connected,tools:a.tools.length,
    requiredTools:required.every(n=>a.tools.some(t=>t.name===n)),busy:a.busy,readiness:readiness[a.id]})),
    pending:[...pending.values()].map(({id,actor,params})=>({id,actor,params:safeInteraction(params)})),
    operations:[...operations.entries()].map(([id,value])=>({id,...value})),events};
}
function broadcast() {
  const data = 'data: ' + JSON.stringify(snapshot()) + '\n\n';
  for (const response of streams) response.write(data);
}
function elicit(actor:ActorId, params:ElicitRequestParams, signal:AbortSignal):Promise<ElicitResult> {
  // Acknowledge only receipt of the exact mission identity already disclosed by B.
  // This is not approval of disclosure, a signature, or a payment.
  const petitionId=mission.state?.petitionId;
  if(actor==='A'&&petitionId&&params.message.startsWith('A Legal Identity you petitioned (Petition ID '+petitionId+') has been successfully returned.')){
    return mission.onElicitation(actor,params).then(()=>({action:'accept' as const,content:{}}));
  }
  return new Promise(resolveResult=>{
    const id=randomUUID();
    void mission.onElicitation(actor,params).catch(()=>{});
    if(actor==='B'&&trust.status==='requested'&&params.message.startsWith('A petition for one of your Legal Identities (')&&params.message.includes(onboarding.legalId??'INVALID')){
      trust.recipientInteraction=true;void saveTrust();
    }
    if(actor==='A'&&trust.petitionId&&params.message.startsWith('A Legal Identity you petitioned (Petition ID '+trust.petitionId+') has been successfully returned.')){
      trust.responseReceived=true;trust.status='identity-returned-awaiting-acknowledgement';void saveTrust();
    }
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
const messaging=new Messaging(actors,broadcast);
await messaging.load();
const agent=new CoordinationAgent(actors.A,messaging,broadcast);
const mission=new Mission(actors,messaging,broadcast);
await mission.load();
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
// Each onboarding mutation is dispatched at most once, including across restarts.
app.post('/api/actors/B/photo',async (_req,res)=>{
  const actor=actors.B;
  if(!actor.connected || actor.busy || onboarding.stage!=='photo-required' || !onboarding.legalId){
    res.status(409).json({error:'Continue the existing identity application'});return;
  }
  try {await writeFile('.runtime/identity-B.photo-once',new Date().toISOString(),{flag:'wx'});}
  catch {res.status(409).json({error:'Photo interaction already started; continue it without retrying'});return;}
  onboarding.stage='photo-pending';await saveOnboarding();
  const id=randomUUID();operations.set(id,{actor:'B',name:'AddPhotoAttachmentElicitation',status:'pending'});
  res.status(202).json({id});
  void actor.callTool('AddPhotoAttachmentElicitation',{LegalId:onboarding.legalId,PhotoType:'ProfilePhoto'}).then(async result=>{
    const value=neuroResult(result);
    const success=!result.isError && value.Success===true && value.Id===onboarding.legalId;
    onboarding.stage=success?'ready-to-submit':'photo-needs-review';
    operations.get(id)!.status=success?'success':'not-confirmed';
    await saveOnboarding();
  }).catch(async()=>{onboarding.stage='photo-needs-review';operations.get(id)!.status='error';await saveOnboarding();}).finally(broadcast);
});
app.post('/api/actors/B/submit-approval',async (_req,res)=>{
  const actor=actors.B;
  if(!actor.connected || actor.busy || onboarding.stage!=='ready-to-submit' || !onboarding.legalId){
    res.status(409).json({error:'Complete the photo interaction first'});return;
  }
  try {await writeFile('.runtime/identity-B.submit-once',new Date().toISOString(),{flag:'wx'});}
  catch {res.status(409).json({error:'Approval submission already started; do not repeat it'});return;}
  onboarding.stage='submitting-approval';await saveOnboarding();
  const id=randomUUID();operations.set(id,{actor:'B',name:'ReadyForApproval',status:'pending'});
  res.status(202).json({id});
  void actor.callTool('ReadyForApproval',{LegalId:onboarding.legalId}).then(async result=>{
    const success=!result.isError && neuroResult(result).Success===true;
    onboarding.stage=success?'waiting-for-lab-approval':'submission-needs-review';
    operations.get(id)!.status=success?'success':'not-confirmed';await saveOnboarding();
  }).catch(async()=>{onboarding.stage='submission-needs-review';operations.get(id)!.status='error';await saveOnboarding();}).finally(broadcast);
});
// Local development reload: refuses to interrupt any MCP call or elicitation.
app.post('/api/runtime/close',(_req,res)=>{
  if(mission.busy || agent.busy || pending.size || Object.values(actors).some(a=>a.busy)){res.sendStatus(409);return;}
  res.json({ok:true});void shutdown();
});
app.post('/api/mission/recover-volunteer-proposal',(_req,res)=>{
  if(mission.busy||pending.size||Object.values(actors).some(actor=>!actor.connected||actor.busy)){res.sendStatus(409);return;}
  res.status(202).json({status:'starting'});
  void mission.recoverVolunteerProposal().catch(()=>broadcast());
});
app.post('/api/mission/continue-approved-volunteer-signature',(_req,res)=>{
  if(mission.busy||pending.size||Object.values(actors).some(actor=>!actor.connected||actor.busy)){res.sendStatus(409);return;}
  res.status(202).json({status:'starting'});
  void mission.continueApprovedVolunteerSignature().catch(()=>broadcast());
});
app.post('/api/mission/fund-and-prepare-payment',(_req,res)=>{
  if(mission.busy||pending.size||Object.values(actors).some(actor=>!actor.connected||actor.busy)){res.sendStatus(409);return;}
  res.status(202).json({status:'starting'});
  void mission.fundAndPreparePayment().catch(()=>broadcast());
});
app.post('/api/mission/claim-operator-funding',(req,res)=>{
  if(typeof req.body.uri!=='string'||mission.busy||pending.size||Object.values(actors).some(actor=>!actor.connected||actor.busy)){res.sendStatus(409);return;}
  const uri=req.body.uri;
  res.status(202).json({status:'starting'});
  void mission.claimOperatorFundingAndPrepare(uri).catch(()=>broadcast());
});
app.post('/api/mission/reconcile-confirmed-payment',(_req,res)=>{
  if(mission.busy||pending.size||Object.values(actors).some(actor=>!actor.connected||actor.busy)){res.sendStatus(409);return;}
  res.status(202).json({status:'starting'});
  void mission.reconcileConfirmedConditionalPayment().catch(()=>broadcast());
});
app.post('/api/actors/:actor/inspect',async(req,res)=>{
  const actor=actors[req.params.actor as ActorId];
  if(!actor || !actor.connected || actor.busy){res.sendStatus(409);return;}
  try {
    if(req.body.kind==='resources') {res.json({resources:await actor.listResources()});return;}
    if(req.body.kind==='templates') {res.json(await actor.listResourceTemplates());return;}
    if(req.body.kind==='read' && typeof req.body.uri==='string') {res.json(await actor.readResource(req.body.uri));return;}
    if(req.params.actor==='A'&&req.body.kind==='balance') {res.json(neuroResult(await actor.callTool('GetBalance',{})));return;}
    if(req.params.actor==='A'&&req.body.kind==='fundingProviders') {res.json(neuroResult(await actor.callTool('GetServiceProvidersForBuyingEDaler',{})));return;}
    if(req.params.actor==='A'&&req.body.kind==='fundingOptions'&&typeof req.body.id==='string'&&typeof req.body.type==='string') {
      res.json(neuroResult(await actor.callTool('GetBuyEDalerOptions',{Id:req.body.id,Type:req.body.type})));return;
    }
    res.sendStatus(400);
  }catch{res.status(502).json({error:'MCP read failed'});}
});
app.post('/api/actors/B/check-readiness',async(_req,res)=>{
  const actor=actors.B;
  if(!actor.connected||actor.busy){res.sendStatus(409);return;}
  const result=await actor.callTool('GetBalance',{});
  const success=!result.isError&&neuroResult(result).Success===true;
  if(success){onboarding.stage='readiness-confirmed';await saveOnboarding();readiness.B='Post-approval MCP readiness confirmed; cross-party verification unproven';}
  broadcast();res.json({success});
});
app.post('/api/network',async(req,res)=>{
  if(!validateNetwork(req.body)){res.status(400).json({error:'Two distinct bare XMPP addresses required'});return;}
  try{await messaging.configure(req.body);res.json({ok:true});}catch{res.status(409).json({error:'Participant configuration rejected'});}
});
app.post('/api/test/two-way',(_req,res)=>{
  if(!messaging.network||Object.values(actors).some(a=>!a.connected||a.busy)){res.status(409).json({error:'Both actors must be ready and configured'});return;}
  res.status(202).json({status:'starting'});
  void messaging.test().catch(()=>{events.push({actor:'A',operation:'two-way test',status:'already-started-or-blocked',timestamp:new Date().toISOString()});broadcast();});
});
app.post('/api/messages/:actor',async(req,res)=>{
  const actorId=req.params.actor;
  if(actorId!=='A'&&actorId!=='B'){res.sendStatus(404);return;}
  if(agent.busy&&actorId==='A'){res.status(409).json({error:'The coordinator agent is working'});return;}
  try{const success=await messaging.send(actorId,req.body.body,req.body.operationId);res.json({success});}
  catch{res.status(409).json({error:'Send blocked or uncertain. Check activity before sending again.'});}
});
app.post('/api/agent',(_req,res)=>{
  const prompt=_req.body.prompt;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>10000){res.sendStatus(400);return;}
  if(!agent.status.configured){res.status(503).json({error:'Configure AI_PROVIDER, AI_MODEL and an API key in the backend environment.'});return;}
  if(Object.values(actors).some(a=>!a.connected)||!messaging.network){res.status(503).json({error:'Both MCP actors must be connected. Restart the idle ReliefMesh runtime if a session has failed.'});return;}
  if(agent.busy){res.status(409).json({error:'The agent is already working'});return;}
  res.status(202).json({ok:true});void agent.run(prompt).catch(()=>broadcast());
});
app.post('/api/mission', (req,res)=>{
 if(typeof req.body.prompt!=='string'||!req.body.prompt.trim()||req.body.prompt.length>10000){res.sendStatus(400);return;}
 if(mission.state||mission.busy||Object.values(actors).some(a=>!a.connected)){res.status(409).json({error:'Mission exists or actors are unavailable. Resume the preserved mission.'});return;}
 res.status(202).json({ok:true});void mission.start(req.body.prompt).catch(()=>broadcast());
});
app.post('/api/mission/start-another',async(_req,res)=>{
 if(mission.busy||agent.busy||pending.size||Object.values(actors).some(actor=>actor.busy)){res.status(409).json({error:'Wait for the current operation to finish.'});return;}
 try{await mission.startAnother();res.json({ok:true});}catch{res.status(409).json({error:'Complete the mission, or discard it before any signature or payment, to start another.'});}
});
app.post('/api/mission/template',async(req,res)=>{
 if(typeof req.body.templateId!=='string'){res.sendStatus(400);return;}
 try{res.json(await mission.verifyTemplate(req.body.templateId));}catch{res.status(409).json({error:'Authoritative template verification failed; no template or contract was created.'});}
});
app.post('/api/mission/contract',async(_req,res)=>{
 try{res.json(await mission.createMissionContract());}catch{res.status(409).json({error:'Contract creation unavailable or uncertain. Preserved state was not retried.'});}
});
app.post('/api/mission/replacement',(_req,res)=>{
 if(mission.busy||pending.size||Object.values(actors).some(a=>!a.connected)){res.status(409).json({error:'Actors or interaction unavailable'});return;}
 res.status(202).json({ok:true});void mission.sendPreparedReplacement().catch(()=>broadcast());
});
app.post('/api/mission/approval/:id',async(req,res)=>{
 if(typeof req.body.accept!=='boolean'){res.sendStatus(400);return;}
 try{await mission.approve(req.params.id,req.body.accept);res.json({ok:true});}catch{res.status(409).json({error:'Approval unavailable or uncertain. State preserved.'});}
});
app.post('/api/mission/approval/:id/reset-never-sent',async(req,res)=>{
 try{await mission.resetNeverSentSignApproval(req.params.id);res.json({ok:true});}catch{res.status(409).json({error:'Never-sent approval recovery rejected.'});}
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
await mission.recoverDiscovery().catch(()=>false);
broadcast();
const polling=setInterval(()=>{
  if(agent.busy || mission.busy || !messaging.network)return;
  for(const id of ['A','B'] as const){
    if(actors[id].connected&&!actors[id].busy&&![...pending.values()].some(p=>p.actor===id))
      void messaging.receive(id).then(()=>id==='A'?(mission.state?mission.tick():agent.summarizeNewReplies()):undefined).catch(()=>{});
  }
},6000);
let closing=false;
async function shutdown(){if(closing)return;closing=true;clearInterval(polling);for(const p of pending.values())p.resolve({action:'cancel'});await Promise.allSettled(Object.values(actors).map(a=>a.close()));server.close();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());


