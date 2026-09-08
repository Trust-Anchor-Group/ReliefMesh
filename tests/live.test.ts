import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runtimePath} from '../src/config.js';

const baseUrl='http://localhost:4317';
const leaseResponse=await fetch(baseUrl+'/api/sandbox/lease',{method:'POST',headers:{'X-ReliefMesh':'1'}});
assert.ok([200,201].includes(leaseResponse.status),await leaseResponse.text());
const leaseCookie=leaseResponse.headers.getSetCookie()[0]?.split(';')[0];
assert.ok(leaseCookie);
const ownerHeaders={Cookie:leaseCookie,'X-ReliefMesh':'1'};

for(const actor of ['A','B']) test('Actor '+actor+' real captured catalog',async()=>{
  const tools=JSON.parse(await readFile(runtimePath('tools-'+actor+'.json'),'utf8'));
  assert.ok(tools.length>0);
  assert.equal(new Set(tools.map((t:{name:string})=>t.name)).size,tools.length);
  for(const name of ['SendChatMessage','GetMessage','PopMessage','PetitionLegalIdentity'])
    assert.ok(tools.some((t:{name:string})=>t.name===name));
  const send=tools.find((t:{name:string})=>t.name==='SendChatMessage');
  assert.deepEqual(send.inputSchema.required,['To','Message']);
});
test('Live backend reports independent connected actors',async()=>{
  const response=await fetch(baseUrl+'/api/status',{headers:ownerHeaders});
  assert.equal(response.status,200);
  const status=await response.json();
  assert.deepEqual(status.actors.map((a:any)=>[a.id,a.connected]),[['A',true],['B',true]]);
  assert.ok(status.actors.every((a:any)=>a.tools>0&&a.requiredTools));
});
test('Cross-origin mutation blocked before tool dispatch',async()=>{
  const response=await fetch(baseUrl+'/api/actors/B/connect-neuro',{
    method:'POST',headers:{...ownerHeaders,Origin:'https://untrusted.invalid'}
  });
  assert.equal(response.status,403);
});
test('Mutation without application header blocked',async()=>{
  const response=await fetch(baseUrl+'/api/actors/B/connect-neuro',{method:'POST',headers:{Cookie:leaseCookie}});
  assert.equal(response.status,403);
});

test('No-key agent endpoint does not pretend to execute a model',async()=>{
  const status=await (await fetch(baseUrl+'/api/status',{headers:ownerHeaders})).json();
  if(status.agent.configured)return;
  const response=await fetch(baseUrl+'/api/agent',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify({prompt:'Local configuration check'})});
  assert.equal(response.status,409);
});
test('Unproven petition action is not exposed',async()=>{
  const response=await fetch(baseUrl+'/api/trust/petition',{method:'POST',headers:ownerHeaders});
  assert.equal(response.status,404);
});
test('Operator funding and recovery actions are not exposed',async()=>{
  for(const path of ['/api/mission/claim-operator-funding','/api/mission/reconcile-confirmed-payment','/api/mission/approval/example/reset-never-sent']){
    const response=await fetch(baseUrl+path,{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,404,path);
  }
});
test('Health endpoint contains no session or credential data',async()=>{
  const response=await fetch(baseUrl+'/health');
  assert.equal(response.status,200);
  const text=await response.text();
  assert.doesNotMatch(text,/sessionId|password|token|legalId|jid/i);
});
test('Second visitor cannot read or mutate the leased sandbox',async()=>{
  assert.equal((await fetch(baseUrl+'/api/status')).status,423);
  assert.equal((await fetch(baseUrl+'/api/sandbox/lease',{method:'POST',headers:{'X-ReliefMesh':'1'}})).status,409);
});
test('Owner session refresh preserves the lease and mission count',async()=>{
  const before=await (await fetch(baseUrl+'/api/sandbox/session',{headers:{Cookie:leaseCookie}})).json();
  assert.equal(before.status,'owned');
  const refreshed=await fetch(baseUrl+'/api/sandbox/lease',{method:'POST',headers:ownerHeaders});
  assert.equal(refreshed.status,200);
  assert.ok(refreshed.headers.getSetCookie()[0]?.includes('HttpOnly'));
  const after=await refreshed.json();
  assert.equal(after.ok,true);
  assert.equal((await (await fetch(baseUrl+'/api/sandbox/session',{headers:{Cookie:leaseCookie}})).json()).missionCount,before.missionCount);
});
test('Invalid mission and unknown approval cannot dispatch Neuro operations',async()=>{
  const invalid=await fetch(baseUrl+'/api/mission',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify({prompt:''})});
  assert.equal(invalid.status,400);
  const approval=await fetch(baseUrl+'/api/mission/approval/nonexistent',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:JSON.stringify({accept:true})});
  assert.equal(approval.status,409);
});
test('Owner release invalidates its cookie and makes the sandbox acquirable',async()=>{
  const released=await fetch(baseUrl+'/api/sandbox/release',{method:'POST',headers:ownerHeaders});
  assert.equal(released.status,200,await released.text());
  assert.ok(released.headers.getSetCookie()[0]?.includes('Max-Age=0'));
  assert.equal((await fetch(baseUrl+'/api/status',{headers:ownerHeaders})).status,423);

  const next=await fetch(baseUrl+'/api/sandbox/lease',{method:'POST',headers:{'X-ReliefMesh':'1'}});
  assert.equal(next.status,201,await next.text());
  const nextCookie=next.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(nextCookie);
  assert.equal((await fetch(baseUrl+'/api/sandbox/release',{method:'POST',headers:{Cookie:nextCookie,'X-ReliefMesh':'1'}})).status,200);
});
