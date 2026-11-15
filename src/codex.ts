import {access} from 'node:fs/promises';
import {join} from 'node:path';
export async function resolveCodex(configured:string,extensionRoot?:string,platform:string=process.platform,arch:string=process.arch):Promise<string> {
 if(configured&&configured!=='codex')return configured;
 const os:Record<string,string>={win32:'windows',linux:'linux',darwin:'macos'};
 const cpu:Record<string,string>={x64:'x86_64',arm64:'aarch64'};
 if(extensionRoot&&os[platform]&&cpu[arch]){
  const candidate=join(extensionRoot,'bin',`${os[platform]}-${cpu[arch]}`,platform==='win32'?'codex.exe':'codex');
  try{await access(candidate);return candidate;}catch{/* Fall back to the user's PATH. */}
 }
 return 'codex';
}
