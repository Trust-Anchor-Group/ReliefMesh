import test from 'node:test';
import assert from 'node:assert/strict';
import {contractFullySigned,paymentEvidence} from '../src/evidence.js';
// Predicate fixtures only: no fake MCP transport or simulated live certification.
test('A displayed signature cannot replace the signed contract resource',()=>{
 const c={state:'Proposed',roles:[{Name:'Coordinator',MinCount:1},{Name:'Volunteer',MinCount:1}],signatures:[{actor:'A',role:'Coordinator'},{actor:'B',role:'Volunteer'}]};
 assert.equal(contractFullySigned(c),false);
 assert.equal(contractFullySigned({...c,state:'Signed'}),true);
 assert.equal(contractFullySigned({...c,state:'Signed',signatures:c.signatures.slice(0,1)}),false);
 assert.equal(contractFullySigned({...c,state:'Signed',roles:[...c.roles,{Name:'Witness',MinCount:1}]}),false);
});
test('Payment evidence rejects pending, wrong-recipient, or unchanged-wallet results',()=>{
 const v={Success:true,Id:'predicate-fixture',Processed:'2026-09-06T10:00:00Z',Amount:0.01,Currency:'TST',To:'test-volunteer'};
 const check=(result:Record<string,unknown>,after={A:0.99,B:0.01})=>paymentEvidence(result,0.01,'TST',['test-volunteer'],{A:1,B:0},after);
 assert.equal(check(v),true);
 assert.equal(check({...v,Processed:null}),false);
 assert.equal(check({...v,To:'unrelated-recipient'}),false);
 assert.equal(check({...v,Amount:1}),false);
 assert.equal(check({...v,Currency:'SEK'}),false);
 assert.equal(check(v,{A:1,B:0}),false);
});
test('Mission start rejects invalid input without dispatch',async()=>{
 const r=await fetch('http://localhost:4317/api/mission',{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify({prompt:''})});assert.equal(r.status,400);
});
test('Unknown approval cannot execute a queued operation',async()=>{
 const r=await fetch('http://localhost:4317/api/mission/approval/nonexistent',{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify({accept:true})});assert.equal(r.status,409);
});
