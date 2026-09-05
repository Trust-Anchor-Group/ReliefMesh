import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
async function post(path:string,body:unknown={}) {
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-ReliefMesh':'1'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error((await r.json()).error??'Request failed');
}
function Interaction({item,onError}:{item:any;onError:(s:string)=>void}) {
  const [values,setValues]=useState<Record<string,unknown>>({});
  const [busy,setBusy]=useState(false);
  const p=item.params;
  const respond=async(action:string)=>{
    setBusy(true);
    try{await post('/api/elicitation/'+item.id,{action,...(p.mode!=='url'?{content:values}:{})});}
    catch(e){onError((e as Error).message);setBusy(false);}
  };
  let safeUrl=false;try{const u=new URL(p.url);safeUrl=u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{}
  return <section className="action"><span className="eyebrow">ACTION REQUIRED · ACTOR {item.actor}</span><h2>{p.message}</h2>
    {p.mode==='url'?<><p>Enter information directly in the Neuro-hosted form. This application does not collect the form contents.</p>
      <p className="url">{p.url}</p>{safeUrl?<a className="button" href={p.url} target="_blank" rel="noreferrer">Open secure Neuro form ↗</a>:<p>Unsupported URL. Cancel this request.</p>}
      <p>After completing the hosted interaction, acknowledge it here if this request is still waiting.</p></>:
      <form onSubmit={e=>{e.preventDefault();void respond('accept');}}>{Object.entries(p.requestedSchema.properties??{}).map(([key,s]:[string,any])=><label key={key}>{s.title??key}{s.description&&<small>{s.description}</small>}
      {s.enum?<select required={p.requestedSchema.required?.includes(key)} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:e.target.value})}><option value="">Select…</option>{s.enum.map((v:string)=><option key={v}>{v}</option>)}</select>:
      s.type==='boolean'?<input type="checkbox" checked={values[key]===true} onChange={e=>setValues({...values,[key]:e.target.checked})}/>:
      ['string','number','integer'].includes(s.type)?<input type={s.type==='string'?'text':'number'} required={p.requestedSchema.required?.includes(key)} minLength={s.minLength} maxLength={s.maxLength} min={s.minimum} max={s.maximum} step={s.type==='integer'?1:'any'} value={String(values[key]??'')} onChange={e=>setValues({...values,[key]:s.type==='string'?e.target.value:Number(e.target.value)})}/>:<p>Unsupported field type. Please cancel.</p>}</label>)}
      <button disabled={busy}>Accept reviewed form</button></form>}
    <div className="buttons">{p.mode==='url'&&<button disabled={busy||!safeUrl} onClick={()=>respond('accept')}>I completed the secure form</button>}<button className="secondary" disabled={busy} onClick={()=>respond('decline')}>Decline</button><button className="secondary" disabled={busy} onClick={()=>respond('cancel')}>Cancel</button></div>
  </section>;
}
function App(){
  const [state,setState]=useState<any>();const [error,setError]=useState('');const [live,setLive]=useState(false);
  useEffect(()=>{const source=new EventSource('/api/events');source.onmessage=e=>{setState(JSON.parse(e.data));setLive(true);};source.onerror=()=>setLive(false);return()=>source.close();},[]);
  return <><header><a href="/setup" className="brand">RELIEF<span>MESH</span></a><span>AI Crisis Coordination</span><nav><a href="/setup">Setup</a><a href="/volunteer">Volunteer</a></nav></header><main>
    <div className="eyebrow">FIRSTBLOCK-ATHON · RUNTIME SETUP</div><h1>Connect the people.<br/>Then coordinate the response.</h1><p className="intro">Two independent Neuro participants, connected through MCP. Complete the secure onboarding before the live coordination test.</p>
    {!live&&<p role="status">Connecting to ReliefMesh backend…</p>}{error&&<p role="alert" className="error">{error}</p>}
    <div className="actors">{state?.actors.map((a:any)=><section key={a.id}><span className="eyebrow">ACTOR {a.id}</span><h2>{a.id==='A'?'Crisis Coordinator':'Volunteer'}</h2><dl><dt>MCP connection</dt><dd>{a.connected?'Connected':'Disconnected'}</dd><dt>Joined catalog</dt><dd>{a.tools} tools</dd><dt>Required tools</dt><dd>{a.requiredTools?'Present':'Not confirmed'}</dd><dt>Neuro readiness</dt><dd>{a.readiness}</dd></dl>
      {a.busy?<p role="status">In progress: {a.busy}</p>:<button disabled={!a.connected} onClick={()=>post('/api/actors/'+a.id+'/connect-neuro').catch(e=>setError(e.message))}>Connect {a.id==='B'?'volunteer':'coordinator'} to Neuro</button>}</section>)}</div>
    {state?.pending.map((item:any)=><Interaction key={item.id} item={item} onError={setError}/>)}
    <section><span className="eyebrow">TECHNICAL PROOF</span><h2>Trust activity</h2><p>ReliefMesh → official MCP client → Neuro-Ali STDIO → Neuro</p><p>Identity approval and cross-party verification are not yet confirmed.</p><ol className="events">{state?.events.slice().reverse().map((e:any,i:number)=><li key={i}><time>{new Date(e.timestamp).toLocaleTimeString()}</time><strong>Actor {e.actor}</strong><span>{e.operation}</span><span>{e.status}</span></li>)}</ol></section>
  </main><footer>Real operations only. No simulated Neuro results.</footer></>;
}
createRoot(document.getElementById('root')!).render(<App/>);

