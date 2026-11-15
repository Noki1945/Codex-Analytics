import * as vscode from 'vscode';
import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {Task,Limits,forecast,finance,normalized,burn,Unit} from './core';
import {readLimits} from './appServer';
import {csv} from './export';
import {resolveCodex} from './codex';
export function activate(context:vscode.ExtensionContext) {
 let tasks:Task[]=[],status='История ещё не импортирована',busy=false;
 let liveLimits:Limits|undefined;
 const output=vscode.window.createOutputChannel('Codex Analytics');context.subscriptions.push(output);
 const worker=new Worker(join(context.extensionPath,'dist/src/worker.js'),{workerData:{storage:context.globalStorageUri.fsPath,wasm:join(context.extensionPath,'dist/sql-wasm.wasm')}});
 context.subscriptions.push({dispose:()=>{void worker.terminate();}});
 const views=new Set<vscode.Webview>();
 const config=()=>vscode.workspace.getConfiguration('codexAnalytics');
 const update=()=>{for(const v of views)void v.postMessage({type:'data',tasks,status});};
 worker.on('message',m=>{busy=false;if(m.error){status=`Ошибка импорта: ${m.error}`;output.appendLine(status);}else{tasks=m.tasks;const issues:string[]=m.issues??[];status=`Файлов журналов: ${m.files} · Задач: ${tasks.length} · Ошибок файлов: ${issues.length} · ${new Date().toLocaleTimeString()}`;issues.forEach(x=>output.appendLine(x));}update();});
 worker.on('error',e=>{busy=false;status=`Ошибка рабочего потока: ${e.message}`;output.appendLine(status);update();});
 function refresh(){if(busy)return;busy=true;status='Чтение локальных журналов…';update();worker.postMessage({id:Date.now(),directory:config().get<string>('sessionsPath')||join(process.env.CODEX_HOME||join(homedir(),'.codex'),'sessions')});}
 async function attach(webview:vscode.Webview,dispose:vscode.Event<void>) {
  views.add(webview);dispose(()=>views.delete(webview));webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
  const nonce=randomBytes(18).toString('hex');const html=await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri,'media/index.html'));
  webview.html=Buffer.from(html).toString('utf8').replaceAll('__NONCE__',nonce).replaceAll('__CSP__',webview.cspSource).replaceAll('__SCRIPT__',webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media/app.js')).toString()).replaceAll('__STYLE__',webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media/style.css')).toString());
  webview.onDidReceiveMessage(async m=>{try{
   if(m.type==='ready')update();
   if(m.type==='refresh')refresh();
   if(m.type==='limits'){const executable=await resolveCodex(config().get<string>('codexPath')||'codex',vscode.extensions.getExtension('openai.chatgpt')?.extensionPath);const value=await readLimits(executable);liveLimits=value.limits;void webview.postMessage({type:'limits',value});}
   if(m.type==='forecast'){
    const now=Date.now(),fresh=liveLimits&&now-liveLimits.at<=300000;
    const rest=(key:'five'|'week')=>{const w=liveLimits?.[key];return fresh&&w&&w.reset*1000>now?100-w.used:undefined;};
    void webview.postMessage({type:'forecast',value:forecast(tasks,m.input,{five:rest('five'),week:rest('week')})});
   }
   if(m.type==='finance')void webview.postMessage({type:'finance',value:finance(m.tasks,m.plans)});
   if(m.type==='analytics'){
    const ids=new Set(m.ids);const selected=tasks.filter(t=>ids.has(t.id));
    const units:[Unit,number][]=[['readChars',1000],['readChars',10000],['createdChars',1000],['createdChars',10000],['added',100],['readFiles',1],['tools',1],['task',1]];
    void webview.postMessage({type:'analytics',rows:units.map(([unit,scale])=>({unit,scale,five:normalized(selected,'five',unit,scale),week:normalized(selected,'week',unit,scale)})),burn:{five:burn(selected.flatMap(t=>[t.before,t.after].filter(x=>!!x)),'five'),week:burn(selected.flatMap(t=>[t.before,t.after].filter(x=>!!x)),'week')}});
   }
   if(m.type==='settings')await vscode.commands.executeCommand('workbench.action.openSettings','codexAnalytics');
   if(m.type==='export'&&['json','csv'].includes(m.format)){
    const uri=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(join(homedir(),`codex-analytics.${m.format}`)),filters:{Analytics:[m.format]}});if(!uri)return;
    const content=m.format==='json'?JSON.stringify(tasks,null,2):csv(tasks);await vscode.workspace.fs.writeFile(uri,Buffer.from(content));
   }
  }catch(e){void webview.postMessage({type:'error',message:e instanceof Error?e.message:String(e)});}});
 }
 context.subscriptions.push(vscode.window.registerWebviewViewProvider('codexAnalytics.dashboard',{resolveWebviewView(view){void attach(view.webview,view.onDidDispose);}}));
 context.subscriptions.push(vscode.commands.registerCommand('codexAnalytics.open',()=>{const p=vscode.window.createWebviewPanel('codexAnalytics','Codex Analytics',vscode.ViewColumn.One,{enableScripts:true});void attach(p.webview,p.onDidDispose);}));
 context.subscriptions.push(vscode.commands.registerCommand('codexAnalytics.refresh',refresh));
 const timer=setInterval(()=>{if(config().get('autoImport'))refresh();},Math.max(15,config().get<number>('pollSeconds')??60)*1000);context.subscriptions.push({dispose:()=>clearInterval(timer)});
 if(config().get('autoImport'))refresh();else worker.postMessage({id:Date.now(),mode:'load'});
}
