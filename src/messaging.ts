import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import type { NeuroActor, ActorId } from './actor.js';
import { neuroResult } from './result.js';

export type Network = { A:string; B:string };
export type Message = {id:string; actor:ActorId; direction:'incoming'|'outgoing'; body:string; timestamp:string};
export function validateNetwork(value:unknown): value is Network {
  if(!value || typeof value!=='object')return false;
  const v=value as Network;
  const valid=(s:unknown)=>typeof s==='string' && s.length<=256 && /^[^@/<>\s]+@[^@/<>\s]+$/.test(s);
  return valid(v.A)&&valid(v.B)&&v.A.toLowerCase()!==v.B.toLowerCase();
}
export class Messaging {
  network?:Network;
  messages:Message[]=[];
  proof:Record<string,unknown>={};
  private seen:Record<ActorId,Set<string>>={A:new Set(),B:new Set()};
  private scanning:Record<ActorId,boolean>={A:false,B:false};
  constructor(private actors:Record<ActorId,NeuroActor>,private changed:()=>void){}
  async load(){
    try{const n=JSON.parse(await readFile('.runtime/network.json','utf8'));if(validateNetwork(n))this.network=n;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    try{this.proof=JSON.parse(await readFile('.runtime/messaging-proof.json','utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  async configure(n:Network){
    if(this.network && (this.network.A!==n.A||this.network.B!==n.B))throw new Error('Existing participants are locked for this lifecycle');
    if(!validateNetwork(n))throw new Error('Provide distinct bare XMPP addresses');
    await writeFile('.runtime/network.json',JSON.stringify(n));this.network=n;this.changed();
  }
  async resources(id:ActorId){
    const resources=[];let cursor:string|undefined;const seen=new Set<string>();
    do{const page=await this.actors[id].client.listResources(cursor?{cursor}:undefined);
      resources.push(...page.resources);cursor=page.nextCursor;
      if(cursor&&seen.has(cursor))throw new Error('Repeated resource cursor');if(cursor)seen.add(cursor);
    }while(cursor);return resources;
  }
  async receive(id:ActorId){
    if(!this.network||this.scanning[id]||this.actors[id].busy)return;
    this.scanning[id]=true;
    try{
      for(const r of await this.resources(id)){
        if(!r.uri.startsWith('mid:')||this.seen[id].has(r.uri))continue;
        const result=await this.actors[id].callTool('GetMessage',{MessageId:r.uri,Remove:false});
        const value=neuroResult(result);
        if(result.isError||value.Success!==true)continue;
        this.seen[id].add(r.uri);
        const peer=id==='A'?'B':'A';
        // Ignore unrelated messages, preserving them on Neuro-Ali.
        if(typeof value.FromBareJid!=='string'||value.FromBareJid.toLowerCase()!==this.network[peer].toLowerCase()||typeof value.Body!=='string'||value.ErrorMessage===true)continue;
        this.messages.push({id:r.uri,actor:id,direction:'incoming',body:value.Body,timestamp:new Date().toISOString()});
        if(this.messages.length>200)this.messages.shift();this.changed();
      }
    }finally{this.scanning[id]=false;}
  }
  async send(id:ActorId,body:string,operationId:string){
    if(!this.network)throw new Error('Participant addresses required');
    if(typeof body!=='string'||body.length<1||body.length>10000)throw new Error('Message must contain 1–10000 characters');
    if(!/^[0-9a-f-]{36}$/i.test(operationId))throw new Error('Valid operation ID required');
    // No automatic retry after an ambiguous send.
    await writeFile('.runtime/send-'+id+'-'+operationId+'.once',new Date().toISOString(),{flag:'wx'});
    const result=await this.actors[id].callTool('SendChatMessage',{To:this.network[id==='A'?'B':'A'],Message:body,IsMarkdown:false,Language:'en'});
    const success=!result.isError&&neuroResult(result).Success===true;
    if(success){this.messages.push({id:operationId,actor:id,direction:'outgoing',body,timestamp:new Date().toISOString()});this.changed();}
    return success;
  }
  private async saveProof(){
    await writeFile('.runtime/messaging-proof.tmp',JSON.stringify(this.proof));
    await rename('.runtime/messaging-proof.tmp','.runtime/messaging-proof.json');this.changed();
  }
  private async waitFor(id:ActorId,body:string){
    const deadline=Date.now()+45_000;
    while(Date.now()<deadline){await this.receive(id);if(this.messages.some(m=>m.actor===id&&m.direction==='incoming'&&m.body===body))return true;
      await new Promise(r=>setTimeout(r,1500));}return false;
  }
  async test(){
    if(!this.network)throw new Error('Participant addresses required');
    await writeFile('.runtime/two-way-test.once',new Date().toISOString(),{flag:'wx'});
    const correlation=randomUUID();
    this.proof={correlation,status:'running'};await this.saveProof();
    const request='ReliefMesh connection test '+correlation+'. Please acknowledge.';
    const reply='ReliefMesh acknowledgement '+correlation+'. Received.';
    try{
      this.proof.A_TO_B_MESSAGE=await this.send('A',request,randomUUID())?'PASS':'FAIL';await this.saveProof();
      if(this.proof.A_TO_B_MESSAGE!=='PASS')throw new Error('Send failed');
      this.proof.B_RECEIVED=await this.waitFor('B',request)?'PASS':'FAIL';await this.saveProof();
      if(this.proof.B_RECEIVED!=='PASS')throw new Error('Receive not confirmed');
      this.proof.B_TO_A_REPLY=await this.send('B',reply,randomUUID())?'PASS':'FAIL';await this.saveProof();
      if(this.proof.B_TO_A_REPLY!=='PASS')throw new Error('Reply failed');
      this.proof.A_RECEIVED_REPLY=await this.waitFor('A',reply)?'PASS':'FAIL';
      this.proof.REAL_TWO_WAY_MCP_MESSAGING=this.proof.A_RECEIVED_REPLY==='PASS'?'PASS':'FAIL';
      this.proof.status=this.proof.REAL_TWO_WAY_MCP_MESSAGING==='PASS'?'passed':'failed';
    }catch{this.proof.status='needs-review';}
    await this.saveProof();
  }
}

