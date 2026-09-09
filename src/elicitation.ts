import type {ActorId} from './actor.js';
import {request as httpRequest} from 'node:http';
import type {IncomingHttpHeaders} from 'node:http';
import type {RequestHandler} from 'express';

export type ElicitationRouting = {
  publicOrigin:string;
  ports:Record<ActorId,number>;
};

const actorPath:Record<ActorId,string>={A:'coordinator',B:'volunteer'};
const hopByHopHeaders:(keyof IncomingHttpHeaders)[]=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];

export function publicElicitationUrl(actor:ActorId,value:unknown,routing:ElicitationRouting):string|undefined {
  if(typeof value!=='string')return undefined;

  let publicOrigin:string;
  try{publicOrigin=new URL(routing.publicOrigin).origin;}catch{return undefined;}

  const internal=/^http:\/\/(localhost|127\.0\.0\.1):(\d+)(\/MCP\/[^/?#]+)(\?[^#]*)?$/.exec(value);
  if(internal){
    if(Number(internal[2])!==routing.ports[actor])return undefined;
    return publicOrigin+'/neuro/'+actorPath[actor]+internal[3]+(internal[4]??'');
  }

  const prefix='/neuro/'+actorPath[actor];
  if(value.startsWith(publicOrigin+prefix+'/MCP/')){
    const suffix=value.slice((publicOrigin+prefix).length);
    if(/^\/MCP\/[^/?#]+(?:\?[^#]*)?$/.test(suffix))return value;
  }
  return undefined;
}

export function neuroElicitationTarget(method:string,originalUrl:string,routing:ElicitationRouting):{actor:ActorId;path:string;port:number}|undefined {
  if(method!=='GET'&&method!=='POST')return undefined;
  const match=/^\/neuro\/(coordinator|volunteer)(\/MCP\/[^/?#]+)(\?[^#]*)?$/.exec(originalUrl);
  if(!match)return undefined;
  const actor:ActorId=match[1]==='coordinator'?'A':'B';
  return {actor,path:match[2]+(match[3]??''),port:routing.ports[actor]};
}

function upstreamHeaders(headers:IncomingHttpHeaders,port:number,path:string){
  const result:IncomingHttpHeaders={...headers,host:'localhost:'+port};
  for(const name of [...hopByHopHeaders,'x-forwarded-for','x-forwarded-host','x-forwarded-proto'] as (keyof IncomingHttpHeaders)[])delete result[name];
  if(result.origin)result.origin='http://localhost:'+port;
  if(result.referer)result.referer='http://localhost:'+port+path;
  return result;
}

export function neuroElicitationProxy(routing:ElicitationRouting):RequestHandler {
  const publicUrl=new URL(routing.publicOrigin);
  return (req,res,next)=>{
    if(!req.originalUrl.startsWith('/neuro/')){next();return;}
    const target=neuroElicitationTarget(req.method,req.originalUrl,routing);
    if(!target){res.sendStatus(404);return;}
    if(req.headers.host!==publicUrl.host||(req.headers.origin&&req.headers.origin!==publicUrl.origin&&req.headers.origin!=='null')){res.sendStatus(403);return;}

    let upstream;
    try{
      upstream=httpRequest({hostname:'127.0.0.1',port:target.port,method:req.method,path:target.path,
        headers:upstreamHeaders(req.headers,target.port,target.path)},response=>{
        const headers:IncomingHttpHeaders={...response.headers};
        for(const name of hopByHopHeaders)delete headers[name];
        if(typeof headers.location==='string'){
          const location=publicElicitationUrl(target.actor,headers.location,routing);
          if(location)headers.location=location;
          else if(/^\/MCP\/[^/?#]+(?:\?[^#]*)?$/.test(headers.location))headers.location=publicUrl.origin+'/neuro/'+(target.actor==='A'?'coordinator':'volunteer')+headers.location;
        }
        headers['cache-control']='no-store';
        headers['referrer-policy']='no-referrer';
        headers['x-content-type-options']='nosniff';
        if(response.headers['content-type']?.startsWith('text/html')){
          const chunks:Buffer[]=[];let size=0;
          response.on('data',chunk=>{
            size+=chunk.length;
            if(size>2*1024*1024){response.destroy(new Error('Neuro elicitation response too large'));return;}
            chunks.push(chunk);
          });
          response.on('end',()=>{
            const role=target.actor==='A'?'coordinator':'volunteer';
            const publicAction=publicUrl.origin+'/neuro/'+role+target.path;
            let body=Buffer.concat(chunks).toString('utf8');
            for(const host of ['localhost','127.0.0.1']){
              const internalAction='http://'+host+':'+target.port+target.path;
              body=body.replaceAll(internalAction,publicAction).replaceAll(internalAction.replaceAll('&','&amp;'),publicAction.replaceAll('&','&amp;'));
            }
            const result=Buffer.from(body);
            headers['content-length']=String(result.length);
            res.writeHead(response.statusCode??502,headers);res.end(result);
          });
        }else{
          res.writeHead(response.statusCode??502,headers);
          response.pipe(res);
        }
      });
    }catch{res.sendStatus(502);return;}
    upstream.setTimeout(30_000,()=>upstream.destroy(new Error('Neuro elicitation timed out')));
    upstream.on('error',()=>{if(!res.headersSent)res.sendStatus(502);else res.destroy();});
    req.on('aborted',()=>upstream.destroy());
    req.pipe(upstream);
  };
}