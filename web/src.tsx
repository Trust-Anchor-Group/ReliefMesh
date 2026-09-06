import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {MissionView} from './mission';
async function post(path:string,body:unknown={}) {
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify(body)});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error??'Request failed');
  return result;
}
const clock=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
function Mark(){return <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><path d="M5 6h8v8H5zM16 6h8v8h-8zM5 17h8v8H5zM16 17h8v8h-8z" fill="currentColor"/><path d="M12 9h6M9 12v7M20 12v7M12 21h6" stroke="currentColor" strokeWidth="2"/></svg>}
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
  let safeUrl=false;try{const u=new URL(p.url);safeUrl=u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{}
  if(proposal)return <section className="action"><span className="eyebrow">YOUR EXPLICIT APPROVAL · ACTOR B</span><h2>Mission agreement ready</h2><p>{mission.request}</p><p>Role: <strong>Volunteer</strong></p><p>Signatures confirmed by resource: {mission.contract.signatures?.map((signature:any)=>signature.actor+' as '+signature.role).join(', ')||'None'}</p><p className="url">{mission.contract.id}</p><div className="buttons"><button disabled={busy} onClick={()=>respond('accept',{Accept:true})}>Sign as Volunteer</button><button className="secondary" disabled={busy} onClick={()=>respond('cancel')}>Cancel</button></div></section>;
  return <section className="action"><span className="eyebrow">ACTION REQUIRED · ACTOR {item.actor}</span><h2>Continue the secure interaction</h2><p className="preline">{p.message}</p>
    {p.mode==='url'?<><p>Complete this request in Neuro’s hosted form. Keep ReliefMesh running.</p>
      <p className="url">{p.url}</p>{safeUrl?<a className="button" href={p.url} target="_blank" rel="noreferrer">Open secure Neuro form ↗</a>:<p>Unsupported URL. Cancel this request.</p>}
      <p className="muted">Acknowledge below after completing the hosted form if this request is still waiting.</p></>:
      <form onSubmit={e=>{e.preventDefault();void respond('accept');}}>{fields.map(([key,s])=>{
        const options=s.enum?.map((v:string)=>({value:v,title:v}))??s.oneOf?.map((v:any)=>({value:v.const,title:v.title??v.const}));
        return <label key={key}>{s.title??key}{s.description&&<small>{s.description}</small>}
        {options?<select required={p.requestedSchema.required?.includes(key)} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:e.target.value})}><option value="">Select…</option>{options.map((v:any)=><option key={v.value} value={v.value}>{v.title}</option>)}</select>:
        s.type==='boolean'?<input type="checkbox" checked={values[key]===true} onChange={e=>setValues({...values,[key]:e.target.checked})}/>:
        s.type==='array'&&s.items?.enum?<select multiple value={(values[key]??[]) as string[]} onChange={e=>setValues({...values,[key]:Array.from(e.target.selectedOptions,o=>o.value)})}>{s.items.enum.map((v:string)=><option key={v}>{v}</option>)}</select>:
        ['string','number','integer'].includes(s.type)?<input type={s.type==='string'?'text':'number'} required={p.requestedSchema.required?.includes(key)} minLength={s.minLength} maxLength={s.maxLength} min={s.minimum} max={s.maximum} step={s.type==='integer'?1:'any'} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:s.type==='string'?e.target.value:Number(e.target.value)})}/>:<p>Unsupported field type. Please cancel.</p>}</label>;
      })}<button disabled={busy||unsupported}>Accept reviewed form</button></form>}
    <div className="buttons">{p.mode==='url'&&<button disabled={busy||!safeUrl} onClick={()=>respond('accept')}>I completed the secure form</button>}<button className="secondary" disabled={busy} onClick={()=>respond('decline')}>Decline</button><button className="secondary" disabled={busy} onClick={()=>respond('cancel')}>Cancel</button></div>
  </section>;
}
function App(){
  const route=location.pathname;
  const volunteer=route==='/volunteer', setup=route==='/setup';
  const [state,setState]=useState<any>();const [error,setError]=useState('');const [live,setLive]=useState(false);
  const [text,setText]=useState('');const [sending,setSending]=useState(false);
  const [addresses,setAddresses]=useState({A:'',B:''});
  useEffect(()=>{document.title='ReliefMesh · '+(setup?'Setup':volunteer?'Volunteer':'Coordinator');const source=new EventSource('/api/events');source.onmessage=e=>{setState(JSON.parse(e.data));setLive(true);};source.onerror=()=>setLive(false);return()=>source.close();},[]);
  const act=async(path:string,body:unknown={})=>{setError('');try{return await post(path,body);}catch(e){setError((e as Error).message);throw e;}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!text.trim()||sending)return;setSending(true);
    try{const result=await act(volunteer?'/api/messages/B':'/api/agent',volunteer?{body:text.trim(),operationId:crypto.randomUUID()}:{prompt:text.trim()});
      if(volunteer&&!result.success)setError('Neuro-Ali did not confirm the send. Check activity before retrying.');else setText('');
    }catch{}finally{setSending(false);}
  };
  const a=state?.actors?.find((v:any)=>v.id==='A'), b=state?.actors?.find((v:any)=>v.id==='B');
  const actorsReady=!!a?.connected&&!!b?.connected;
  const isReady=state?.proof?.REAL_TWO_WAY_MCP_MESSAGING==='PASS';
  const latest=state?.messages?.filter((m:any)=>m.actor==='A'&&m.direction==='incoming').slice(-1)[0];
  const items=volunteer?state?.messages?.filter((m:any)=>m.actor==='B'):state?.conversation;
  const show=volunteer?'B':'A';
  return <><header><a href="/" className="brand"><Mark/>RELIEF<span>MESH</span></a><span className="header-label">Trusted Mission Execution</span><nav aria-label="Main navigation"><a className={!setup&&!volunteer?'active':''} href="/">Coordinator</a><a className={volunteer?'active':''} href="/volunteer">Volunteer</a><a className={setup?'active':''} href="/setup">Setup</a></nav><span className={'connection '+(live?'online':'')}>{live?'Live connection':'Reconnecting'}</span></header>
    <main>
      <div className="page-heading"><div><span className="eyebrow">FIRSTBLOCK-ATHON / {setup?'RUNTIME & IDENTITY':volunteer?'HUMAN VOLUNTEER':'COORDINATION WORKSPACE'}</span><h1>{setup?'A real connection, at every step.':volunteer?'Your response makes a difference.':'From mission to trusted action.'}</h1><p className="intro">{setup?'Independent participants. Secure onboarding. Evidence from real MCP operations.':volunteer?'Messages from your coordinator, delivered through Neuro. Reply in your own words.':'The AI plans. MCP connects. Humans authorize. Neuro enforces.'}</p></div></div>
      {error&&<p role="alert" className="error">{error}</p>}
      {!live&&<p role="status" className="notice">Connecting to ReliefMesh. Actions are unavailable until the live connection returns.</p>}
      {live&&state&&!actorsReady&&<p role="status" className="notice">Waiting for both Neuro-Ali connections. If a session has failed, restart the idle ReliefMesh runtime before continuing.</p>}
      {state?.pending.filter((p:any)=>setup||p.actor===show).map((item:any)=><Interaction key={item.id} item={item} mission={state?.mission} onError={setError}/>)}
      {!setup&&<MissionView mission={state?.mission} ready={live&&actorsReady&&!state?.pending?.length} volunteer={volunteer} act={act}/>}
      {setup?<><div className="actors">{state?.actors.map((actor:any)=><section key={actor.id}><span className="eyebrow">ACTOR {actor.id}</span><h2>{actor.id==='A'?'Crisis Coordinator':'Solna Volunteer'}</h2><dl><dt>MCP</dt><dd>{actor.connected?'Connected':'Disconnected'}</dd><dt>Joined catalog</dt><dd>{actor.tools} tools</dd><dt>Required tools</dt><dd>{actor.requiredTools?'Present':'Not confirmed'}</dd><dt>Readiness</dt><dd>{actor.readiness}</dd></dl>{actor.busy&&<p role="status">In progress: {actor.busy}</p>}</section>)}</div>
      <section><span className="eyebrow">ACTOR B / SAME IDENTITY</span><h2>Volunteer onboarding</h2><p>Status: {state?.onboarding?.stage??'Credentials required'}</p>{state?.onboarding?.legalId&&<p className="url">LegalId: {state.onboarding.legalId}</p>}
      <div className="buttons">{!state?.onboarding?.credentialsConfirmed&&<button onClick={()=>void act('/api/actors/B/connect-neuro').catch(()=>{})}>Connect volunteer to Neuro</button>}
      {state?.onboarding?.credentialsConfirmed&&!state?.onboarding?.stage&&<button onClick={()=>void act('/api/actors/B/identity').catch(()=>{})}>Create volunteer identity once</button>}
      {state?.onboarding?.stage==='photo-required'&&<button onClick={()=>void act('/api/actors/B/photo').catch(()=>{})}>Add profile photo</button>}
      {state?.onboarding?.stage==='ready-to-submit'&&<button onClick={()=>void act('/api/actors/B/submit-approval').catch(()=>{})}>Submit for Lab approval</button>}
      {state?.onboarding?.stage==='waiting-for-lab-approval'&&<><p>WAITING FOR FIRSTBLOCK APPROVAL</p><button onClick={()=>void act('/api/actors/B/check-readiness').catch(()=>{})}>I have approved it</button></>}</div><p className="muted">Own-identity readiness does not establish cross-party verification.</p></section>
      {!state?.networkConfigured&&<section><h2>Participant addresses</h2><form onSubmit={e=>{e.preventDefault();void act('/api/network',addresses).catch(()=>{});}}><label>Coordinator XMPP address<input required value={addresses.A} onChange={e=>setAddresses({...addresses,A:e.target.value})}/></label><label>Volunteer XMPP address<input required value={addresses.B} onChange={e=>setAddresses({...addresses,B:e.target.value})}/></label><button>Save participants</button></form></section>}
      <section><span className="eyebrow">AI PROVIDER</span><h2>{state?.agent?.configured?'Provider configured':'Connect a real AI model'}</h2><p>{state?.agent?.configured?state.agent.provider+' · '+state.agent.model:'No model is configured. Neuro messaging remains available in the volunteer view.'}</p><p className="muted">Set AI_PROVIDER, AI_MODEL and OPENAI_API_KEY (or AI_API_KEY) in the backend environment. For compatible providers, also set AI_BASE_URL. Restart the idle backend after configuration. Never enter API keys here or in chat.</p></section>
      </>:<div className="workspace"><section className="conversation" hidden={!volunteer}><div className="section-head"><div><span className="eyebrow">{volunteer?'ACTOR B / HUMAN':'ACTOR A / AI ASSISTANT'}</span><h2>{volunteer?'Volunteer inbox':'Coordinator conversation'}</h2></div><span className="pill">{volunteer?(b?.connected?'MCP connected':'Offline'):(state?.agent?.configured?'AI configured':'AI setup required')}</span></div>
      {!volunteer&&!state?.agent?.configured&&<div className="notice"><strong>A real model is needed to coordinate.</strong><p>The two-way Neuro connection is proven. Configure your AI provider to turn natural language into MCP operations.</p><a href="/setup">Open setup →</a></div>}
      <div className="chat" aria-live="polite">{items?.length?items.map((m:any)=><article key={m.id} className={'bubble '+(volunteer?(m.direction==='outgoing'?'own':''):(m.role==='user'?'own':''))}><div className="bubble-meta"><strong>{volunteer?(m.direction==='outgoing'?'You · Volunteer':'Crisis Coordinator'):(m.role==='user'?'You':'ReliefMesh AI')}</strong><time>{clock(m.timestamp)}</time></div><p>{volunteer?m.body:m.content}</p>{volunteer&&<small>{m.direction==='incoming'?'Received through Neuro MCP':'Send accepted by Neuro-Ali'}</small>}</article>):<div className="empty"><div className="empty-icon">{volunteer?'↙':'↗'}</div><h3>{volunteer?'Ready for the first coordination request.':'What needs coordinating?'}</h3><p>{volunteer?'Incoming messages will appear here when Neuro-Ali receives them.':'Ask about availability, supplies, or transport. Every action uses the real participant connection.'}</p></div>}</div>
      {!volunteer&&<div className="suggestions">{['Ask the Solna volunteer whether she can deliver 30 blankets tonight.','Ask whether medical supplies can be transported too.'].map(prompt=><button className="suggestion" key={prompt} disabled={!state?.agent?.configured||state?.agent?.busy} onClick={()=>setText(prompt)}>{prompt} ↗</button>)}</div>}
      <form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="compose">{volunteer?'Reply to coordinator':'Ask the coordinator'}</label><textarea id="compose" maxLength={10000} value={text} onChange={e=>setText(e.target.value)} placeholder={volunteer?'Write your reply…':'Ask your coordinator…'} disabled={!live||(!volunteer&&!state?.agent?.configured)}/><div><span>{volunteer?'Your reply is sent to the coordinator through Neuro.':'AI chooses from the live Neuro-Ali MCP schemas.'}</span><button disabled={!live||!actorsReady||sending||!text.trim()||(!volunteer&&(!state?.agent?.configured||state.agent.busy))}>{sending?'Sending…':state?.agent?.busy&&!volunteer?'Working…':volunteer?'Send reply ↗':'Coordinate ↗'}</button></div></form></section>
      <aside><section><span className="eyebrow">PARTICIPANT NETWORK</span><div className="person"><div className="avatar">SV</div><div><h2>Solna Volunteer</h2><p>Human participant · Actor B</p></div></div><div className="fact"><span>Neuro-Ali MCP</span><strong>{b?.connected?'Connected':'Disconnected'}</strong></div><div className="fact"><span>Joined catalog</span><strong>{b?.tools??'—'} tools</strong></div><div className="fact"><span>Two-way test</span><strong>{isReady?'Passed':'Not proven'}</strong></div><div className="identity-note"><span className="tiny-dot"/><p>{state?.onboarding?.stage==='readiness-confirmed'?'Identity readiness confirmed through MCP.':'Identity onboarding in progress.'}<br/><span>{state?.mission?.trust?'Identity access verified for this mission.':'Cross-party identity access not yet verified.'}</span></p></div><a className="text-link" href={volunteer?'/':'/volunteer'}>{volunteer?'Open coordinator':'Open volunteer view'} ↗</a></section>
      {latest&&!volunteer&&<section><span className="eyebrow">LATEST REAL REPLY</span><p className="reply-text">{latest.body}</p><small>Received through Actor A MCP · {clock(latest.timestamp)}</small></section>}
      </aside></div>}
      <section className="activity"><div className="section-head"><div><span className="eyebrow">EVIDENCE, AS IT HAPPENS</span><h2>MCP activity</h2></div><span className="pill">{isReady?'Two-way MCP proven':'Awaiting proof'}</span></div><ol className="events">{state?.events?.slice(-12).reverse().map((e:any,i:number)=><li key={e.timestamp+i}><time>{clock(e.timestamp)}</time><strong>Actor {e.actor}</strong><span>{e.operation}</span><span className={'event-status '+(e.status==='success'?'good':'')}>{e.status}</span></li>)}</ol><details><summary>Technical proof <span>Open architecture & checks ↗</span></summary><div className="proof"><p>User → AI Agent → official MCP client → Neuro-Ali STDIO → Neuro</p><div className="proof-grid">{Object.entries(state?.proof??{}).filter(([key])=>key!=='correlation'&&key!=='status').map(([key,value])=><div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}<div><span>AI_AGENT_REAL_MCP_CALL</span><strong>{state?.agent?.realMcpCalls>0?'Executed — see activity':'Not yet proven'}</strong></div></div><p className="muted">No Agent API calls. No simulated Neuro results. Model text is separate from MCP evidence.</p></div></details></section>
    </main><footer><span>RELIEFMESH · FIRSTBLOCK-ATHON</span><span>Built for human coordination. Proven through MCP.</span></footer></>;
}
createRoot(document.getElementById('root')!).render(<App/>);

