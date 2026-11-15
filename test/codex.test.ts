import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveCodex} from '../src/codex';
test('Codex discovery respects user settings and discovers installed executable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-discovery-'));
 try{const binary=join(dir,'bin','windows-x86_64','codex.exe');await mkdir(join(dir,'bin','windows-x86_64'),{recursive:true});await writeFile(binary,'fixture');assert.equal(await resolveCodex('codex',dir,'win32','x64'),binary);assert.equal(await resolveCodex('custom.exe',dir,'win32','x64'),'custom.exe');assert.equal(await resolveCodex('codex',dir,'linux','x64'),'codex');}finally{await rm(dir,{recursive:true,force:true});}
});
