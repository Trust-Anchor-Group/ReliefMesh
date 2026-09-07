import React,{useState} from 'react';

const shortId=(value?:string)=>value?value.length>20?value.slice(0,8)+'...'+value.slice(-8):value:'Not available';
const contractValue=(mission:any,name:string)=>mission?.contract?.parameters?.find((parameter:any)=>parameter.Name===name)?.Value;
const signedBy=(mission:any,actor:string)=>mission?.contract?.signatures?.some((signature:any)=>signature.actor===actor);
export const contractDate=(value:unknown)=>new Date(typeof value==='number'&&value<10_000_000_000?value*1000:String(value));
const statusText=(mission:any)=>({TRUST_REQUIRED:'Verifying Volunteer…',TRUST_PENDING:'Waiting for Volunteer identity consent…',TRUSTED:'Contacting Volunteer…',WAITING_FOR_VOLUNTEER:'Waiting for Volunteer…',REPLY_RECEIVED:'Preparing agreement…',CONTRACT_CREATED:'Preparing agreement…',COORDINATOR_SIGNATURE_PENDING:'Agreement ready for signature',COORDINATOR_SIGNED:'Sending agreement to Volunteer…',VOLUNTEER_SIGNATURE_PENDING:'Waiting for Volunteer signature…',CONTRACT_SIGNED:'Preparing reimbursement…',FUNDING_REQUIRED:'Coordinator wallet needs funding',PAYMENT_PREPARED:'Payment approval required',PAYMENT_APPROVAL_PENDING:'Payment approval required',PAYMENT_PROCESSING:'Processing payment…',PAYMENT_COMPLETE:'Mission complete'} as Record<string,string>)[mission?.stage]??(mission?.busy?'Working through Neuro…':'Mission in progress');

function AgreementFacts({mission}:{mission:any}){
 const quantity=contractValue(mission,'Quantity');
 const item=contractValue(mission,'Item');
 const deadline=contractValue(mission,'Deadline');
 return <dl className="agreement-facts">
  <div><dt>Mission</dt><dd>{mission.request}</dd></div>
  <div><dt>Quantity / item</dt><dd>{quantity&&item?quantity+' '+item:'Defined in the agreement'}</dd></div>
  <div><dt>Destination</dt><dd>{contractValue(mission,'Destination')??'Defined in the agreement'}</dd></div>
    <div><dt>Deadline</dt><dd>{deadline?contractDate(deadline).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'Defined in the agreement'}</dd></div>
  <div><dt>Reimbursement</dt><dd>{mission.amount} {mission.currency||'TST'}</dd></div>
  <div><dt>Volunteer</dt><dd><span className="verified-mark">✓</span> Verified Volunteer</dd></div>
  {mission.contract?.id&&<div><dt>Contract ID</dt><dd title={mission.contract.id}>{shortId(mission.contract.id)}</dd></div>}
 </dl>;
}

function ApprovalCard({approval,mission,busy,ready,run}:{approval:any;mission:any;busy:boolean;ready:boolean;run:(path:string,body?:unknown)=>void}){
 const signing=approval.tool==='SignContract';
 const contractId=approval.contractId??approval.details?.contractId??mission.payment?.contractId;
 if(signing)return <section className="approval-card">
  <span className="eyebrow">COORDINATOR APPROVAL REQUIRED</span><h3>Review the mission agreement</h3>
  <AgreementFacts mission={mission}/>
  <div className="approval-footer"><p>Signing records your explicit consent in Neuro.</p><button disabled={busy||mission.busy||!ready} onClick={()=>run('/api/mission/approval/'+approval.id,{accept:true})}>Sign agreement</button></div>
 </section>;
 return <section className="approval-card payment-approval">
  <span className="eyebrow">PAYMENT APPROVAL REQUIRED</span><h3>Approve volunteer reimbursement</h3>
  <dl className="agreement-facts">
   <div><dt>Recipient</dt><dd>Verified Volunteer</dd></div><div><dt>Amount</dt><dd>{approval.details?.amount??mission.amount}</dd></div><div><dt>Currency</dt><dd>{approval.details?.currency??mission.currency}</dd></div>
   <div><dt>Signed agreement</dt><dd><span className="verified-mark">✓</span> Signed by both parties</dd></div>
   <div><dt>Payment condition</dt><dd><span className="verified-mark">✓</span> Bound to contract <span title={contractId}>{shortId(contractId)}</span></dd></div>
  </dl>
  <div className="approval-footer"><p>Neuro will process the prepared, contract-bound payment.</p><button disabled={busy||mission.busy||!ready} onClick={()=>run('/api/mission/approval/'+approval.id,{accept:true})}>Approve payment</button></div>
 </section>;
}

