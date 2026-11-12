import test from 'node:test';
import assert from 'node:assert/strict';
import {configured,syncBatch,googleAccessToken} from '../src/drive-auto-worker.js';

test('Auto Drive OFF when long-term OAuth credentials are not provisioned',()=>{
 const env={SYNC_ENABLED:'false',DB:{},MEDIA:{},
 GOOGLE_CLIENT_ID:'client',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'};
 assert.equal(configured(env),false);
 assert.equal(configured({...env,SYNC_ENABLED:'true',GOOGLE_REFRESH_TOKEN:undefined}),false);
 assert.equal(configured({...env,SYNC_ENABLED:'true'}),true);
});
test('No scheduled IO without explicitly enabled credentialed service',async()=>{
 const DB={prepare(){throw Error('Must not query D1 when disabled')}};
 const result=await syncBatch({SYNC_ENABLED:'false',DB,MEDIA:{}});
 assert.equal(result.status,'DISABLED');
 assert.equal(result.processed,0);
});
test('Missing credentials cannot trigger token exchange',async()=>{
 await assert.rejects(()=>googleAccessToken({}),/Chưa cấu hình/);
});
