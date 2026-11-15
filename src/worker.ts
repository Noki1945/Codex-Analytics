import {parentPort,workerData} from 'node:worker_threads';
import {Store} from './store';
import {journals,importFile,hash} from './importer';
let queue=Promise.resolve();
parentPort!.on('message',m=>{queue=queue.then(async()=>{
 let store:Store|undefined;
 try {store=await Store.open(workerData.storage,workerData.wasm);if(m.mode==='load'){parentPort!.postMessage({id:m.id,tasks:store.tasks(),files:store.sources(),issues:[]});return;}let files=0;const issues:string[]=[];for await(const path of journals(m.directory)){const id=hash(path);try{store.put(id,await importFile(path,store.get(id)));files++;}catch(e){issues.push(`Журнал ${id.slice(0,8)}: ${e instanceof Error?e.message:String(e)}`);}}await store.save();parentPort!.postMessage({id:m.id,tasks:store.tasks(),files,issues});}
 catch(e){parentPort!.postMessage({id:m.id,error:e instanceof Error?e.message:String(e)});}finally{store?.close();}
 });});