function TechnicalProof({mission}:{mission:any}){
 const coordinatorSigned=signedBy(mission,'A'),volunteerSigned=signedBy(mission,'B');
 const operations=[
  ['PetitionLegalIdentity',!!mission.trust],['SendChatMessage',!!mission.sent],['CreateOpenContract',!!mission.contract],
  ['SignContract / Coordinator',coordinatorSigned],['SignContract / Volunteer',volunteerSigned],
  ['CreatePaymentToLegalIdUri',!!mission.payment],['ProcessPaymentUri',!!mission.payment?.processed]
 ] as [string,boolean][];
 return <details className="technical-proof"><summary><span>Technical Proof</span><span className="proof-live">LIVE NEURO DATA · NO MOCKS</span></summary><div className="proof-body">
  <ul>{operations.map(([label,done])=><li key={label} className={done?'done':''}><span>{label}</span><strong>{done?'✓':'Pending'}</strong></li>)}</ul>
  <dl className="proof-facts">
   <div><dt>Mission ID</dt><dd>{mission.id}</dd></div><div><dt>Mission state</dt><dd>{mission.stage}</dd></div>
   {mission.contract&&<><div><dt>Contract ID</dt><dd title={mission.contract.id}>{shortId(mission.contract.id)}</dd></div><div><dt>State</dt><dd>{mission.contract.state}</dd></div><div><dt>Signatures</dt><dd>{mission.contract.signatures?.length??0} / 2</dd></div></>}
   <div><dt>Payment condition</dt><dd>{mission.payment?.contractId===mission.contract?.id?'Bound to signed contract ✓':'Not prepared'}</dd></div>
   {mission.payment?.transaction?.id&&<div><dt>Transaction ID</dt><dd title={mission.payment.transaction.id}>{shortId(mission.payment.transaction.id)}</dd></div>}
   {(mission.paymentBalances?.before?.A||mission.paymentInspection)&&<div><dt>Balance before</dt><dd>{mission.paymentBalances?.before?.A?.amount??mission.paymentInspection.actorA} / {mission.paymentBalances?.before?.B?.amount??mission.paymentInspection.actorB} {mission.currency}</dd></div>}
   {mission.balances?.A&&<div><dt>Balance after</dt><dd>{mission.balances.A.amount} / {mission.balances?.B?.amount??'—'} {mission.balances.A.currency}</dd></div>}
  </dl>
  {!!mission.events?.length&&<div className="proof-operations"><span>MCP operations</span>{mission.events.slice(-16).map((event:any,index:number)=><div key={event.timestamp+index}><code>{event.operation}</code><strong>{event.status}</strong></div>)}</div>}
  {mission.error&&<details className="technical-error"><summary>Technical error details</summary><p>{mission.error}</p></details>}
  <p className="proof-note">Sanitized MCP operations and authoritative resource results. Sensitive identity fields and payment instructions are never displayed.</p>
 </div></details>;
}

function MissionHistory({history,current}:{history:any[];current:any}){
 const entries=[...(history??[])].reverse();
 return <section className="mission-history"><div className="history-heading"><span className="eyebrow">MISSION HISTORY</span><strong>{entries.length+(current?.id?1:0)} total</strong></div>
  {current?.id&&<div className="history-row active"><span>{current.id}</span><strong>Active</strong><span>{contractValue(current,'Item')??current.request}</span></div>}
    {entries.map(entry=><details key={entry.id} className="history-entry"><summary><span>{entry.id}</span><strong className={entry.status==='Cancelled'?'cancelled':''}>{entry.status}</strong><span>{entry.quantity?entry.quantity+' ':''}{entry.item??entry.request}</span></summary><dl className="history-proof"><div><dt>Contract</dt><dd title={entry.contractId}>{shortId(entry.contractId)}</dd></div><div><dt>Contract state</dt><dd>{entry.contractState??'Not created'}</dd></div><div><dt>Signatures</dt><dd>{entry.signatureCount}</dd></div><div><dt>Payment condition</dt><dd>{entry.paymentCondition?'Verified ✓':'Not created'}</dd></div><div><dt>Transaction</dt><dd title={entry.transactionId}>{shortId(entry.transactionId)}</dd></div><div><dt>QuickResponse</dt><dd>{entry.quickResponse?'Reused ✓':'Not observed'}</dd></div>{entry.balancesBefore?.A&&<div><dt>Before A / B</dt><dd>{entry.balancesBefore.A.amount} / {entry.balancesBefore.B?.amount} {entry.currency}</dd></div>}{entry.balancesAfter?.A&&<div><dt>After A / B</dt><dd>{entry.balancesAfter.A.amount} / {entry.balancesAfter.B?.amount} {entry.currency}</dd></div>}</dl></details>)}
  {!entries.length&&!current?.id&&<p className="history-empty">Completed missions will appear here.</p>}
 </section>;
}

