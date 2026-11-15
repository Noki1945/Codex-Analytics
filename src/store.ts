import type {Database} from 'sql.js';
const initSqlJs:typeof import('sql.js').default = require('../sql-wasm.js');
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {openSync,writeFileSync,readFileSync,closeSync,unlinkSync} from 'node:fs';
import {Checkpoint} from './importer';
import {Task,finalize} from './core';
export class Store {
 private constructor(private db:Database,private path:string,private unlock:()=>void){}
 static async open(dir:string,wasm:string) {
  await mkdir(dir,{recursive:true});const lockPath=join(dir,'analytics.sqlite.lock');
  const acquire=()=>{const fd=openSync(lockPath,'wx');try{writeFileSync(fd,String(process.pid));}finally{closeSync(fd);}};
  try{acquire();}catch(e:any){
   if(e.code!=='EEXIST')throw e;
   const owner=Number(readFileSync(lockPath,'utf8'));let stale=false;
   if(Number.isSafeInteger(owner)&&owner>0){try{process.kill(owner,0);}catch(error:any){stale=error.code==='ESRCH';}}
   if(!stale)throw Error('База занята другим окном VS Code. Повторите импорт после завершения его работы.');
   try{unlinkSync(lockPath);}catch(error:any){if(error.code!=='ENOENT')throw error;}acquire();
  }
  let unlocked=false;const unlock=()=>{if(!unlocked){unlocked=true;try{unlinkSync(lockPath);}catch(e:any){if(e.code!=='ENOENT')throw e;}}};
  try{
   const SQL=await initSqlJs({locateFile:()=>wasm});let bytes:Buffer|undefined;
   try{bytes=await readFile(join(dir,'analytics.sqlite'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
   const db=new SQL.Database(bytes);
   if(bytes&&!db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").length){try{await writeFile(join(dir,'analytics.sqlite.v1.bak'),bytes,{flag:'wx'});}catch(e:any){if(e.code!=='EEXIST'){db.close();throw e;}}}
   db.run('CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, data TEXT NOT NULL)');return new Store(db,join(dir,'analytics.sqlite'),unlock);
  }catch(e){unlock();throw e;}
 }
 get(id:string):Checkpoint|undefined {const r=this.db.exec('SELECT data FROM checkpoints WHERE id = ?', [id]);return r.length?JSON.parse(String(r[0].values[0][0])):undefined;}
 sources():number{return Number(this.db.exec('SELECT COUNT(*) FROM checkpoints')[0].values[0][0]);}
 put(id:string,cp:Checkpoint){
  this.db.run('CREATE TABLE IF NOT EXISTS tasks (source TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(source,id))');
  const previous=this.get(id);this.db.run('BEGIN');
  try{
   if(previous&&(previous.generation??0)!==(cp.generation??0))this.db.run('DELETE FROM tasks WHERE source = ?',[id]);
   const statement=this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?,?,?)');
   try{for(const task of cp.state.tasks)statement.run([id,task.id,JSON.stringify(task)]);}finally{statement.free();}
   const compact={...cp,state:{...cp.state,tasks:[]}};
   this.db.run('INSERT OR REPLACE INTO checkpoints VALUES (?,?)',[id,JSON.stringify(compact)]);this.db.run('COMMIT');
  }catch(e){this.db.run('ROLLBACK');throw e;}
 }
 tasks():Task[]{
  const existing=this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  const stored:Task[]=existing.length?this.db.exec('SELECT data FROM tasks').flatMap(r=>r.values.map(row=>JSON.parse(String(row[0])))):[];
  const checkpoints=this.db.exec('SELECT data FROM checkpoints').flatMap(x=>x.values.flatMap(row=>{const s:Checkpoint=JSON.parse(String(row[0]));return [...s.state.tasks,...(s.state.current?[s.state.current]:[])];}));
  return finalize([...stored,...checkpoints]);
 }
 async save(){const temp=this.path+'.tmp';await writeFile(temp,this.db.export());await rename(temp,this.path);}
 close(){try{this.db.close();}finally{this.unlock();}}
}
