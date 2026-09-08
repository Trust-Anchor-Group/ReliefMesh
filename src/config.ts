import {resolve} from 'node:path';

function port(name:string,fallback:number){
  const value=Number(process.env[name]??fallback);
  if(!Number.isInteger(value)||value<1||value>65535)throw new Error(`${name} must be a valid TCP port`);
  return value;
}

export const runtimeDir=resolve(process.env.RELIEFMESH_RUNTIME_DIR??'.runtime');
export const runtimePath=(...parts:string[])=>resolve(runtimeDir,...parts);

export const config={
  host:process.env.RELIEFMESH_HOST??'127.0.0.1',
  port:port('RELIEFMESH_PORT',4317),
  publicOrigin:process.env.RELIEFMESH_PUBLIC_ORIGIN,
  publicSandbox:process.env.PUBLIC_SANDBOX!=='0',
  cookieSecure:process.env.SANDBOX_COOKIE_SECURE==='1'||process.env.RELIEFMESH_PUBLIC_ORIGIN?.startsWith('https://')===true,
  neuroAliDll:resolve(process.env.NEUROALI_DLL??'C:\\Users\\alile\\NeuroAli\\bin\\Release\\net8.0\\NeuroAli.dll'),
  neuroDataA:resolve(process.env.NEUROALI_DATA_A??'C:\\Users\\alile\\NeuroAli\\.neuroali-data'),
  neuroDataB:resolve(process.env.NEUROALI_DATA_B??'C:\\Users\\alile\\NeuroAli\\.neuroali-data-b'),
  neuroPortA:port('NEUROALI_PORT_A',52482),
  neuroPortB:port('NEUROALI_PORT_B',52483)
};