import {parentPort,workerData} from 'node:worker_threads';
import {Store} from './store';
import {journals,importFile,hash} from './importer';
let queue=Promise.resolve();
parentPort!.on('message',m=>{queue=queue.then(async()=>{
 let store:Store|undefined;
 try {store=await Store.open(workerData.storage,workerData.wasm);let files=0;for await(const path of journals(m.directory)){const id=hash(path);store.put(id,await importFile(path,store.get(id)));files++;}await store.save();parentPort!.postMessage({id:m.id,tasks:store.tasks(),files});}
 catch(e){parentPort!.postMessage({id:m.id,error:e instanceof Error?e.message:String(e)});}finally{store?.close();}
 });});
