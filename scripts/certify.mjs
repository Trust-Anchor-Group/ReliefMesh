import {execFileSync} from 'node:child_process';
const s=await(await fetch('http://localhost:4317/api/status')).json();
const m=s.mission;
const out={BASELINE_FROZEN:execFileSync('git',['rev-parse','reliefmesh-messaging-demo-02751ee'],{encoding:'utf8'}).startsWith('02751ee')?'PASS':'FAIL'};
for(const a of s.actors){out['ACTOR_'+a.id+'_MCP']=a.connected?'PASS':'FAIL';out['ACTOR_'+a.id+'_TOOLS']=a.tools;}
const tools=await(await fetch('http://localhost:4317/api/actors/A/tools')).json();
out.UPDATED_TOOL_DISCOVERY=tools.length?'PASS':'FAIL';
out.IDENTITY_NEW_TOOLS_DISCOVERED=['CreateOpenContract','ProposeContract','SignContract'].every(n=>tools.some(t=>t.name===n))?'PASS':'FAIL';
out.IDENTITY_TRUST=m.trust?'PASS':'NOT_CERTIFIED';out.IDENTITY_QUICK_RESPONSE_AFTER_AUTHORIZATION=m.quickAfter?'PASS':'NOT_CERTIFIED';
out.CONTRACT_TEMPLATE=m.templates?.length?'PASS':'UNAVAILABLE';out.CONTRACT_CREATED=m.contract?.id?'PASS':'NOT_CERTIFIED';out.CONTRACT_FULLY_SIGNED=m.contract?.state==='Signed'&&m.contract?.signatures?.some(x=>x.actor==='A')&&m.contract?.signatures?.some(x=>x.actor==='B')?'PASS':'NOT_CERTIFIED';
for(const id of ['A','B'])out['ACTOR_'+id+'_BALANCE']=m.balances?.[id]?'PASS':'NOT_CERTIFIED';
out.CONDITIONAL_PAYMENT_CREATED=m.payment?'PASS':'NOT_CERTIFIED';out.PAYMENT_PROCESSED=m.payment?.processed?'PASS':'NOT_CERTIFIED';out.AI_MISSION_REAL_MCP=m.calls>0?'PASS':'NOT_CERTIFIED';out.DEMO_READY=out.IDENTITY_TRUST==='PASS'&&out.CONTRACT_FULLY_SIGNED==='PASS'&&out.PAYMENT_PROCESSED==='PASS'?'PASS':'NOT_CERTIFIED';
for(const [k,v]of Object.entries(out))console.log(k+'='+v);
if(out.DEMO_READY!=='PASS')process.exitCode=2;
