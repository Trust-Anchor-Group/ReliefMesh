import { Client, type Tool, type ElicitRequestParams, type ElicitResult } from '@modelcontextprotocol/client';
import {getDefaultEnvironment,StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import { neuroResult } from './result.js';
import { EventEmitter } from 'node:events';

export type ActorId = 'A' | 'B';
export type ActorState='STOPPED'|'STARTING'|'MCP_CONNECTING'|'READY'|'DEGRADED'|'RESTART_WAIT';
export type ActorFailureClass='process never started'|'process exited'|'persistence initialization'|'FILES_DB_SALT'|'XMPP login'|'session recovery'|'MCP initialize'|'tools/list'|'callback/listener'|'timeout'|'unknown';
export const EXPECTED_NEURO_TOOLS=68;

type ActorSession={client:Client;transport:StdioClientTransport};
export type SupervisorOptions={
  expectedTools?:number;
  startupTimeoutMs?:number;
  stableReadyMs?:number;
  heartbeatMs?:number;
  initialBackoffMs?:number;
  maxBackoffMs?:number;
  createSession?:(actor:NeuroActor)=>ActorSession;
};

export function neuroChildEnvironment(environment:NodeJS.ProcessEnv=process.env){
  const salt=environment.FILES_DB_SALT;
  return salt?{...getDefaultEnvironment(),FILES_DB_SALT:salt}:getDefaultEnvironment();
}

export function runtimeReady(actors:Record<ActorId,Pick<NeuroActor,'state'|'connected'|'tools'>>,networkConfigured:boolean,aiConfigured:boolean){
  return networkConfigured&&aiConfigured&&Object.values(actors).every(actor=>actor.state==='READY'&&actor.connected&&actor.tools.length===EXPECTED_NEURO_TOOLS);
}

export class NeuroActor extends EventEmitter {
  private client?:Client;
  private transport?:StdioClientTransport;
  private queue:Promise<unknown>=Promise.resolve();
  private supervision?:Promise<void>;
  private stopRequested=false;
  private failCurrent?: (failure:ActorFailureClass)=>void;
  private consecutiveFailures=0;
  private readonly expectedTools:number;
  private readonly startupTimeoutMs:number;
  private readonly stableReadyMs:number;
  private readonly heartbeatMs:number;
  private readonly initialBackoffMs:number;
  private readonly maxBackoffMs:number;
  private readonly createSession:(actor:NeuroActor)=>ActorSession;
  tools: Tool[] = [];
  connected = false;
  busy?: string;
  state:ActorState='STOPPED';
  attempt=0;
  lastTransition=new Date().toISOString();
  lastFailureClass?:ActorFailureClass;

  constructor(readonly id: ActorId, readonly dataDir: string, readonly port: number,private executable:string,
    private elicit: (actor: ActorId, params: ElicitRequestParams, signal: AbortSignal) => Promise<ElicitResult>,options:SupervisorOptions={}) {
    super();
    this.expectedTools=options.expectedTools??EXPECTED_NEURO_TOOLS;
    this.startupTimeoutMs=options.startupTimeoutMs??60_000;
    this.stableReadyMs=options.stableReadyMs??60_000;
    this.heartbeatMs=options.heartbeatMs??30_000;
    this.initialBackoffMs=options.initialBackoffMs??1_000;
    this.maxBackoffMs=options.maxBackoffMs??30_000;
    this.createSession=options.createSession??(actor=>actor.defaultSession());
  }

  private defaultSession():ActorSession{
    const client=new Client({name: 'reliefmesh-actor-' + this.id, version:'0.1.0'},
      {capabilities:{elicitation:{form:{},url:{}}}});
    const transport=new StdioClientTransport({command:'dotnet',
      args:[this.executable,'-d',this.dataDir,'-p',String(this.port)],
      env:neuroChildEnvironment(),stderr:'pipe'});
    return {client,transport};
  }

  get processRunning(){return this.transport?.pid!==null&&this.transport?.pid!==undefined;}

  private transition(state:ActorState,failure?:ActorFailureClass){
    this.state=state;
    this.lastTransition=new Date().toISOString();
    if(failure)this.lastFailureClass=failure;
    this.activity('supervisor',state.toLowerCase());
  }

  private activity(operation: string, status: string) {
    this.emit('activity', {actor:this.id, operation, status, timestamp:new Date().toISOString()});
  }

  start(){
    if(this.supervision)return;
    this.stopRequested=false;
    this.supervision=this.supervise().finally(()=>{this.supervision=undefined;});
  }

  async connect(){
    this.start();
    const deadline=Date.now()+this.startupTimeoutMs+this.maxBackoffMs;
    while(!this.connected&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    if(!this.connected)throw new Error('Actor startup timed out');
  }

  private async supervise(){
    while(!this.stopRequested){
      this.attempt++;
      this.transition('STARTING');
      let failure:ActorFailureClass|undefined;
      let active=true;
      let fail:(failure:ActorFailureClass)=>void=()=>{};
      const failed=new Promise<ActorFailureClass>(resolve=>{fail=value=>{if(active){active=false;resolve(value);}};});
      this.failCurrent=fail;
      try{
        const session=this.createSession(this);
        this.client=session.client;
        this.transport=session.transport;
        const send=this.transport.send.bind(this.transport);
        this.transport.send=(message)=>{
          if('method' in message&&message.method==='tools/call')this.activity('SIGN_TRACE_STDIO_SEND',String(message.params?.name??'unknown'));
          return send(message);
        };
        this.transport.stderr?.on('data',()=>{});
        this.client.setRequestHandler('elicitation/create', (request, context) =>
          this.elicit(this.id, request.params, context.mcpReq.signal));
        this.client.onclose=()=>fail(this.connected?'process exited':'MCP initialize');
        this.client.onerror=()=>fail(this.connected?'callback/listener':'MCP initialize');
        this.transition('MCP_CONNECTING');
        await this.client.connect(this.transport,{timeout:this.startupTimeoutMs});
        let tools:Tool[];
        try{tools=await this.fetchTools(this.client);}
        catch{throw new ActorStartupError('tools/list');}
        if(tools.length!==this.expectedTools)throw new ActorStartupError('tools/list');
        this.tools=tools;
        this.connected=true;
        this.transition('READY');
        this.activity('MCP connected','success');
        const readyClient=this.client;
        const stableTimer=setTimeout(()=>{this.consecutiveFailures=0;},this.stableReadyMs);
        stableTimer.unref?.();
        const heartbeat=setInterval(()=>{
          if(!this.connected||this.client!==readyClient)return;
          void this.enqueue(()=>this.fetchTools(readyClient)).then(tools=>{
            if(this.client!==readyClient)return;
            if(tools.length!==this.expectedTools)fail('tools/list');
            else this.tools=tools;
          }).catch(()=>{if(this.client===readyClient)fail('tools/list');});
        },this.heartbeatMs);
        heartbeat.unref?.();
        failure=await failed;
        clearTimeout(stableTimer);
        clearInterval(heartbeat);
      }catch(error){
        failure=error instanceof ActorStartupError?error.failure:this.classifyStartup(error);
      }
      active=false;
      this.failCurrent=undefined;
      this.connected=false;
      if(!this.stopRequested)this.transition('DEGRADED',failure??'unknown');
      await this.closeSession();
      if(this.stopRequested)break;
      this.consecutiveFailures++;
      const delay=Math.min(this.maxBackoffMs,this.initialBackoffMs*2**Math.max(0,this.consecutiveFailures-1));
      this.transition('RESTART_WAIT',failure??'unknown');
      await this.restartDelay(delay);
    }
    this.connected=false;
    this.transition('STOPPED');
  }

  private classifyStartup(error:unknown):ActorFailureClass{
    const message=error instanceof Error?error.message:'';
    if(/FILES_DB_SALT/i.test(message))return 'FILES_DB_SALT';
    if(/persist|database|data directory|decrypt/i.test(message))return 'persistence initialization';
    if(/xmpp|login|authentication/i.test(message))return 'XMPP login';
    if(/timeout|timed out/i.test(message))return 'timeout';
    if(!this.processRunning)return 'process never started';
    return 'MCP initialize';
  }

  private restartDelay(milliseconds:number){
    return new Promise<void>(resolve=>{
      const timer=setTimeout(resolve,milliseconds);
      timer.unref?.();
      this.once('stop',()=>{clearTimeout(timer);resolve();});
    });
  }

  private async fetchTools(client:Client){
    const tools: Tool[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listTools(cursor ? {cursor} : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('Repeated tools cursor');
      if (cursor) seen.add(cursor);
    } while(cursor);
    return tools;
  }

  private requireClient(){if(!this.connected||!this.client)throw new Error('Actor disconnected');return this.client;}

  async listTools() {return this.enqueue(()=>this.fetchTools(this.requireClient()));}
  async listResources() {
    return this.enqueue(async()=>{
      const client=this.requireClient();
      const resources=[];let cursor:string|undefined;const seen=new Set<string>();
      try{
        do {const page=await client.listResources(cursor?{cursor}:undefined);resources.push(...page.resources);cursor=page.nextCursor;
          if(cursor&&seen.has(cursor))throw new Error('Repeated resources cursor');if(cursor)seen.add(cursor);
        }while(cursor);return resources;
      }catch(error){this.observeSessionFailure(error,client);throw error;}
    });
  }
  async listResourceTemplates(){return this.enqueue(async()=>{const client=this.requireClient();try{return await client.listResourceTemplates();}catch(error){this.observeSessionFailure(error,client);throw error;}});}
  async readResource(uri:string){return this.enqueue(async()=>{const client=this.requireClient();try{const result=await client.readResource({uri,_meta:{'reliefmesh/format':'json'}});this.activity('resources/read','success');return result;}catch(error){this.observeSessionFailure(error,client);throw error;}});}
  async subscribeResource(uri:string){await this.enqueue(async()=>{const client=this.requireClient();try{await client.subscribeResource({uri});}catch(error){this.observeSessionFailure(error,client);throw error;}});this.activity('resources/subscribe','success');}
  async unsubscribeResource(uri:string){await this.enqueue(async()=>{const client=this.requireClient();try{await client.unsubscribeResource({uri});}catch(error){this.observeSessionFailure(error,client);throw error;}});this.activity('resources/unsubscribe','success');}

  private observeSessionFailure(error:unknown,client:Client){
    if(this.client!==client)return;
    const message=error instanceof Error?error.message:String(error);
    if(/connection closed|not connected|transport|EPIPE|ECONNRESET/i.test(message))this.failCurrent?.('session recovery');
  }

  private enqueue<T>(operation:()=>Promise<T>){
    const result=this.queue.then(operation);
    this.queue=result.catch(()=>{});return result;
  }

  callTool(name:string,args:Record<string,unknown>){
    this.activity('SIGN_TRACE_ACTOR_CALL_ENTER',name);
    return this.enqueue(()=>{this.activity('SIGN_TRACE_QUEUE_ACQUIRED',name);return this.executeTool(name,args);});
  }

  private async executeTool(name: string, args: Record<string,unknown>) {
    const client=this.requireClient();
    if (this.busy) throw new Error('Actor has a pending operation');
    if (!this.tools.some(tool => tool.name === name)) throw new Error('Unknown MCP tool');
    this.busy = name;
    this.activity(name, 'pending');
    try {
      const toolDefinition=this.tools.find(tool=>tool.name===name);
      this.activity('SIGN_TRACE_CLIENT_CALL_ENTER',name);
      const result = await client.callTool({name,arguments:args},
        {timeout:3_600_000,maxTotalTimeout:3_600_000,toolDefinition});
      this.activity(name, result.isError ? 'error' : neuroResult(result).Success===true?'success':'not-confirmed');
      return result;
    } catch(error) {this.activity(name,'error');this.observeSessionFailure(error,client);throw new Error('MCP call failed: ' + name,{cause:error});}
    finally {this.busy = undefined;}
  }

  private async closeSession(){
    const client=this.client;
    const transport=this.transport;
    this.client=undefined;
    this.transport=undefined;
    if(client)await Promise.allSettled([client.close()]);
    else if(transport)await Promise.allSettled([transport.close()]);
  }

  async close() {
    this.stopRequested=true;
    this.emit('stop');
    this.failCurrent?.('unknown');
    await this.closeSession();
    await this.supervision;
  }
}

class ActorStartupError extends Error{
  constructor(readonly failure:ActorFailureClass){super(failure);}
}


