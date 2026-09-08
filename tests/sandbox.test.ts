import test from 'node:test';
import assert from 'node:assert/strict';
import {cookieValue,expiredSandboxCookie,isSandboxLeaseState,SANDBOX_MAX_REIMBURSEMENT_TST,sandboxCookie,SandboxLeaseManager} from '../src/sandbox.js';

const durations={activity:1_000,owner:10_000,mission:5_000};
function fixture(initial?:ConstructorParameters<typeof SandboxLeaseManager>[0]){
  let now=Date.parse('2026-09-07T12:00:00Z');
  const leases=new SandboxLeaseManager(initial,()=>now,()=> 'owner-token',durations);
  return {leases,advance:(milliseconds:number)=>{now+=milliseconds;}};
}

test('lease is exclusive, opaque, and slides on owner activity',()=>{
  const {leases,advance}=fixture();
  const owned=leases.acquire();
  assert.equal(owned.lease.sessionId.length,64);
  assert.notEqual(owned.lease.sessionId,owned.token);
  assert.equal(leases.status('owner-token'),'owned');
  assert.equal(leases.status('second-browser'),'busy');
  assert.equal(isSandboxLeaseState(owned.lease),true);
  assert.equal(isSandboxLeaseState({...owned.lease,sessionId:'owner-token'}),false);
  assert.throws(()=>leases.acquire(),/Existing lease/);

  advance(900);
  assert.equal(leases.authorize('owner-token'),true);
  advance(900);
  assert.equal(leases.status('owner-token'),'owned');
  advance(101);
  assert.equal(leases.status('owner-token'),'expired');
  assert.equal(leases.authorize('owner-token'),false);
});

test('same owner resumes an active mission during grace while other browsers remain blocked',()=>{
  const {leases,advance}=fixture();
  leases.acquire();
  leases.recordMission('owner-token','RM-ACTIVE');
  advance(durations.activity+1);

  assert.equal(leases.status('owner-token','RM-ACTIVE'),'owned');
  assert.equal(leases.status('second-browser','RM-ACTIVE'),'busy');
  assert.equal(leases.status(undefined,'RM-ACTIVE'),'busy');
  assert.equal(leases.authorize('owner-token','RM-ACTIVE'),true);
  assert.equal(leases.snapshot?.missionCount,1);
  assert.equal(leases.snapshot?.activeMissionId,'RM-ACTIVE');
});

test('active mission grace is bounded and then permits clean expiry',()=>{
  const {leases,advance}=fixture();
  leases.acquire();
  leases.recordMission('owner-token','RM-ACTIVE');
  advance(durations.mission);

  assert.equal(leases.status('owner-token','RM-ACTIVE'),'expired');
  assert.equal(leases.clearExpired('RM-ACTIVE'),true);
  assert.equal(leases.status(),'available');
});

test('finishing a mission removes grace without changing the mission count',()=>{
  const {leases,advance}=fixture();
  leases.acquire();
  leases.recordMission('owner-token','RM-DONE');
  assert.equal(leases.finishMission('owner-token','RM-DONE'),true);
  assert.equal(leases.snapshot?.activeMissionId,undefined);
  assert.equal(leases.snapshot?.missionCount,1);
  advance(durations.activity+1);
  assert.equal(leases.status('owner-token','RM-DONE'),'expired');
});

test('persisted hash-only lease survives restart and preserves owner exclusivity',()=>{
  const first=fixture();
  first.leases.acquire();
  first.leases.recordMission('owner-token','RM-RESTART');
  first.advance(durations.activity+1);
  const persisted=first.leases.snapshot;
  assert.equal(isSandboxLeaseState(persisted),true);
  assert.equal(JSON.stringify(persisted).includes('owner-token'),false);

  const restarted=fixture(persisted);
  assert.equal(restarted.leases.status('owner-token','RM-RESTART'),'owned');
  assert.equal(restarted.leases.status('second-browser','RM-RESTART'),'busy');
  assert.equal(restarted.leases.snapshot?.missionCount,1);
});

test('lease reserves at most three missions without recounting resume',()=>{
  const {leases}=fixture();
  leases.acquire();
  for(const id of ['RM-ONE','RM-TWO','RM-THREE']){
    assert.equal(leases.recordMission('owner-token',id).missionCount,['RM-ONE','RM-TWO','RM-THREE'].indexOf(id)+1);
    assert.equal(leases.finishMission('owner-token',id),true);
  }
  assert.throws(()=>leases.recordMission('owner-token','RM-FOUR'),/Maximum 3 missions/);
  assert.throws(()=>leases.recordMission('second-browser','RM-OTHER'),/Sandbox lease required/);
});

test('explicit release requires the owner and clears the lease',()=>{
  const {leases}=fixture();
  leases.acquire();
  assert.equal(leases.release('second-browser'),false);
  assert.equal(leases.release('owner-token'),true);
  assert.equal(leases.status(),'available');
});

test('sandbox cookies are host scoped, secure, long lived, and explicitly expirable',()=>{
  const header=sandboxCookie('opaque token',true);
  assert.match(header,/HttpOnly/);
  assert.match(header,/SameSite=Strict/);
  assert.match(header,/Secure/);
  assert.doesNotMatch(header,/Domain=/);
  assert.equal(cookieValue('other=1; '+header.split(';')[0]),'opaque token');
  assert.match(expiredSandboxCookie(true),/Max-Age=0/);
  assert.equal(SANDBOX_MAX_REIMBURSEMENT_TST,0.03);
});