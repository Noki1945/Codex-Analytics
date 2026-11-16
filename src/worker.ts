import {parentPort,workerData} from 'node:worker_threads';
import {Store} from './store';
import {journals,importFile,hash} from './importer';
import {Task,forecast} from './core';
import {report} from './reports';
import {stat} from 'node:fs/promises';
import {readTitles} from './titles';
let queue=Promise.resolve();
let cached:Task[]=[];
parentPort!.on('message',m=>{queue=queue.then(async()=>{
 if(m.mode==='forecast'||m.mode==='analytics'){
  try{const ids=Array.isArray(m.payload.ids)?new Set(m.payload.ids):undefined;const selected=ids?cached.filter(t=>ids.has(t.id)):cached;const result=m.mode==='forecast'?forecast(selected,m.payload.input,m.payload.remaining):report(cached,m.payload.ids);parentPort!.postMessage({type:'result',id:m.id,result});}
  catch(e){parentPort!.postMessage({type:'result',id:m.id,error:e instanceof Error?e.message:String(e)});}return;
 }
 let store:Store|undefined;
 try {
  store=await Store.open(workerData.storage,workerData.wasm);
  if(m.mode==='load'){cached=store.tasks();const titles=workerData.indexPath?await readTitles(workerData.indexPath):{};parentPort!.postMessage({id:m.id,tasks:cached,files:store.sources(),issues:[],titles});return;}
  let files=0;const issues:string[]=[];
  for(const directory of m.directories??[m.directory]){
   try{
    if(directory===m.optionalDirectory){try{await stat(directory);}catch(e:any){if(e.code==='ENOENT')continue;throw e;}}
    for await(const path of journals(directory)){const id=hash(path);try{store.put(id,await importFile(path,store.get(id)));files++;}catch(e){issues.push(`Журнал ${id.slice(0,8)}: ${e instanceof Error?e.message:String(e)}`);}}
   }catch(e){issues.push(`Каталог ${hash(directory).slice(0,8)}: ${e instanceof Error?e.message:String(e)}`);}
  }
  await store.save();cached=store.tasks();const titles=workerData.indexPath?await readTitles(workerData.indexPath):{};parentPort!.postMessage({id:m.id,tasks:cached,files,issues,titles});
 }
 catch(e){parentPort!.postMessage({id:m.id,error:e instanceof Error?e.message:String(e)});}finally{store?.close();}
 });});
