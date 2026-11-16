import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
export async function readTitles(path:string):Promise<Record<string,string>>{
 const titles:Record<string,string>=Object.create(null);
 try{const stream=createReadStream(path,{encoding:'utf8'});const lines=createInterface({input:stream,crlfDelay:Infinity});for await(const line of lines){try{const row=JSON.parse(line);if(typeof row.id==='string'&&typeof row.thread_name==='string')titles[row.id]=row.thread_name.slice(0,500);}catch{/* Ignore malformed index rows. */}}}catch(e:any){if(e.code!=='ENOENT')throw e;}
 return titles;
}
