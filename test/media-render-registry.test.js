import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/video.js',import.meta.url),'utf8');
const declarationNames=new Set(
 [...source.matchAll(/(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1])
);
const entry=source.match(/const screen=\{([^;]+)\};\s*let html=screen\[state\.view\]/);
test('Media view registry exists and every screen handler references a declared function',()=>{
 assert.ok(entry,'Media render() must have a screen registry');
 const definitions=entry[1].split(',').map(x=>x.trim()).filter(Boolean);
 const definedEntries=definitions.map(item=>{
  const parts=item.split(':').map(x=>x.trim());
  return {key:parts[0],handler:parts[1]||parts[0]};
 });
 for(const {key,handler} of definedEntries){
  assert.ok(declarationNames.has(handler),`Screen "${key}" references missing function "${handler}"`);
 }
 assert.ok(definedEntries.length>=10,'Media must expose its retained operational menus');
 for(const removed of ['adminOverview','createVideo','permissions','audit','staff'])assert.ok(!definedEntries.some(x=>x.key===removed),'Removed menu must no longer appear: '+removed);
});
test('Opening Media filming overview uses the existing filmingOverview handler',()=>{
 assert.match(entry?.[1]||'',/\bfilmOverview\s*:\s*filmingOverview\b/);
 assert.ok(declarationNames.has('filmingOverview'));
});
