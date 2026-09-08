import {createHash,randomBytes} from 'node:crypto';

export const SANDBOX_TTL_MS=30*60*1000;
export const SANDBOX_MAX_MISSIONS=3;
export const SANDBOX_MAX_REIMBURSEMENT_TST=0.03;
export const SANDBOX_COOKIE='reliefmesh_sandbox';

export type SandboxLeaseState={
  sessionId:string;
  createdAt:string;
  expiresAt:string;
  lastActivity:string;
  missionCount:number;
};

const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function isSandboxLeaseState(value:unknown):value is SandboxLeaseState{
  if(!value||typeof value!=='object')return false;
  const lease=value as SandboxLeaseState;
  return /^[a-f0-9]{64}$/.test(lease.sessionId)&&Number.isFinite(Date.parse(lease.createdAt))&&Number.isFinite(Date.parse(lease.expiresAt))&&Number.isFinite(Date.parse(lease.lastActivity))&&Number.isInteger(lease.missionCount)&&lease.missionCount>=0;
}

export function cookieValue(header:string|undefined,name=SANDBOX_COOKIE){
  for(const part of header?.split(';')??[]){
    const separator=part.indexOf('=');
    if(separator<0)continue;
    if(part.slice(0,separator).trim()===name){try{return decodeURIComponent(part.slice(separator+1).trim());}catch{return;}}
  }
}

export function sandboxCookie(token:string,secure:boolean,maxAgeSeconds=Math.floor(SANDBOX_TTL_MS/1000)){
  return `${SANDBOX_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure?'; Secure':''}`;
}

export class SandboxLeaseManager {
  private lease?:SandboxLeaseState;
  constructor(initial?:SandboxLeaseState,private now=()=>Date.now(),private issueToken=()=>randomBytes(32).toString('base64url')){
    if(initial)this.lease=structuredClone(initial);
  }
  get snapshot(){return this.lease?structuredClone(this.lease):undefined;}
  get expired(){return !!this.lease&&Date.parse(this.lease.expiresAt)<=this.now();}
  status(token?:string){
    if(!this.lease)return 'available' as const;
    if(this.expired)return 'expired' as const;
    return token&&tokenHash(token)===this.lease.sessionId?'owned' as const:'busy' as const;
  }
  acquire(existingToken?:string){
    if(this.status(existingToken)==='owned')return {token:existingToken!,lease:this.snapshot!};
    if(this.lease)throw new Error(this.expired?'Expired lease must be cleared safely':'Demo currently in use');
    const token=this.issueToken();
    const createdAt=new Date(this.now());
    this.lease={sessionId:tokenHash(token),createdAt:createdAt.toISOString(),expiresAt:new Date(createdAt.getTime()+SANDBOX_TTL_MS).toISOString(),lastActivity:createdAt.toISOString(),missionCount:0};
    return {token,lease:this.snapshot!};
  }
  authorize(token:string|undefined,touch=true){
    if(!token||this.status(token)!=='owned')return false;
    if(touch)this.lease!.lastActivity=new Date(this.now()).toISOString();
    return true;
  }
  recordMission(token:string|undefined){
    if(!this.authorize(token))throw new Error('Sandbox lease required');
    if(this.lease!.missionCount>=SANDBOX_MAX_MISSIONS)throw new Error('Maximum 3 missions per sandbox session');
    this.lease!.missionCount++;
    return this.snapshot!;
  }
  clearExpired(){
    if(!this.expired)return false;
    this.lease=undefined;
    return true;
  }
}