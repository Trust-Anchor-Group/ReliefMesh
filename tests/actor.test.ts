import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuroActor,runtimeReady,type ActorId} from '../src/actor.js';
import {Messaging} from '../src/messaging.js';

const tools=Array.from({length:68},(_,index)=>({name:index===0?'GetMessage':'Tool'+index,inputSchema:{type:'object' as const}}));
const waitFor=async(predicate:()=>boolean,timeout=2000)=>{
  const deadline=Date.now()+timeout;
  while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(predicate(),true,'condition did not converge');
};

type Plan={connectFailure?:boolean;toolsFailure?:boolean};
type Control={
  client:any;
  transport:any;
  failNextTools:boolean;
  running:boolean;
  startedAt:number;
  listCalls:number;
  resources:string[];
  exit:()=>void;
  protocolError:()=>void;
  resourceChanged:()=>void;
};

function actorHarness(id:ActorId,plans:Plan[]=[{}],resourceCacheTtlMs=300_000){
  const controls:Control[]=[];
  const actor=new NeuroActor(id,'persistent-'+id,52000+(id==='A'?1:2),'NeuroAli.dll',async()=>({action:'cancel'}),{
    startupTimeoutMs:100,stableReadyMs:30,heartbeatMs:15,initialBackoffMs:10,maxBackoffMs:40,resourceCacheTtlMs,
    createSession:()=>{
      const plan=plans[controls.length]??plans.at(-1)??{};
      const control={} as Control;
      const notifications=new Map<string,()=>void>();
      const client:any={
        setRequestHandler(){},
        setNotificationHandler(method:string,handler:()=>void){notifications.set(method,handler);},
        async connect(){if(plan.connectFailure)throw new Error('initialize failed');},
        async listTools(){if(plan.toolsFailure||control.failNextTools){control.failNextTools=false;throw new Error('transient tools/list');}return {tools};},
        async close(){await control.transport.close();},
        async listResources(){control.listCalls++;return {resources:control.resources.map(uri=>({uri,name:uri}))};},
        async listResourceTemplates(){return {resourceTemplates:[]};},
        async readResource(){return {contents:[]};},
        async subscribeResource(){},
        async unsubscribeResource(){},
        async callTool(){return {content:[]};}
      };
      let running=true;
      const transport:any={
        get pid(){return running?1000+controls.length:null;},
        async send(){},
        async close(){running=false;},
        stderr:null
      };
      Object.defineProperty(control,'running',{get:()=>running,set:value=>{running=value;}});
      Object.assign(control,{client,transport,failNextTools:false,listCalls:0,resources:[],startedAt:Date.now(),
        exit:()=>{running=false;client.onclose?.();},protocolError:()=>client.onerror?.(new Error('protocol failure')),
        resourceChanged:()=>notifications.get('notifications/resources/list_changed')?.()});
      controls.push(control);
      return {client,transport};
    }
  });
  return {actor,controls};
}

const ready=async(harness:ReturnType<typeof actorHarness>,attempt=1)=>{
  harness.actor.start();
  await waitFor(()=>harness.actor.state==='READY'&&harness.actor.attempt===attempt);
};

test('both independently supervised actors start successfully',async()=>{
  const a=actorHarness('A'),b=actorHarness('B');
  await Promise.all([ready(a),ready(b)]);
  assert.equal(runtimeReady({A:a.actor,B:b.actor},true,true),true);
  assert.equal(a.actor.tools.length,68);assert.equal(b.actor.tools.length,68);
  await Promise.all([a.actor.close(),b.actor.close()]);
});

for(const id of ['A','B'] as const)test('Actor '+id+' startup fails once then succeeds',async()=>{
  const harness=actorHarness(id,[{connectFailure:true},{}]);
  await ready(harness,2);
  assert.equal(harness.actor.lastFailureClass,'MCP initialize');
  assert.equal(harness.controls.length,2);
  await harness.actor.close();
});

for(const id of ['A','B'] as const)test('Actor '+id+' child exit after READY automatically recovers',async()=>{
  const harness=actorHarness(id);
  await ready(harness);
  harness.controls[0].exit();
  await waitFor(()=>harness.actor.state!=='READY');
  await waitFor(()=>harness.actor.state==='READY'&&harness.actor.attempt===2);
  assert.equal(harness.actor.lastFailureClass,'process exited');
  await harness.actor.close();
});

test('MCP protocol failure closes the failed session and reconnects',async()=>{
  const harness=actorHarness('A');
  await ready(harness);
  harness.controls[0].protocolError();
  await waitFor(()=>harness.actor.state==='READY'&&harness.actor.attempt===2);
  assert.equal(harness.actor.lastFailureClass,'callback/listener');
  assert.equal(harness.controls[0].running,false);
  await harness.actor.close();
});

test('transient tools/list failure triggers automatic recovery',async()=>{
  const harness=actorHarness('B');
  await ready(harness);
  harness.controls[0].failNextTools=true;
  await waitFor(()=>harness.actor.state==='READY'&&harness.actor.attempt===2);
  assert.equal(harness.actor.lastFailureClass,'tools/list');
  assert.equal(harness.actor.tools.length,68);
  await harness.actor.close();
});

