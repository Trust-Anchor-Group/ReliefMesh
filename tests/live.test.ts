import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const actor of ['A','B']) test('Actor '+actor+' real captured catalog',async()=>{
  const tools=JSON.parse(await readFile('.runtime/tools-'+actor+'.json','utf8'));
  assert.ok(tools.length>0);
  assert.equal(new Set(tools.map((t:{name:string})=>t.name)).size,tools.length);
  for(const name of ['SendChatMessage','GetMessage','PopMessage','PetitionLegalIdentity'])
    assert.ok(tools.some((t:{name:string})=>t.name===name));
  const send=tools.find((t:{name:string})=>t.name==='SendChatMessage');
  assert.deepEqual(send.inputSchema.required,['To','Message']);
});
test('Live backend reports independent connected actors',async()=>{
  const response=await fetch('http://localhost:4317/api/status');
  assert.equal(response.status,200);
  const status=await response.json();
  assert.deepEqual(status.actors.map((a:any)=>[a.id,a.connected]),[['A',true],['B',true]]);
  assert.ok(status.actors.every((a:any)=>a.tools>0&&a.requiredTools));
});
test('Cross-origin mutation blocked before tool dispatch',async()=>{
  const response=await fetch('http://localhost:4317/api/actors/B/connect-neuro',{
    method:'POST',headers:{Origin:'https://untrusted.invalid','X-ReliefMesh':'1'}
  });
  assert.equal(response.status,403);
});
test('Mutation without application header blocked',async()=>{
  const response=await fetch('http://localhost:4317/api/actors/B/connect-neuro',{method:'POST'});
  assert.equal(response.status,403);
});

test('No-key agent endpoint does not pretend to execute a model',async()=>{
  const status=await (await fetch('http://localhost:4317/api/status')).json();
  if(status.agent.configured)return;
  const response=await fetch('http://localhost:4317/api/agent',{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify({prompt:'Local configuration check'})});
  assert.equal(response.status,503);
});
test('Unproven petition action is not exposed',async()=>{
  const response=await fetch('http://localhost:4317/api/trust/petition',{method:'POST',headers:{'X-ReliefMesh':'1'}});
  assert.equal(response.status,404);
});
