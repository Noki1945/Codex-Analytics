import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readTitles} from '../src/titles';
test('chat names use latest index title without importing prompts',async()=>{const dir=await mkdtemp(join(tmpdir(),'codex-titles-'));try{const file=join(dir,'index.jsonl');await writeFile(file,'{"id":"a","thread_name":"Старое"}\ninvalid\n{"id":"a","thread_name":"Мой чат","prompt":"private"}\n');assert.deepEqual({...await readTitles(file)},{a:'Мой чат'});assert.deepEqual({...await readTitles(join(dir,'absent'))},{});}finally{await rm(dir,{recursive:true,force:true});}});
