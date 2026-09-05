import { Client, type Tool, type ElicitRequestParams, type ElicitResult } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { EventEmitter } from 'node:events';

export type ActorId = 'A' | 'B';
export class NeuroActor extends EventEmitter {
  readonly client: Client;
  private transport?: StdioClientTransport;
  tools: Tool[] = [];
  connected = false;
  busy?: string;
  constructor(readonly id: ActorId, readonly dataDir: string, readonly port: number,
    private elicit: (actor: ActorId, params: ElicitRequestParams, signal: AbortSignal) => Promise<ElicitResult>) {
    super();
    this.client = new Client({name: 'reliefmesh-actor-' + id, version:'0.1.0'},
      {capabilities:{elicitation:{form:{},url:{}}}});
    this.client.setRequestHandler('elicitation/create', (request, context) =>
      this.elicit(this.id, request.params, context.mcpReq.signal));
    this.client.onclose = () => { this.connected = false; this.activity('connection','closed'); };
    this.client.onerror = () => this.activity('protocol','error');
  }
  private activity(operation: string, status: string) {
    this.emit('activity', {actor:this.id, operation, status, timestamp:new Date().toISOString()});
  }
  async connect() {
    if (this.transport) throw new Error('Actor already started');
    this.transport = new StdioClientTransport({command:'dotnet',
      args:['C:\\Users\\alile\\NeuroAli\\bin\\Release\\net8.0\\NeuroAli.dll','-d',this.dataDir,'-p',String(this.port)],
      stderr:'pipe'});
    // Drain diagnostics without retaining potentially sensitive server output.
    this.transport.stderr?.on('data', () => {});
    try {
      await this.client.connect(this.transport, {timeout:60_000});
      this.connected = true;
      this.tools = await this.listTools();
      this.activity('MCP connected','success');
    } catch (error) { await this.close(); throw error; }
  }
  async listTools() {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.client.listTools(cursor ? {cursor} : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('Repeated tools cursor');
      if (cursor) seen.add(cursor);
    } while(cursor);
    return tools;
  }
  async callTool(name: string, args: Record<string, unknown>) {
    if (!this.connected) throw new Error('Actor disconnected');
    if (this.busy) throw new Error('Actor has a pending operation');
    if (!this.tools.some(tool => tool.name === name)) throw new Error('Unknown MCP tool');
    this.busy = name;
    this.activity(name, 'pending');
    try {
      const result = await this.client.callTool({name,arguments:args},
        {timeout:3_600_000,maxTotalTimeout:3_600_000});
      this.activity(name, result.isError ? 'error' : 'returned');
      return result;
    } catch { this.activity(name,'error'); throw new Error('MCP call failed: ' + name); }
    finally { this.busy = undefined; }
  }
  async close() {
    await this.client.close();
    this.connected = false;
  }
}


