// Synthetic load test only; no fixture records enter the user's analytics database.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Store}=require('../dist/src/store'),{initialState}=require('../dist/src/importer');
(async()=>{
 const count=Math.max(1000,Math.min(100000,Number(process.argv[2])||10000));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codex-analytics-benchmark-'));let store;
 try{
  const state=initialState('synthetic-load-test');
  state.tasks=Array.from({length:count},(_,i)=>({id:'fixture-'+i,session:'fixture',project:'fixture',model:'fixture',start:i*1000,end:i*1000+500,categories:['read'],tools:1,commands:1,tests:0,failures:0,repeatedReads:0,repeatedTests:0,complete:true,gaps:false,modelChanged:false,tokens:{input:100,cached:50,output:10}}));
  const checkpoint={offset:count,mtime:1,prefix:'fixture',prefixLength:7,generation:1,state};
  const start=performance.now();store=await Store.open(dir,path.resolve('dist/sql-wasm.wasm'));store.put('fixture',checkpoint);await store.save();
  assert.equal(store.get('fixture').state.tasks.length,0);assert.equal(store.tasks().length,count);
  const elapsed=performance.now()-start;store.close();store=await Store.open(dir,path.resolve('dist/sql-wasm.wasm'));
  assert.equal(store.tasks().length,count);assert.ok(JSON.stringify(store.get('fixture')).length<1000);
  console.log(JSON.stringify({syntheticTasks:count,writeAndReadMs:Math.round(elapsed),checkpointBytes:Buffer.byteLength(JSON.stringify(store.get('fixture'))),databaseBytes:(await fs.stat(path.join(dir,'analytics.sqlite'))).size}));
 }finally{store?.close();if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('codex-analytics-benchmark-'))await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1});
