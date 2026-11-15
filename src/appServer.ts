import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {limits} from './importer';
// A separate read-only connection does not subscribe to other clients' turns.
export async function readLimits(executable:string):Promise<{limits:ReturnType<typeof limits>;credits:unknown}> {
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:child.stdout});let finished=false;
  const finish=(error?:Error,result?:any)=>{if(finished)return;finished=true;clearTimeout(timer);lines.close();child.kill();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(Error('App Server timeout (20 seconds)')),20000);
  child.on('error',e=>finish(e));child.on('exit',()=>finish(Error('App Server exited before responding')));child.stderr.resume();
  child.stdin.on('error',e=>finish(e));
  const send=(x:unknown)=>child.stdin.write(JSON.stringify(x)+'\n');
  lines.on('line',line=>{try{const m=JSON.parse(line);if(m.error)return finish(Error(String(m.error.message??'App Server error')));if(m.id===1){send({method:'initialized'});send({id:2,method:'account/rateLimits/read'});}if(m.id===2){const r=m.result;finish(undefined,{limits:limits(r.rateLimitsByLimitId?.codex??r.rateLimits,Date.now()),credits:r.rateLimits?.credits??null});}}catch{finish(Error('Invalid App Server response'));}});
  send({id:1,method:'initialize',params:{clientInfo:{name:'codex_analytics',title:'Codex Analytics',version:'0.1.0'}}});
 });
}
