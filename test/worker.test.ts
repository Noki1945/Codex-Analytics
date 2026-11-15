import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
test('worker imports multiple roots, isolates missing roots, and answers reports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'codex-worker-'));const sessions=join(root,'sessions'),archive=join(root,'archive');await mkdir(sessions);await mkdir(archive);
 const journal=(id:string)=>[{type:'session_meta',payload:{id}},{type:'event_msg',payload:{type:'task_started',turn_id:id}},{type:'event_msg',payload:{type:'task_complete'}}].map(e=>JSON.stringify({timestamp:'2026-01-01T00:00:00Z',...e})).join('\n')+'\n';
 await writeFile(join(sessions,'a.jsonl'),journal('a'));await writeFile(join(archive,'b.jsonl'),journal('b'));
 const worker=new Worker(resolve('dist/src/worker.js'),{workerData:{storage:join(root,'store'),wasm:resolve('dist/sql-wasm.wasm')}});
 let sequence=0;
 const call=(payload:any)=>new Promise<any>((resolve,reject)=>{const id=++sequence;const onMessage=(m:any)=>{if(m.id!==id)return;worker.off('message',onMessage);worker.off('error',onError);m.error?reject(Error(m.error)):resolve(m);};const onError=(e:Error)=>{worker.off('message',onMessage);reject(e);};worker.on('message',onMessage);worker.once('error',onError);worker.postMessage({id,...payload});});
 try{
  const imported=await call({directories:[sessions,archive,join(root,'missing')]});assert.equal(imported.tasks.length,2);assert.equal(imported.issues.length,1);
  const report=await call({mode:'analytics',payload:{ids:imported.tasks.map((t:any)=>t.id)}});assert.equal(report.type,'result');assert.equal(report.result.rows.length,8);
  const prediction=await call({mode:'forecast',payload:{input:{model:'unknown',category:'read',unit:'task',amount:1,retries:0,complexity:1},ids:[]}});assert.equal(prediction.result.five.n,0);
  const cached=await call({mode:'load'});assert.equal(cached.tasks.length,2);
  const again=await call({directories:[sessions,archive]});assert.equal(again.tasks.length,2);
 }finally{await worker.terminate();await rm(root,{recursive:true,force:true});}
});
