import {Task} from './core';
export function csv(tasks:Task[]) {
 const rows=tasks.map(t=>({id:t.id,session:t.session,project:t.project,model:t.model,start:new Date(t.start).toISOString(),end:t.end?new Date(t.end).toISOString():undefined,complete:t.complete,categories:t.categories.join('|'),input:t.tokens?.input,cached:t.tokens?.cached,output:t.tokens?.output,fiveBefore:t.before?.five?.used,fiveAfter:t.after?.five?.used,fiveDelta:t.five?.value,fiveLow:t.five?.low,fiveHigh:t.five?.high,fiveQuality:t.five?.quality,fiveReasons:t.five?.reasons.join('|'),weekBefore:t.before?.week?.used,weekAfter:t.after?.week?.used,weekDelta:t.week?.value,weekQuality:t.week?.quality,tools:t.tools,commands:t.commands,tests:t.tests,failures:t.failures,retries:t.retries,readChars:t.readChars,readLines:t.readLines,readBytes:t.readBytes,readFiles:t.readFiles,createdChars:t.createdChars,createdFiles:t.createdFiles,changedFiles:t.changedFiles,added:t.added,removed:t.removed,repeatedReads:t.repeatedReads,repeatedTests:t.repeatedTests}));
 const keys=Object.keys(rows[0]??{id:0,project:0,model:0});
 const quote=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return [keys.join(','),...rows.map(r=>keys.map(k=>quote(r[k as keyof typeof r])).join(','))].join('\r\n');
}
