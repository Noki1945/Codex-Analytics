import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store';
import {importFile} from '../src/importer';
test('SQLite persists checkpoints and reimport does not duplicate tasks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-sqlite-'));let store:Store|undefined;
 try{
  const p=join(dir,'session.jsonl'),at='2026-01-01T00:00:00Z';
  await writeFile(p,[{type:'session_meta',payload:{id:'s',cwd:'PRIVATE_PATH'}},{type:'event_msg',payload:{type:'task_started',turn_id:'t'}},{type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'c',arguments:'echo PRIVATE_CODE'}},{type:'event_msg',payload:{type:'task_complete'}}].map(e=>JSON.stringify({timestamp:at,...e})).join('\n')+'\n');
  store=await Store.open(dir,resolve('dist/sql-wasm.wasm'));store.put('hash',await importFile(p));await store.save();store.close();store=await Store.open(dir,resolve('dist/sql-wasm.wasm'));
  store.put('hash',await importFile(p,store.get('hash')));assert.equal(store.tasks().length,1);assert.ok(!JSON.stringify(store.get('hash')).includes('PRIVATE'));await store.save();
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
