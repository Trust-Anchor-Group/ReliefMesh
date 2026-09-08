import {createHash,randomBytes} from 'node:crypto';

const positiveDuration=(name:string,fallback:number)=>{
  const configured=process.env[name];
  if(configured===undefined)return fallback;
  const value=Number(configured);
  if(!Number.isFinite(value)||value<=0)throw new Error(`${name} must be a positive duration in milliseconds`);
  return value;
};
export const SANDBOX_ACTIVITY_TTL_MS=positiveDuration('SANDBOX_ACTIVITY_TTL_MS',10*60*1000);
export const SANDBOX_OWNER_TTL_MS=positiveDuration('SANDBOX_OWNER_TTL_MS',24*60*60*1000);
export const SANDBOX_ACTIVE_MISSION_GRACE_MS=positiveDuration('SANDBOX_ACTIVE_MISSION_GRACE_MS',2*60*60*1000);
export const SANDBOX_MAX_MISSIONS=3;
export const SANDBOX_MAX_REIMBURSEMENT_TST=0.03;
export const SANDBOX_COOKIE='reliefmesh_sandbox';

export type SandboxLeaseState={
  sessionId:string;
  createdAt:string;
  activityExpiresAt:string;
  ownerExpiresAt:string;
  activeMissionId?:string;
  missionExpiresAt?:string;
  lastActivity:string;
  missionCount:number;
};
type LeaseDurations={activity:number;owner:number;mission:number};

const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function isSandboxLeaseState(value:unknown):value is SandboxLeaseState{
  if(!value||typeof value!=='object')return false;
  const lease=value as SandboxLeaseState;
  return /^[a-f0-9]{64}$/.test(lease.sessionId)&&Number.isFinite(Date.parse(lease.createdAt))&&Number.isFinite(Date.parse(lease.activityExpiresAt))&&Number.isFinite(Date.parse(lease.ownerExpiresAt))&&Number.isFinite(Date.parse(lease.lastActivity))&&Number.isInteger(lease.missionCount)&&lease.missionCount>=0&&
    (lease.activeMissionId===undefined||typeof lease.activeMissionId==='string'&&lease.activeMissionId.length>0&&Number.isFinite(Date.parse(lease.missionExpiresAt??'')));
}

export function cookieValue(header:string|undefined,name=SANDBOX_COOKIE){
  for(const part of header?.split(';')??[]){
    const separator=part.indexOf('=');
    if(separator<0)continue;
    if(part.slice(0,separator).trim()===name){try{return decodeURIComponent(part.slice(separator+1).trim());}catch{return;}}
  }
}

export function sandboxCookie(token:string,secure:boolean,maxAgeSeconds=Math.floor(SANDBOX_OWNER_TTL_MS/1000)){
  return `${SANDBOX_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure?'; Secure':''}`;
}
export function expiredSandboxCookie(secure:boolean){return sandboxCookie('',secure,0);}

export class SandboxLeaseManager {
  private lease?:SandboxLeaseState;
  constructor(initial?:SandboxLeaseState,private now=()=>Date.now(),private issueToken=()=>randomBytes(32).toString('base64url'),private durations:LeaseDurations={activity:SANDBOX_ACTIVITY_TTL_MS,owner:SANDBOX_OWNER_TTL_MS,mission:SANDBOX_ACTIVE_MISSION_GRACE_MS}){
    if(initial)this.lease=structuredClone(initial);
  }
  get snapshot(){return this.lease?structuredClone(this.lease):undefined;}
  private matches(token?:string){return !!token&&!!this.lease&&tokenHash(token)===this.lease.sessionId;}
  private missionProtected(activeMissionId?:string){return !!activeMissionId&&this.lease?.activeMissionId===activeMissionId&&Date.parse(this.lease.missionExpiresAt??'')>this.now();}
  status(token?:string,activeMissionId?:string){
    if(!this.lease)return 'available' as const;
    const activityActive=Date.parse(this.lease.activityExpiresAt)>this.now();
    const ownerActive=Date.parse(this.lease.ownerExpiresAt)>this.now();
    const matchingOwner=this.matches(token)&&ownerActive;
    if(matchingOwner&&(activityActive||this.missionProtected(activeMissionId)))return 'owned' as const;
    if(activityActive||this.missionProtected(activeMissionId))return 'busy' as const;
    return 'expired' as const;
  }
  acquire(){
    if(this.lease)throw new Error('Existing lease must be released or cleared safely');
    const token=this.issueToken();
    const createdAt=new Date(this.now());
    this.lease={sessionId:tokenHash(token),createdAt:createdAt.toISOString(),activityExpiresAt:new Date(createdAt.getTime()+this.durations.activity).toISOString(),ownerExpiresAt:new Date(createdAt.getTime()+this.durations.owner).toISOString(),lastActivity:createdAt.toISOString(),missionCount:0};
    return {token,lease:this.snapshot!};
  }
  authorize(token:string|undefined,activeMissionId?:string,touch=true){
    if(!token||this.status(token,activeMissionId)!=='owned')return false;
    if(touch){
      const now=this.now();
      this.lease!.lastActivity=new Date(now).toISOString();
      this.lease!.activityExpiresAt=new Date(now+this.durations.activity).toISOString();
      this.lease!.ownerExpiresAt=new Date(now+this.durations.owner).toISOString();
      if(activeMissionId&&this.lease!.activeMissionId===activeMissionId)this.lease!.missionExpiresAt=new Date(now+this.durations.mission).toISOString();
    }
    return true;
  }
  recordMission(token:string|undefined,missionId:string){
    if(!missionId||!this.authorize(token))throw new Error('Sandbox lease required');
    if(this.lease!.missionCount>=SANDBOX_MAX_MISSIONS)throw new Error('Maximum 3 missions per sandbox session');
    this.lease!.missionCount++;
    this.lease!.activeMissionId=missionId;
    this.lease!.missionExpiresAt=new Date(this.now()+this.durations.mission).toISOString();
    return this.snapshot!;
  }
  finishMission(token:string|undefined,missionId:string){
    if(!this.authorize(token,missionId)||this.lease!.activeMissionId!==missionId)return false;
    delete this.lease!.activeMissionId;
    delete this.lease!.missionExpiresAt;
    return true;
  }
  clearExpired(activeMissionId?:string){
    if(this.status(undefined,activeMissionId)!=='expired')return false;
    this.lease=undefined;
    return true;
  }
  release(token:string|undefined,activeMissionId?:string){
    if(!this.authorize(token,activeMissionId,false))return false;
    this.lease=undefined;
    return true;
  }
}