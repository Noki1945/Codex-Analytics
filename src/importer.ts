import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Task,Tokens,Limits,Window,classify,textSize,tokenDelta} from './core';
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const number=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function limits(raw:any,at:number):Limits|undefined {
 if(!raw)return;
 const result:Limits={at};const bucket=raw.limit_id??raw.limitId??'codex';
 for(const w of [raw.primary,raw.secondary]) {
  if(!w)continue;const used=w.used_percent??w.usedPercent,minutes=w.window_minutes??w.windowDurationMins,reset=w.resets_at??w.resetsAt;
  if(!number(used)||used>100||!number(minutes)||!number(reset))continue;
  const v:Window={used,minutes,reset,bucket};if(minutes===300)result.five=v;if(minutes===10080)result.week=v;
 }return result;
}
function tokens(x:any):Tokens|undefined {if(!x)return;const v={input:x.input_tokens,cached:x.cached_input_tokens,output:x.output_tokens};return Object.values(v).every(n=>number(n)&&Number.isSafeInteger(n))&&v.cached<=v.input?v:undefined;}
export interface ParserState {session:string;project:string;model:string;current?:Task;baseline?:Tokens;total?:Tokens;limits?:Limits;tasks:Task[];calls:Record<string,{kind:string;fingerprint:string;patch?:Partial<Task>}>;seenCalls:string[];seenReads:string[];seenTests:string[];invalid:number}
export function initialState(session:string):ParserState {return {session,project:'unknown',model:'unknown',tasks:[],calls:{},seenCalls:[],seenReads:[],seenTests:[],invalid:0};}
export function consume(s:ParserState,e:any) {
 const at=Date.parse(e.timestamp);if(!Number.isFinite(at))return;const p=e.payload??{};
 if(e.type==='session_meta'){s.session=String(p.id??p.session_id??s.session);s.project=p.cwd?hash(p.cwd).slice(0,12):'unknown';}
 if(e.type==='turn_context') {if(s.current&&(s.current.tokens||s.current.tools>0)&&p.model&&s.current.model!=='unknown'&&s.current.model!==p.model)s.current.modelChanged=true;s.model=p.model??s.model;if(s.current)s.current.model=s.model;}
 if(e.type==='event_msg'&&(p.type==='task_started'||p.type==='turn_started')) {
  if(s.current&&p.turn_id&&s.current.id===`${s.session}:${p.turn_id}`)return;
  if(s.current){s.current.gaps=true;s.current.end=at;s.tasks.push(s.current);}
  s.baseline=s.total;s.calls={};s.seenCalls=[];s.seenReads=[];s.seenTests=[];
  s.current={id:`${s.session}:${p.turn_id??at}`,session:s.session,project:s.project,model:s.model,start:at,before:s.limits,categories:[],tools:0,commands:0,tests:0,failures:0,repeatedReads:0,repeatedTests:0,complete:false,gaps:false,modelChanged:false};
 }
 const t=s.current;
 if(e.type==='event_msg'&&p.type==='token_count') {
  const next=tokens(p.info?.total_token_usage);if(next){if(t){t.tokens=tokenDelta(s.baseline,next);if(!t.tokens)t.gaps=true;}s.total=next;}
  const l=limits(p.rate_limits,at);if(l){s.limits=l;if(t)t.after=l;}
 }
 if(!t)return;
 if(e.type==='response_item'&&(p.type==='function_call'||p.type==='custom_tool_call')) {
  const callId=String(p.call_id??hash(JSON.stringify(p)));
  s.seenCalls??=[];if(s.seenCalls.includes(callId))return;s.seenCalls.push(callId);
  const name=String(p.name??''),args=typeof p.arguments==='string'?p.arguments:typeof p.input==='string'?p.input:'';
  const cats=classify(name,args);t.categories=[...new Set([...t.categories,...cats])];t.tools++;
  const fingerprint=hash(name+'\0'+args);s.calls[String(p.call_id)]={kind:cats.includes('run-tests')?'test':'other',fingerprint};
  if(/exec|shell|command/i.test(name))t.commands++;
  if(cats.includes('read')){if(s.seenReads.includes(fingerprint))t.repeatedReads++;s.seenReads.push(fingerprint);}
  if(cats.includes('run-tests')){t.tests++;if(s.seenTests.includes(fingerprint))t.repeatedTests++;s.seenTests.push(fingerprint);}
  if(/apply_patch/.test(name)) {
   const patch:Partial<Task>={};
   let mode='';for(const line of args.split('\n')) {
    if(line.startsWith('*** Add File:')){patch.createdFiles=(patch.createdFiles??0)+1;mode='create';}
    else if(line.startsWith('*** Update File:')){patch.changedFiles=(patch.changedFiles??0)+1;mode='edit';}
    else if(line.startsWith('*** '))mode='';
    else if(line.startsWith('+')&&mode){patch.added=(patch.added??0)+1;if(mode==='create')patch.createdChars=(patch.createdChars??0)+textSize(line.slice(1)).chars+1;}
    else if(line.startsWith('-')&&mode)patch.removed=(patch.removed??0)+1;
   }
   s.calls[String(p.call_id)].patch=patch;
  }
 }
 if(e.type==='response_item'&&(p.type==='function_call_output'||p.type==='custom_tool_call_output')) {
  const output=typeof p.output==='string'?p.output:'';
  const call=s.calls[String(p.call_id)];
  if(call?.patch&&/Success\. Updated the following files:/.test(output))for(const key of ['added','removed','createdChars','createdFiles','changedFiles'] as const){const v=call.patch[key];if(v!==undefined)t[key]=(t[key]??0)+v;}
  delete s.calls[String(p.call_id)];
  if(/Process exited with code [1-9]|"exit_code"\s*:\s*[1-9]|"isError"\s*:\s*true/.test(output))t.failures++;
  // Output text is discarded. Shell output cannot reliably establish bytes read from files.
 }
 if(e.type==='event_msg'&&['task_complete','task_completed','turn_completed','turn_aborted'].includes(p.type)) {
  t.end=at;t.complete=p.type!=='turn_aborted';s.tasks.push(t);s.current=undefined;
 }
}
export interface Checkpoint {offset:number;state:ParserState;mtime:number;prefix:string;prefixLength:number}
export async function importFile(path:string,old?:Checkpoint):Promise<Checkpoint> {
 const info=await stat(path);let cp=old;
 // Prefix detects replacement even when the new file is larger. Raw bytes never enter storage.
 const prefixLength=old?.prefixLength??Math.min(256,info.size);
 let prefix='';if(prefixLength)for await(const chunk of createReadStream(path,{start:0,end:prefixLength-1}))prefix+=chunk.toString('base64');prefix=hash(prefix);
 if(!cp||info.size<cp.offset||cp.prefix!==prefix)cp={offset:0,state:initialState(hash(path)),mtime:0,prefix,prefixLength};
 if(cp.mtime===info.mtimeMs&&cp.offset===info.size)return cp;
 let pending=Buffer.alloc(0),position=cp.offset;
 for await(const chunk of createReadStream(path,{start:cp.offset})) {
  pending=Buffer.concat([pending,chunk]);let end:number;
  while((end=pending.indexOf(10))>=0){const line=pending.subarray(0,end).toString('utf8');position+=end+1;pending=pending.subarray(end+1);try{consume(cp.state,JSON.parse(line));}catch{cp.state.invalid++;if(cp.state.current)cp.state.current.gaps=true;}}
  if(pending.length>32*1024*1024)throw Error('Journal line exceeds 32 MiB safety bound');
 }
 return {offset:position,state:cp.state,mtime:info.mtimeMs,prefix,prefixLength};
}
export async function* journals(dir:string):AsyncGenerator<string> {for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())yield* journals(p);else if(e.isFile()&&e.name.endsWith('.jsonl'))yield p;}}
