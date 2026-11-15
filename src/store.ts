import type {Database} from 'sql.js';
const initSqlJs:typeof import('sql.js').default = require('../sql-wasm.js');
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Checkpoint} from './importer';
import {Task,finalize} from './core';
export class Store {
 private constructor(private db:Database,private path:string){}
 static async open(dir:string,wasm:string) {await mkdir(dir,{recursive:true});const SQL=await initSqlJs({locateFile:()=>wasm});let bytes:Buffer|undefined;try{bytes=await readFile(join(dir,'analytics.sqlite'));}catch(e:any){if(e.code!=='ENOENT')throw e;}const db=new SQL.Database(bytes);db.run('CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, data TEXT NOT NULL)');return new Store(db,join(dir,'analytics.sqlite'));}
 get(id:string):Checkpoint|undefined {const r=this.db.exec('SELECT data FROM checkpoints WHERE id = ?', [id]);return r.length?JSON.parse(String(r[0].values[0][0])):undefined;}
 put(id:string,cp:Checkpoint){this.db.run('INSERT OR REPLACE INTO checkpoints VALUES (?,?)',[id,JSON.stringify(cp)]);}
 tasks():Task[]{const r=this.db.exec('SELECT data FROM checkpoints');return finalize(r.flatMap(x=>x.values.flatMap(row=>{const s:Checkpoint=JSON.parse(String(row[0]));return [...s.state.tasks,...(s.state.current?[s.state.current]:[])];})));}
 async save(){const temp=this.path+'.tmp';await writeFile(temp,this.db.export());await rename(temp,this.path);}
 close(){this.db.close();}
}
