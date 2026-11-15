export const categories = ['read','create','edit','fix','refactor','generate-tests','run-tests','search','architecture','build'] as const;
export type Category = typeof categories[number];
export interface Window { used: number; reset: number; minutes: number; bucket: string }
export interface Limits { five?: Window; week?: Window; at: number }
export interface Tokens { input: number; cached: number; output: number }
export interface Task {
 id: string; session: string; project: string; model: string; start: number; end?: number;
 categories: Category[]; tokens?: Tokens; before?: Limits; after?: Limits;
 tools: number; commands: number; tests: number; failures: number; retries?: number;
 readChars?: number; readLines?: number; readBytes?: number; readFiles?: number;
 createdChars?: number; added?: number; removed?: number; createdFiles?: number; changedFiles?: number;
 repeatedReads: number; repeatedTests: number; complete: boolean; gaps: boolean; modelChanged: boolean;
 five?: Measurement; week?: Measurement;
}
export interface Measurement { value?: number; low?: number; high?: number; reasons: string[]; quality: 'bounded'|'aggregate'|'unavailable' }
export function textSize(s: string) { return { chars: [...s].length, bytes: Buffer.byteLength(s), lines: s.length ? s.split(/\r\n|\n|\r/).length - (/\r?\n$/.test(s) ? 1 : 0) : 0 }; }
export function classify(name: string, args: string): Category[] {
 const s = `${name} ${args}`; const out = new Set<Category>();
 if (/read_file|Get-Content|\bcat\b|\bsed\b/i.test(s)) out.add('read');
 if (/\brg\b|\bgrep\b|search|find_file/i.test(s)) out.add('search');
 if (/apply_patch|write_file|edit_file/i.test(name)) out.add('edit');
 if (/\*\*\* Add File:/.test(args)) {out.delete('edit');out.add('create');}
 if (/\*\*\* Update File:/.test(args)) out.add('edit');
 if (/exec|shell|command/i.test(name)&&/\b(test|pytest|jest|vitest)\b|cargo test|dotnet test/i.test(args)) out.add('run-tests');
 if (/\*\*\* (Add|Update) File:.*(test|spec)/i.test(args)) out.add('generate-tests');
 if (/exec|shell|command/i.test(name)&&/npm (install|ci|run build)|\b(build|webpack|tsc|cmake)\b/i.test(args)) out.add('build');
 return [...out];
}
export function tokenDelta(before: Tokens | undefined, after: Tokens): Tokens | undefined {
 const b=before??{input:0,cached:0,output:0};
 if (Object.keys(b).some(k=>after[k as keyof Tokens]<b[k as keyof Tokens])) return undefined;
 return {input:after.input-b.input,cached:after.cached-b.cached,output:after.output-b.output};
}
export function calibrate(a: Window|undefined,b: Window|undefined, flags: string[]=[]): Measurement {
 const reasons=[...flags];
 if(!a||!b) return {quality:'unavailable',reasons:[...reasons,'Missing quota snapshot']};
 if(a.bucket!==b.bucket||a.minutes!==b.minutes) reasons.push('Quota bucket changed');
 if(a.reset!==b.reset||b.used<a.used) reasons.push('Quota reset');
 if(reasons.includes('Quota reset')||reasons.includes('Quota bucket changed')) return {quality:'unavailable',reasons};
 const value=b.used-a.used;
 return {value,low:Math.max(0,value-1),high:value+1,quality:reasons.length?'aggregate':'bounded',reasons:[...reasons,'Percent rounding: ±1 percentage point; other clients may contribute']};
}
export function finalize(tasks: Task[]) {
 const unique=new Map<string,Task>();
 for(const t of tasks){const old=unique.get(t.id);if(!old||(t.complete&&!old.complete)||((t.complete===old.complete)&&(t.end??t.start)>=(old.end??old.start)))unique.set(t.id,t);}
 tasks=[...unique.values()].sort((a,b)=>a.start-b.start);
 let previousEnd=-Infinity;
 const overlapping=new Set<string>();
 for(let i=0;i<tasks.length;i++){const t=tasks[i],end=t.end??Infinity;if(previousEnd>t.start||(i+1<tasks.length&&tasks[i+1].start<end))overlapping.add(t.id);previousEnd=Math.max(previousEnd,end);}
 for(const t of tasks) {
  const flags:string[]=[];
  if(!t.complete) flags.push('Incomplete task');
  if(t.gaps) flags.push('History gaps');
  if(t.modelChanged) flags.push('Model changed');
  if(t.before&&t.start-t.before.at>300000)flags.push('Stale starting snapshot');
  if(t.after&&t.end&&t.end-t.after.at>60000)flags.push('No snapshot near completion');
  if(overlapping.has(t.id)) flags.push('Overlapping tasks');
  if(t.categories.length>1) flags.push('Mixed operations: task-level cost only');
  t.five=calibrate(t.before?.five,t.after?.five,flags);t.week=calibrate(t.before?.week,t.after?.week,flags);
 }
 return tasks;
}
export function burn(snapshots:Limits[],key:'five'|'week',now=Date.now()) {
 const sorted=[...new Map(snapshots.map(s=>[s.at,s])).values()].sort((a,b)=>a.at-b.at);
 const latest=sorted.at(-1),w=latest?.[key];if(!w||w.reset*1000<=now)return undefined;
 if(!latest||now-latest.at>300000)return {status:'Устаревший снимок',n:0};
 const rates:number[]=[],durations:number[]=[];let used=0,hoursObserved=0;
 for(let i=1;i<sorted.length;i++){const a=sorted[i-1][key],b=sorted[i][key],hours=(sorted[i].at-sorted[i-1].at)/3600000;if(a&&b&&a.reset===b.reset&&a.bucket===b.bucket&&b.used>=a.used&&hours>=1/60&&b.reset===w.reset){rates.push((b.used-a.used)/hours);durations.push(hours);used+=b.used-a.used;hoursObserved+=hours;}}
 const s=stats(rates);if(!s||s.n<5)return {status:'Недостаточно данных',n:rates.length};
 const remaining=100-w.used,hoursToReset=(w.reset*1000-now)/3600000;
 const pace=used/hoursObserved;
 return {status:'Оценка наблюдаемого темпа',n:s.n,perHour:pace,perDay:pace*24,exhaustsAt:pace>0?now+remaining/pace*3600000:undefined,hitBeforeReset:rates.reduce((sum,r,i)=>sum+(r*hoursToReset>=remaining?durations[i]:0),0)/hoursObserved,note:'Оценка взвешена по времени наблюдения; предполагается сохранение темпа.'};
}
export function quantile(a:number[],p:number) { const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p;return s.length?s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i%1):undefined; }
export function stats(values: number[]) {
 const a=values.filter(Number.isFinite),n=a.length;if(!n)return undefined;
 const mean=a.reduce((x,y)=>x+y,0)/n,sd=n>1?Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(n-1)):0;
 const critical=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
 const margin=n>1?(n<31?critical[n-1]:n<61?2.042:n<121?2:1.98)*sd/Math.sqrt(n):undefined;
 return {n,mean,median:quantile(a,.5)!,p10:quantile(a,.1)!,p90:quantile(a,.9)!,sd,ci:margin===undefined?undefined:[mean-margin,mean+margin]};
}
export type Unit='readChars'|'createdChars'|'added'|'readFiles'|'tools'|'tokens'|'task';
export function volume(t:Task,u:Unit) {return u==='task'?1:u==='tokens'?(t.tokens?t.tokens.input+t.tokens.output:undefined):t[u];}
export function normalized(tasks:Task[],key:'five'|'week',unit:Unit,scale=1) {
 return stats(tasks.filter(t=>t[key]?.quality==='bounded').flatMap(t=>{const d=volume(t,unit),v=t[key]?.value;return d&&v!==undefined?[v/d*scale]:[];}));
}
export interface ForecastInput {model:string;category:Category;unit:Unit;amount:number;project?:string;retries:number;complexity:number;projectSize?:number}
export function wilson(successes:number,n:number):[number,number]|undefined {
 if(!n)return;const z=1.96,p=successes/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,center-margin),Math.min(1,center+margin)];
}
export function backtest(tasks:Task[],q:ForecastInput,key:'five'|'week') {
 const calibrated=tasks.every(t=>t[key])?tasks:finalize(tasks.map(t=>({...t})));
 const history=calibrated.filter(t=>t.complete&&!t.gaps&&!t.modelChanged&&t.model===q.model&&t.categories.length===1&&t.categories[0]===q.category&&(!q.project||q.project===t.project)&&t[key]?.quality==='bounded'&&(volume(t,q.unit)??0)>0).sort((a,b)=>a.start-b.start).slice(-500);
 const errors:number[]=[],hits:boolean[]=[];
 // Each prediction uses only tasks completed before the held-out task starts.
 for(const held of history.slice(Math.max(5,Math.floor(history.length*.7),history.length-30))){
  const amount=volume(held,q.unit)!;
  const train=history.filter(t=>(t.end??Infinity)<held.start&&(volume(t,q.unit)??0)>=amount/4&&(volume(t,q.unit)??0)<=amount*4).slice(-100);
  if(train.length<5)continue;
  const values=train.map(t=>t[key]!.value!/volume(t,q.unit)!*amount),actual=held[key]!.value!;
  const low=quantile(train.map(t=>(t[key]!.low??t[key]!.value!)/volume(t,q.unit)!*amount),.1)!;
  const high=quantile(train.map(t=>(t[key]!.high??t[key]!.value!)/volume(t,q.unit)!*amount),.9)!;
  errors.push(Math.abs(quantile(values,.5)!-actual));hits.push(actual>=low&&actual<=high);
 }
 return {n:errors.length,mae:stats(errors)?.mean,coverage:errors.length?hits.filter(Boolean).length/errors.length:undefined};
}
export function forecast(tasks:Task[],q:ForecastInput,remaining?:{five?:number;week?:number}) {
 if(!Number.isFinite(q.amount)||q.amount<=0||q.amount>Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(q.retries)||q.retries<0||!Number.isFinite(q.complexity)||q.complexity<=0||q.complexity>5) throw Error('Некорректные параметры прогноза');
 if(remaining&&Object.values(remaining).some(x=>x!==undefined&&(!Number.isFinite(x)||x<0||x>100)))throw Error('Некорректный остаток лимита');
 const candidates=tasks.filter(t=>t.complete&&!t.gaps&&!t.modelChanged&&t.model===q.model&&t.categories.length===1&&t.categories[0]===q.category&&(!q.project||t.project===q.project)&& (volume(t,q.unit)??0)>=q.amount/4&&(volume(t,q.unit)??0)<=q.amount*4).sort((a,b)=>b.start-a.start).slice(0,100);
 const ratios=(get:(t:Task)=>number|undefined)=>candidates.flatMap(t=>{const v=get(t);return v===undefined?[]:[v/volume(t,q.unit)!*q.amount];});
 const predict=(a:number[],rest?:number,lower=a,upper=a)=>{
  if(a.length<5)return {status:'Недостаточно данных',n:a.length,median:undefined,interval:undefined,fit:undefined,fitInterval:undefined,tasks:undefined};
  const s=stats(a)!,successes=rest===undefined?undefined:upper.filter(v=>v<=rest).length;
  const interval=[quantile(lower,.1)!,quantile(upper,.9)!];
  return {status:'Эмпирический прогноз',...s,interval,fit:successes===undefined?undefined:successes/a.length,fitInterval:successes===undefined?undefined:wilson(successes,a.length),tasks:rest===undefined||interval[1]<=0?undefined:Math.floor(rest/interval[1])};
 };
 const quota=(key:'five'|'week')=>predict(ratios(t=>t[key]?.quality==='bounded'?t[key]!.value:undefined),remaining?.[key],ratios(t=>t[key]?.quality==='bounded'?t[key]!.low:undefined),ratios(t=>t[key]?.quality==='bounded'?t[key]!.high:undefined));
 return {five:quota('five'),week:quota('week'),tokens:predict(ratios(t=>t.tokens?t.tokens.input+t.tokens.output:undefined)),durationMs:predict(ratios(t=>t.end===undefined?undefined:t.end-t.start)),validation:{five:backtest(tasks,q,'five'),week:backtest(tasks,q,'week')},notes:['Диапазоны P10–P90 учитывают округление лимитов. Оценка числа задач использует верхнюю границу, а не медиану.','Вероятность попадания эмпирическая; интервал Уилсона показывает неопределённость малой выборки.','Сложность, размер проекта и будущие повторы пока не имеют обученных коэффициентов.']};
}
export function insights(tasks:Task[]) { const s=stats(tasks.flatMap(t=>t.tokens?[t.tokens.input+t.tokens.output]:[]));return tasks.flatMap(t=>{const out:string[]=[];if(t.repeatedReads)out.push(`Повторных чтений: ${t.repeatedReads}`);if(t.repeatedTests)out.push(`Повторных тестов: ${t.repeatedTests}`);if(t.failures>=3)out.push(`Неудачных вызовов: ${t.failures}`);if(s&&s.n>=10&&t.tokens&&t.tokens.input+t.tokens.output>s.mean+2*s.sd)out.push('Расход токенов выше среднего более чем на 2σ');return out.map(message=>({id:t.id,message}));}); }
export function finance(monthlyTasks:number,plans:{name:string;price:number;includedTasks:number;extraPerTask:number}[]) {if(!Number.isFinite(monthlyTasks)||monthlyTasks<0)throw Error('Invalid demand');return plans.map(p=>{if([p.price,p.includedTasks,p.extraPerTask].some(x=>!Number.isFinite(x)||x<0))throw Error('Invalid pricing');return {...p,total:p.price+Math.max(0,monthlyTasks-p.includedTasks)*p.extraPerTask};});}