test('strict readiness falls during failure and returns after recovery',async()=>{
  const a=actorHarness('A'),b=actorHarness('B');
  await Promise.all([ready(a),ready(b)]);
  assert.equal(runtimeReady({A:a.actor,B:b.actor},true,true),true);
  b.controls[0].exit();
  await waitFor(()=>runtimeReady({A:a.actor,B:b.actor},true,true)===false);
  assert.equal(a.actor.state,'READY');
  await waitFor(()=>runtimeReady({A:a.actor,B:b.actor},true,true)===true);
  await Promise.all([a.actor.close(),b.actor.close()]);
});

test('retries use bounded exponential backoff',async()=>{
  const harness=actorHarness('A',[{connectFailure:true},{connectFailure:true},{connectFailure:true},{connectFailure:true},{}]);
  await ready(harness,5);
  const gaps=harness.controls.slice(1).map((control,index)=>control.startedAt-harness.controls[index].startedAt);
  assert.ok(gaps[0]>=8&&gaps[1]>=18&&gaps[2]>=35&&gaps[3]>=35,String(gaps));
  assert.ok(gaps.every(gap=>gap<100),String(gaps));
  assert.equal(harness.actor.listenerCount('stop'),0);
  await harness.actor.close();
});

test('one actor failure does not restart the healthy actor',async()=>{
  const a=actorHarness('A'),b=actorHarness('B');
  await Promise.all([ready(a),ready(b)]);
  b.controls[0].exit();
  await waitFor(()=>b.actor.state==='READY'&&b.actor.attempt===2);
  assert.equal(a.actor.attempt,1);
  assert.equal(a.actor.state,'READY');
  await Promise.all([a.actor.close(),b.actor.close()]);
});

test('readiness requires network, AI, two READY actors, and exactly 68 tools',async()=>{
  const a=actorHarness('A'),b=actorHarness('B');
  await Promise.all([ready(a),ready(b)]);
  assert.equal(runtimeReady({A:a.actor,B:b.actor},false,true),false);
  assert.equal(runtimeReady({A:a.actor,B:b.actor},true,false),false);
  a.actor.tools.pop();
  assert.equal(runtimeReady({A:a.actor,B:b.actor},true,true),false);
  await Promise.all([a.actor.close(),b.actor.close()]);
});

test('receive polling reuses actor-local message catalogs and refreshes only the actor that changed',async()=>{
  const a=actorHarness('A'),b=actorHarness('B');
  await Promise.all([ready(a),ready(b)]);
  const messaging=new Messaging({A:a.actor,B:b.actor},()=>{});
  messaging.network={A:'coordinator@example.invalid',B:'volunteer@example.invalid'};
  for(const [control,from] of [[a.controls[0],'volunteer@example.invalid'],[b.controls[0],'coordinator@example.invalid']] as const)
    control.client.callTool=async({arguments:args}:any)=>({content:[],structuredContent:{result:{Success:true,FromBareJid:from,Body:String(args.MessageId)}}});
  for(let i=0;i<5;i++)await Promise.all([messaging.receive('A'),messaging.receive('B')]);
  assert.equal(a.controls[0].listCalls,1);
  assert.equal(b.controls[0].listCalls,1);

  a.controls[0].resources=['mid:a'];a.controls[0].resourceChanged();
  await messaging.receive('A');
  assert.equal(a.controls[0].listCalls,2);
  assert.equal(b.controls[0].listCalls,1);
  assert.deepEqual(messaging.messages.map(message=>message.id),['mid:a']);
  b.controls[0].resources=['mid:b'];b.controls[0].resourceChanged();
  await messaging.receive('B');
  for(let i=0;i<5;i++)await Promise.all([messaging.receive('A'),messaging.receive('B')]);
  assert.equal(a.controls[0].listCalls,2);
  assert.equal(b.controls[0].listCalls,2);
  assert.deepEqual(messaging.messages.map(message=>message.id),['mid:a','mid:b']);

  await a.actor.listResources();
  assert.equal(a.controls[0].listCalls,3,'explicit inspection still makes a fresh list call');
  a.controls[0].exit();
  await waitFor(()=>a.actor.state==='READY'&&a.actor.attempt===2);
  assert.equal(a.controls[1].listCalls,1,'reconnect discovers the new session once');
  assert.equal(b.controls[0].listCalls,2,'healthy actor remains isolated');
  await Promise.all([a.actor.close(),b.actor.close()]);
});

test('missing message invalidates its catalog once and TTL eventually refreshes a quiet cache',async()=>{
  const harness=actorHarness('A',[{}],30);
  await ready(harness);
  const control=harness.controls[0];
  const messaging=new Messaging({A:harness.actor,B:harness.actor},()=>{});
  messaging.network={A:'coordinator@example.invalid',B:'volunteer@example.invalid'};
  control.resources=['mid:gone'];control.resourceChanged();
  control.client.callTool=async()=>({content:[],structuredContent:{result:{Success:false,Message:'Message not found.'}}});
  await messaging.receive('A');
  assert.equal(control.listCalls,2);
  await messaging.receive('A');
  assert.equal(control.listCalls,3,'invalid ID causes one refresh');
  await messaging.receive('A');
  assert.equal(control.listCalls,3,'same invalid ID does not cause a discovery loop');
  await new Promise(resolve=>setTimeout(resolve,45));
  await messaging.receive('A');
  assert.equal(control.listCalls,4,'TTL refreshes if no notification arrives');
  await harness.actor.close();
});
