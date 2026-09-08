import test from 'node:test';
import assert from 'node:assert/strict';
import {cookieValue,isSandboxLeaseState,SANDBOX_MAX_REIMBURSEMENT_TST,SANDBOX_TTL_MS,sandboxCookie,SandboxLeaseManager} from '../src/sandbox.js';

test('sandbox lease is exclusive and bound to its opaque browser cookie',()=>{
  let now=Date.parse('2026-09-07T12:00:00Z');
  const leases=new SandboxLeaseManager(undefined,()=>now,()=> 'owner-token');
  const owned=leases.acquire();
  assert.equal(owned.lease.sessionId.length,64);
  assert.notEqual(owned.lease.sessionId,owned.token);
  assert.equal(leases.status('owner-token'),'owned');
  assert.equal(leases.status('second-browser'),'busy');
  assert.equal(isSandboxLeaseState(owned.lease),true);
  assert.equal(isSandboxLeaseState({...owned.lease,sessionId:'owner-token'}),false);
  assert.throws(()=>leases.acquire('second-browser'),/Demo currently in use/);
  now+=SANDBOX_TTL_MS;
  assert.equal(leases.status('owner-token'),'expired');
  assert.equal(leases.authorize('owner-token'),false);
  assert.equal(leases.clearExpired(),true);
  assert.equal(leases.status(),'available');
});

test('sandbox lease reserves at most three missions',()=>{
  const leases=new SandboxLeaseManager(undefined,()=>Date.parse('2026-09-07T12:00:00Z'),()=> 'owner-token');
  leases.acquire();
  assert.equal(leases.recordMission('owner-token').missionCount,1);
  assert.equal(leases.recordMission('owner-token').missionCount,2);
  assert.equal(leases.recordMission('owner-token').missionCount,3);
  assert.throws(()=>leases.recordMission('owner-token'),/Maximum 3 missions/);
  assert.throws(()=>leases.recordMission('second-browser'),/Sandbox lease required/);
});

test('sandbox cookie is HttpOnly, same-site, scoped to the site, and optionally secure',()=>{
  const header=sandboxCookie('opaque token',true);
  assert.match(header,/HttpOnly/);
  assert.match(header,/SameSite=Strict/);
  assert.match(header,/Secure/);
  assert.equal(cookieValue('other=1; '+header.split(';')[0]),'opaque token');
  assert.equal(SANDBOX_MAX_REIMBURSEMENT_TST,0.03);
});