export function MissionView({mission,history,ready,volunteer,act}:{mission:any;history:any[];ready:boolean;volunteer:boolean;act:(path:string,body?:unknown)=>Promise<any>}){
 const [busy,setBusy]=useState(false);
 const run=async(path:string,body:unknown={})=>{if(busy)return;setBusy(true);try{await act(path,body);}catch{}finally{setBusy(false);}};
 const active=!!mission?.id;
 const coordinatorSigned=signedBy(mission,'A'),volunteerSigned=signedBy(mission,'B');
 const fullySigned=mission?.contract?.state==='Signed'&&coordinatorSigned&&volunteerSigned;
 const paymentApproved=mission?.approvals?.some((approval:any)=>approval.tool==='ProcessPaymentUri'&&approval.status==='complete');
 const steps=[
  ['Mission received',active],['Volunteer verified',!!mission?.trust],['Volunteer contacted',!!mission?.sent],['Volunteer accepted',!!mission?.reply],
  ['Agreement created',!!mission?.contract],['Coordinator signed',coordinatorSigned],['Volunteer signed',volunteerSigned],['Agreement fully signed',fullySigned],
  ['Reimbursement prepared',!!mission?.payment],['Payment approved',paymentApproved],['Payment completed',!!mission?.payment?.processed]
 ] as [string,boolean][];
 const current=steps.findIndex(([,done])=>!done);
 const pendingApprovals=mission?.approvals?.filter((approval:any)=>approval.actor===(volunteer?'B':'A')&&approval.status==='pending')??[];
 const quantity=contractValue(mission,'Quantity'),item=contractValue(mission,'Item'),destination=contractValue(mission,'Destination');
 const complete=!!mission?.payment?.processed;
 return <section className={'mission-workspace '+(complete?'mission-is-complete':'')}>
  <div className="mission-panel-head"><div><span className="eyebrow">MISSION PROGRESS</span><h2>{active?statusText(mission):'No active mission'}</h2></div>{active&&<span className="mission-id">{mission.id}</span>}</div>
  {active&&<>
   <ol className="mission-timeline">{steps.map(([label,done],index)=><li key={label} className={done?'complete':index===current?'current':'future'}><span className="timeline-marker">{done?'✓':index+1}</span><span>{label}</span></li>)}</ol>
   {volunteer&&mission.contract&&!complete&&<section className="volunteer-agreement-summary"><span className="eyebrow">AUTHORITATIVE AGREEMENT</span><AgreementFacts mission={mission}/><p className={coordinatorSigned?'signature-verified':'signature-pending'}>{coordinatorSigned?'✓ Coordinator signature verified':'Waiting for Coordinator signature'}</p></section>}
   {pendingApprovals.map((approval:any)=><ApprovalCard key={approval.id} approval={approval} mission={mission} busy={busy} ready={ready} run={(path,body)=>void run(path,body)}/>) }
    {!volunteer&&mission.contract&&(mission.contract.signatures?.length??0)===0&&!mission.payment&&<button className="discard-mission" disabled={busy||mission.busy} onClick={()=>void run('/api/mission/start-another')}>Discard unsigned mission</button>}
   {complete&&<section className="completion-card"><span className="completion-check">✓</span><span className="eyebrow">MISSION COMPLETE</span><h3>Mission complete ✓</h3><p>{quantity??''} {item??'Mission supplies'} <span>→</span> {destination??'Destination'}</p><ul><li>Volunteer: <strong>Verified ✓</strong></li><li>Agreement: <strong>Signed by both parties ✓</strong></li><li>Reimbursement: <strong>{mission.amount} {mission.currency} paid ✓</strong></li></ul><p className="completion-statement"><strong>AI coordinated the mission.</strong> Neuro controlled identity, consent, signatures and payment.</p>{!volunteer&&<button disabled={busy} onClick={()=>void run('/api/mission/start-another')}>{busy?'Preparing…':'Start another mission'}</button>}</section>}
   <TechnicalProof mission={mission}/>
  </>}
  <MissionHistory history={history} current={active&&!complete?mission:undefined}/>
 </section>;
}
