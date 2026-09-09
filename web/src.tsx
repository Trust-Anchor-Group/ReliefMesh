import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {contractDate,MissionView} from './mission';
const examples=[
  'Get 20 hygiene kits to the Solna emergency shelter before 18:00. Find a verified volunteer and reimburse 0.01 TST for transport.',
  'Get 10 boxes of first-aid supplies to the Solna field station before 17:00. Find a verified volunteer and reimburse 0.01 TST for transport.',
  'Arrange delivery of emergency food packages to the Solna shelter before 19:00. Use a verified volunteer and reimburse 0.01 TST for transport.'
];
async function post(path:string,body:unknown={}) {
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify(body)});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error??'Request failed');
  return result;
}
const clock=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const shortId=(value?:string)=>value?value.length>20?value.slice(0,8)+'...'+value.slice(-8):value:'Not available';
function publicElicitationUrl(actor:'A'|'B',value:unknown){
  if(typeof value!=='string')return undefined;
  const port=actor==='A'?'52482':'52483';
  const role=actor==='A'?'coordinator':'volunteer';
  const internal=new RegExp('^http://(?:localhost|127\\.0\\.0\\.1):'+port+'(/MCP/[^/?#]+)(\\?[^#]*)?$').exec(value);
  if(internal)return location.origin+'/neuro/'+role+internal[1]+(internal[2]??'');
  const prefix=location.origin+'/neuro/'+role;
  return value.startsWith(prefix+'/MCP/')&&/^\/MCP\/[^/?#]+(?:\?[^#]*)?$/.test(value.slice(prefix.length))?value:undefined;
}
function Mark(){return <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><path d="M5 6h8v8H5zM16 6h8v8h-8zM5 17h8v8H5zM16 17h8v8h-8z" fill="currentColor"/><path d="M12 9h6M9 12v7M20 12v7M12 21h6" stroke="currentColor" strokeWidth="2"/></svg>}
function Landing({access,activeMissionId,onStart}:{access:'loading'|'available'|'busy'|'owned';activeMissionId?:string;onStart:()=>void}){
  const busy=access==='busy';
  return <main className="landing"><section className="landing-hero"><span className="eyebrow">LIVE NEURO SANDBOX</span><h1>ReliefMesh</h1><p className="landing-lede">Give an AI a mission. Neuro provides the trust.</p><div className="landing-actions"><button disabled={busy||access==='loading'} onClick={onStart}>{access==='owned'?(activeMissionId?'Continue current mission':'Open workspace'):access==='loading'?'Checking availability…':'Try Live Sandbox'}</button><span><button className="secondary" disabled>Continue with Neuro</button><small>Coming soon</small></span></div><p className="sandbox-note">The sandbox uses temporary Lab identities and test TST. Messaging, MCP calls, contracts, signatures, and transactions are real.</p>{busy&&<div className="busy-banner" role="status"><strong>Demo currently in use</strong><p>One Coordinator and Volunteer pair share the live Neuro runtime. Availability updates automatically.</p></div>}</section><section className="landing-band" aria-label="Sandbox flow"><strong>Coordinator workspace</strong><span>Mission → trust → agreement → reimbursement</span><strong>Volunteer workspace</strong></section></main>;
}
function AccessPage({kind,onStart}:{kind:'loading'|'available'|'busy';onStart:()=>void}){
  if(kind==='loading')return <main className="access-page"><span className="eyebrow">LIVE NEURO SANDBOX</span><h1>Checking sandbox availability</h1></main>;
  return <Landing access={kind} onStart={onStart}/>;
}
function Interaction({item,mission,onError}:{item:any;mission:any;onError:(s:string)=>void}) {
  const p=item.params;
  const fields=Object.entries(p.requestedSchema?.properties??{}) as [string,any][];
  const [values,setValues]=useState<Record<string,unknown>>(()=>Object.fromEntries(fields.filter(([,s])=>s.default!==undefined||s.type==='boolean').map(([k,s])=>[k,s.default??false])));
  const [busy,setBusy]=useState(false);
  const unsupported=fields.some(([,s])=>!['string','boolean','number','integer'].includes(s.type)&&!(s.type==='array'&&s.items?.enum));
  const proposal=item.actor==='B'&&typeof p.message==='string'&&p.message.includes('contract proposal')&&p.message.includes(mission?.contract?.id??'NO_CONTRACT');
  const respond=async(action:string,content:Record<string,unknown>=values)=>{
    setBusy(true);
    try{await post('/api/elicitation/'+item.id,{action,...(p.mode!=='url'?{content}:{})});}
    catch(e){onError((e as Error).message);setBusy(false);}
  };
  const interactionUrl=p.mode==='url'?publicElicitationUrl(item.actor,p.url):undefined;
  if(proposal){const value=(name:string)=>mission.contract.parameters?.find((parameter:any)=>parameter.Name===name)?.Value;const deadline=value('Deadline');return <section className="approval-card volunteer-approval"><span className="eyebrow">VOLUNTEER APPROVAL REQUIRED</span><h2>Review the mission agreement</h2><dl className="agreement-facts"><div><dt>Mission</dt><dd>{mission.request}</dd></div><div><dt>Quantity / item</dt><dd>{value('Quantity')} {value('Item')}</dd></div><div><dt>Destination</dt><dd>{value('Destination')}</dd></div><div><dt>Deadline</dt><dd>{deadline?contractDate(deadline).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'Defined in the agreement'}</dd></div><div><dt>Reimbursement</dt><dd>{mission.amount} {mission.currency}</dd></div><div><dt>Volunteer</dt><dd><span className="verified-mark">✓</span> Verified Volunteer</dd></div><div><dt>Contract ID</dt><dd title={mission.contract.id}>{shortId(mission.contract.id)}</dd></div></dl><div className="approval-footer"><p>Signing records your explicit consent in Neuro.</p>{p.mode==='url'?(interactionUrl?<><a className="button" href={interactionUrl} target="_blank" rel="noreferrer">Open secure Neuro signing form ↗</a><button disabled={busy} onClick={()=>respond('accept')}>I completed signing</button></>:<p>Neuro returned an unsupported signing URL. Cancel this request.</p>):<button disabled={busy} onClick={()=>respond('accept',{Accept:true})}>Sign as Volunteer</button>}</div></section>}
  return <section className="action"><span className="eyebrow">ACTION REQUIRED · ACTOR {item.actor}</span><h2>Continue the secure interaction</h2><p className="preline">{p.message}</p>
    {p.mode==='url'?<><p>Complete this request in Neuro’s hosted form. Keep ReliefMesh running.</p>
      {interactionUrl?<a className="button" href={interactionUrl} target="_blank" rel="noreferrer">Open secure Neuro form ↗</a>:<p>Unsupported URL. Cancel this request.</p>}
      <p className="muted">Acknowledge below after completing the hosted form if this request is still waiting.</p></>:
      <form onSubmit={e=>{e.preventDefault();void respond('accept');}}>{fields.map(([key,s])=>{
        const options=s.enum?.map((v:string)=>({value:v,title:v}))??s.oneOf?.map((v:any)=>({value:v.const,title:v.title??v.const}));
        return <label key={key}>{s.title??key}{s.description&&<small>{s.description}</small>}
        {options?<select required={p.requestedSchema.required?.includes(key)} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:e.target.value})}><option value="">Select…</option>{options.map((v:any)=><option key={v.value} value={v.value}>{v.title}</option>)}</select>:
        s.type==='boolean'?<input type="checkbox" checked={values[key]===true} onChange={e=>setValues({...values,[key]:e.target.checked})}/>:
        s.type==='array'&&s.items?.enum?<select multiple value={(values[key]??[]) as string[]} onChange={e=>setValues({...values,[key]:Array.from(e.target.selectedOptions,o=>o.value)})}>{s.items.enum.map((v:string)=><option key={v}>{v}</option>)}</select>:
        ['string','number','integer'].includes(s.type)?<input type={s.type==='string'?'text':'number'} required={p.requestedSchema.required?.includes(key)} minLength={s.minLength} maxLength={s.maxLength} min={s.minimum} max={s.maximum} step={s.type==='integer'?1:'any'} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:s.type==='string'?e.target.value:Number(e.target.value)})}/>:<p>Unsupported field type. Please cancel.</p>}</label>;
      })}<button disabled={busy||unsupported}>Accept reviewed form</button></form>}
    <div className="buttons">{p.mode==='url'&&<button disabled={busy||!interactionUrl} onClick={()=>respond('accept')}>I completed the secure form</button>}<button className="secondary" disabled={busy} onClick={()=>respond('decline')}>Decline</button><button className="secondary" disabled={busy} onClick={()=>respond('cancel')}>Cancel</button></div>
  </section>;
}
function App(){
  const route=location.pathname;
  const landing=route==='/', volunteer=route==='/volunteer', setup=route==='/setup';
  const [access,setAccess]=useState<'loading'|'available'|'busy'|'owned'>('loading');
  const [activeMissionId,setActiveMissionId]=useState<string>();
  const [state,setState]=useState<any>();const [error,setError]=useState('');const [live,setLive]=useState(false);
  const [text,setText]=useState('');const [sending,setSending]=useState(false);
  const [addresses,setAddresses]=useState({A:'',B:''});
  useEffect(()=>{
    document.title=landing?'ReliefMesh · Live Sandbox':'ReliefMesh · '+(setup?'Setup':volunteer?'Volunteer':'Coordinator');
    let closed=false;let source:EventSource|undefined;
    const closeEvents=()=>{source?.close();source=undefined;setLive(false);};
    const openEvents=()=>{
      if(landing||source)return;
      source=new EventSource('/api/events');
      source.onmessage=event=>{if(!closed){setState(JSON.parse(event.data));setLive(true);}};
      source.onerror=()=>{if(!closed){setLive(false);void revalidate();}};
    };
    const revalidate=async()=>{
      try{
        const response=await fetch('/api/sandbox/session',{cache:'no-store'});
        if(!response.ok)throw new Error('Session check failed');
        const session=await response.json();
        if(closed)return;
        if(session.status==='owned'){
          setAccess('owned');setActiveMissionId(session.activeMissionId);openEvents();return;
        }
        closeEvents();setState(undefined);setActiveMissionId(undefined);setAccess(session.status==='busy'?'busy':'available');
      }catch{if(!closed)setLive(false);}
    };
    const onFocus=()=>{void revalidate();};
    const onVisibility=()=>{if(document.visibilityState==='visible')void revalidate();};
    void revalidate();
    const timer=window.setInterval(()=>void revalidate(),60_000);
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisibility);
    return()=>{closed=true;window.clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);source?.close();};
  },[route]);
  const startSandbox=async()=>{setError('');if(access==='owned'){location.assign('/coordinator');return;}try{const response=await post('/api/sandbox/lease');if(response.ok)location.assign('/coordinator');}catch(e){setAccess('busy');setError((e as Error).message);}};
  const releaseSandbox=async()=>{setError('');try{await post('/api/sandbox/release');location.assign('/');}catch(e){setError((e as Error).message);}};
  const act=async(path:string,body:unknown={})=>{setError('');try{return await post(path,body);}catch(e){setError((e as Error).message);throw e;}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!text.trim()||sending)return;setSending(true);
    try{const coordinatorPath=state?.mission?.id?'/api/agent':'/api/mission';const result=await act(volunteer?'/api/messages/B':coordinatorPath,volunteer?{body:text.trim(),operationId:crypto.randomUUID()}:{prompt:text.trim()});
      if(volunteer&&!result.success)setError('Neuro-Ali did not confirm the send. Check activity before retrying.');else setText('');
    }catch{}finally{setSending(false);}
  };
  const a=state?.actors?.find((v:any)=>v.id==='A'), b=state?.actors?.find((v:any)=>v.id==='B');
  const actorReady=(actor:any)=>actor?.state==='READY'&&actor?.connected&&actor?.tools===68;
  const actorConnection=(actor:any)=>actorReady(actor)?'connected':actor?.state==='RESTART_WAIT'?'reconnecting':actor?.state==='DEGRADED'?'recovering':actor?.state==='STOPPED'?'stopped':'connecting';
  const actorsReady=actorReady(a)&&actorReady(b);
  const isReady=state?.proof?.REAL_TWO_WAY_MCP_MESSAGING==='PASS';
  const latest=state?.messages?.filter((m:any)=>m.actor==='A'&&m.direction==='incoming').slice(-1)[0];
  const mission=state?.mission;
  const missionValue=(name:string)=>mission?.contract?.parameters?.find((parameter:any)=>parameter.Name===name)?.Value;
  const missionStatus=mission?.payment?.processed?`Mission complete ✓\n\n${missionValue('Quantity')??''} ${missionValue('Item')??'Mission supplies'} → ${missionValue('Destination')??'Destination'}\nVolunteer: Verified ✓\nAgreement: Signed by both parties ✓\nReimbursement: ${mission.amount} ${mission.currency} paid ✓`:(mission?.summary??'Mission received. I am coordinating the next trusted step.');
  const firstMissionEvent=mission?.events?.[0]?.timestamp??new Date().toISOString();
  const lastMissionEvent=mission?.events?.slice(-1)[0]?.timestamp??firstMissionEvent;
  const persistedConversation=mission?.id?[{id:mission.id+'-request',role:'user',content:mission.request,timestamp:firstMissionEvent},{id:mission.id+'-status',role:'assistant',content:missionStatus,timestamp:lastMissionEvent}]:[];
  const items=volunteer?state?.messages?.filter((message:any)=>message.actor==='B'):mission?.id?persistedConversation:[];
  const show=volunteer?'B':'A';
  if(landing)return <Landing access={access} activeMissionId={activeMissionId} onStart={startSandbox}/>;
  if(access!=='owned')return <AccessPage kind={access} onStart={startSandbox}/>;
  return <><header><a href="/coordinator" className="brand"><Mark/><span className="brand-copy"><strong>ReliefMesh</strong><small>AI-powered trusted mission coordination</small></span></a><span className="powered-by">Powered by Neuro MCP</span><nav aria-label="Main navigation"><a className={!setup&&!volunteer?'active':''} href="/coordinator">Coordinator</a><a className={volunteer?'active':''} href="/volunteer">Volunteer</a></nav><span className={'connection '+(live?'online':'')}>{live?'Live connection':'Reconnecting'}</span><button className="release-button" onClick={()=>void releaseSandbox()}>Release sandbox</button></header>
    <main>
      <div className="page-heading"><div><span className="eyebrow">LIVE SANDBOX / {setup?'SETUP & READINESS':volunteer?'VOLUNTEER WORKSPACE':'COORDINATOR WORKSPACE'}</span><h1>{setup?'Ready for trusted coordination.':volunteer?'Volunteer workspace':'Coordinator workspace'}</h1><p className="intro">{setup?'Reusable actors, identities, template and wallets for every mission.':volunteer?'Review real mission messages and agreements, then respond in your own words.':'Give the AI a mission. Neuro controls identity, consent, signatures and payment.'}</p></div>{state?.sandbox&&<div className="lease-summary"><strong>{state.sandbox.missionCount} / {state.sandbox.maxMissions} missions</strong><span>Up to {state.sandbox.maxReimbursement} TST each</span></div>}</div>
      {error&&<p role="alert" className="error">{error}</p>}
      {!live&&<p role="status" className="notice">Connecting to Neuro…</p>}
      {live&&state&&!actorsReady&&<div role="status" className="notice"><strong>Connecting Neuro participants…</strong><br/>Coordinator: {actorConnection(a)}<br/>Volunteer: {actorConnection(b)}</div>}
      {state?.pending.filter((p:any)=>setup||p.actor===show).map((item:any)=><Interaction key={item.id} item={item} mission={state?.mission} onError={setError}/>)}
      {setup?<><section className="readiness-card"><span className="eyebrow">SYSTEM READINESS</span><h2>ReliefMesh is ready for another mission</h2><dl className="readiness-list"><div><dt>Coordinator</dt><dd>{a?.connected?'Connected ✓':'Connecting…'}</dd></div><div><dt>Volunteer</dt><dd>{b?.connected?'Connected ✓':'Connecting…'}</dd></div><div><dt>Legal identities</dt><dd>{state?.readinessSummary?.identitiesReady?'Ready ✓':'Checking…'}</dd></div><div><dt>Neuro MCP</dt><dd>{actorsReady?'Ready · '+((a?.tools??0)+(b?.tools??0))+' actual tools':'Connecting…'}</dd></div><div><dt>Mission template</dt><dd>{state?.readinessSummary?.templateApproved?'Approved ✓':'Checking…'}</dd></div><div><dt>Coordinator wallet</dt><dd>{state?.readinessSummary?.coordinatorBalance?state.readinessSummary.coordinatorBalance.amount+' '+state.readinessSummary.coordinatorBalance.currency:'Checking…'}</dd></div></dl><p className={'ready-verdict '+(live&&actorsReady&&state?.networkConfigured&&state?.agent?.configured&&state?.readinessSummary?.identitiesReady&&state?.readinessSummary?.templateApproved?'ready':'')}>{live&&actorsReady&&state?.networkConfigured&&state?.agent?.configured&&state?.readinessSummary?.identitiesReady&&state?.readinessSummary?.templateApproved?'Ready to start ✓':'Completing readiness checks…'}</p><div className="buttons"><a className="button" href="/">Open Coordinator</a><a className="button secondary" href="/volunteer">Open Volunteer</a></div></section>
      <details className="developer-details"><summary>Developer details</summary><div className="actors">{state?.actors.map((actor:any)=><section key={actor.id}><span className="eyebrow">ACTOR {actor.id}</span><h2>{actor.id==='A'?'Coordinator':'Volunteer'}</h2><dl><dt>MCP</dt><dd>{actor.connected?'Connected':'Disconnected'}</dd><dt>Joined catalog</dt><dd>{actor.tools} tools</dd><dt>Required tools</dt><dd>{actor.requiredTools?'Present':'Not confirmed'}</dd><dt>Readiness</dt><dd>{actor.readiness}</dd></dl></section>)}</div><section><span className="eyebrow">AI PROVIDER</span><h2>{state?.agent?.configured?'Provider configured':'Provider configuration required'}</h2><p>{state?.agent?.configured?state.agent.provider+' · '+state.agent.model:'Configure the provider in the backend environment.'}</p></section>{!state?.networkConfigured&&<section><h2>Participant addresses</h2><form onSubmit={event=>{event.preventDefault();void act('/api/network',addresses).catch(()=>{});}}><label>Coordinator XMPP address<input required value={addresses.A} onChange={event=>setAddresses({...addresses,A:event.target.value})}/></label><label>Volunteer XMPP address<input required value={addresses.B} onChange={event=>setAddresses({...addresses,B:event.target.value})}/></label><button>Save participants</button></form></section>}</details>
      </>:<div className="workspace"><section className="conversation"><div className="section-head"><div><span className="eyebrow">{volunteer?'VOLUNTEER WORKSPACE':'COORDINATOR WORKSPACE'}</span><h2>{volunteer?'Mission conversation':mission?.id?'Mission coordination':'Give the AI a mission…'}</h2></div><span className="pill">{volunteer?(b?.connected?'MCP connected':'Offline'):(state?.agent?.configured?'GPT-4o-mini ready':'AI setup required')}</span></div>
      {!volunteer&&!state?.agent?.configured&&<div className="notice"><strong>A real model is needed to coordinate.</strong><p>The two-way Neuro connection is proven. Configure your AI provider to turn natural language into MCP operations.</p><a href="/setup">Open setup →</a></div>}
      <div className="chat" aria-live="polite">{items?.length?items.map((m:any)=><article key={m.id} className={'bubble '+(volunteer?(m.direction==='outgoing'?'own':''):(m.role==='user'?'own':''))}><div className="bubble-meta"><strong>{volunteer?(m.direction==='outgoing'?'You · Volunteer':'Crisis Coordinator'):(m.role==='user'?'You':'ReliefMesh AI')}</strong><time>{clock(m.timestamp)}</time></div><p>{volunteer?m.body:m.content}</p>{volunteer&&<small>{m.direction==='incoming'?'Received through Neuro MCP':'Send accepted by Neuro-Ali'}</small>}</article>):<div className="empty"><div className="empty-icon">{volunteer?'↙':'↗'}</div><h3>{volunteer?'Ready for the first coordination request.':'What needs coordinating?'}</h3><p>{volunteer?'Incoming messages will appear here when Neuro-Ali receives them.':'Ask about availability, supplies, or transport. Every action uses the real participant connection.'}</p></div>}</div>
      {!volunteer&&!mission?.id&&<div className="suggestions">{examples.map((prompt,index)=><button className="suggestion" key={prompt} disabled={!state?.agent?.configured} onClick={()=>setText(prompt)}><span>{index+1}</span>{prompt}</button>)}</div>}
      <form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="compose">{volunteer?'Reply to coordinator':mission?.id?'Ask the coordinator':'Give the AI a mission'}</label><textarea id="compose" maxLength={10000} value={text} onChange={e=>setText(e.target.value)} placeholder={volunteer?'Write your reply…':mission?.id?'Ask about this mission…':'Give the AI a mission…'} disabled={!live||(!volunteer&&!state?.agent?.configured)}/><div><span>{volunteer?'Your reply is sent through Neuro MCP.':mission?.id?'Mission actions use live Neuro MCP.':'Free text or an example starts a real mission.'}</span><button disabled={!live||!actorsReady||sending||!text.trim()||(!volunteer&&(!state?.agent?.configured||state.agent.busy))}>{sending?'Sending…':state?.agent?.busy&&!volunteer?'Working…':volunteer?'Send reply ↗':mission?.id?'Ask ReliefMesh':'Start mission'}</button></div></form></section>
      <aside><MissionView mission={state?.mission} history={state?.missionHistory??[]} ready={live&&actorsReady&&!state?.pending?.length} volunteer={volunteer} act={act}/><section className="participant-card"><span className="eyebrow">PARTICIPANT NETWORK</span><div className="person"><div className="avatar">SV</div><div><h2>Solna Volunteer</h2><p>Human participant · Actor B</p></div></div><div className="fact"><span>Neuro-Ali MCP</span><strong>{b?.connected?'Connected':'Disconnected'}</strong></div><div className="fact"><span>Two-way test</span><strong>{isReady?'Passed':'Not proven'}</strong></div><div className="identity-note"><span className="tiny-dot"/><p>{state?.mission?.trust?'Verified for this mission':'Identity verification pending'}</p></div><a className="text-link" href={volunteer?'/coordinator':'/volunteer'}>{volunteer?'Open Coordinator workspace':'Open Volunteer workspace'} ↗</a></section>
      {latest&&!volunteer&&<section><span className="eyebrow">LATEST REAL REPLY</span><p className="reply-text">{latest.body}</p><small>Received through Actor A MCP · {clock(latest.timestamp)}</small></section>}
      </aside></div>}
      {setup&&<section className="activity"><div className="section-head"><div><span className="eyebrow">EVIDENCE, AS IT HAPPENS</span><h2>MCP activity</h2></div><span className="pill">{isReady?'Two-way MCP proven':'Awaiting proof'}</span></div><ol className="events">{state?.events?.slice(-12).reverse().map((e:any,i:number)=><li key={e.timestamp+i}><time>{clock(e.timestamp)}</time><strong>Actor {e.actor}</strong><span>{e.operation}</span><span className={'event-status '+(e.status==='success'?'good':'')}>{e.status}</span></li>)}</ol><details><summary>Technical proof <span>Open architecture & checks ↗</span></summary><div className="proof"><p>User → AI Agent → official MCP client → Neuro-Ali STDIO → Neuro</p><div className="proof-grid">{Object.entries(state?.proof??{}).filter(([key])=>key!=='correlation'&&key!=='status').map(([key,value])=><div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}<div><span>AI_AGENT_REAL_MCP_CALL</span><strong>{state?.agent?.realMcpCalls>0?'Executed — see activity':'Not yet proven'}</strong></div></div><p className="muted">No Agent API calls. No simulated Neuro results. Model text is separate from MCP evidence.</p></div></details></section>}
    </main><footer><span>RELIEFMESH · FIRSTBLOCK-ATHON</span><span>Built for human coordination. Proven through MCP.</span></footer></>;
}
createRoot(document.getElementById('root')!).render(<App/>);

