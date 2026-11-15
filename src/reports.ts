import {Task,Unit,normalized,burn} from './core';
export function report(tasks:Task[],ids:string[]){
 const selectedIds=new Set(ids),selected=tasks.filter(t=>selectedIds.has(t.id));
 const units:[Unit,number][]=[['readChars',1000],['readChars',10000],['createdChars',1000],['createdChars',10000],['added',100],['readFiles',1],['tools',1],['task',1]];
 const snapshots=selected.flatMap(t=>[t.before,t.after].filter(x=>!!x));
 return {rows:units.map(([unit,scale])=>({unit,scale,five:normalized(selected,'five',unit,scale),week:normalized(selected,'week',unit,scale)})),burn:{five:burn(snapshots,'five'),week:burn(snapshots,'week')}};
}
