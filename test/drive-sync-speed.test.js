import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncBatch,SYNC_BUDGET_MS} from '../src/drive-auto-worker.js';

const worker=readFileSync(new URL('../src/drive-auto-worker.js',import.meta.url),'utf8');
const sync=readFileSync(new URL('../src/sync-google.js',import.meta.url),'utf8');

test('Drive sync streams 32 MB parts (multiple of 256 KiB)',()=>{
 const m=/const CHUNK=(\d+)\*1024\*1024;/.exec(sync);assert.ok(m);
 assert.equal((Number(m[1])*1024*1024)%(256*1024),0);assert.equal(Number(m[1]),32);
});

test('small files are synced before large videos and the batch is time-budgeted',()=>{
 assert.match(worker,/ORDER BY CASE WHEN bytes<=52428800 THEN 0 ELSE 1 END,created_at,id/);
 assert.ok(SYNC_BUDGET_MS<=5*60*1000,'budget stays inside the 9-minute file lease');
 assert.match(worker,/while\(!progress\.done&&chunks<maxChunks&&Date\.now\(\)<deadline\)/);
});

test('an exhausted budget claims no file',async()=>{
 const claims=[];
 const DB={prepare:sql=>({bind:()=>({
  all:async()=>({results:[{id:'u1'},{id:'u2'}]}),
  run:async()=>{claims.push(sql);return {meta:{changes:1}}},first:async()=>null})})};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({access_token:'t'}));
 try{
  const env={SYNC_ENABLED:'true',DB,MEDIA:{},GOOGLE_CLIENT_ID:'c',GOOGLE_OAUTH_CLIENT_SECRET:'s',GOOGLE_REFRESH_TOKEN:'r'};
  const r=await syncBatch(env,{budgetMs:0});
  assert.equal(r.processed,0);
  assert.equal(claims.filter(s=>s.includes('auto_lease_until=?')).length,0);
 }finally{globalThis.fetch=original;}
});
