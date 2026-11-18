import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('remember option visible and opt-out possible',()=>{
 assert.match(html,/id="rememberLogin"[^>]+type="checkbox" checked/);
 assert.match(html,/Ghi nhớ đăng nhập trên thiết bị này/);
 assert.match(html,/Không lưu mã PIN/);
});
test('session persistence is opt-in and logout clears remembered bearer',()=>{
 assert.match(app,/localStorage\.getItem\('qbooks_remember_token'\)/);
 assert.match(app,/if\(remember\)\{/);
 assert.match(app,/localStorage\.setItem\(REMEMBER_TOKEN,result\.token\)/);
 assert.match(app,/localStorage\.removeItem\(REMEMBER_TOKEN\)/);
 assert.match(app,/clearLoginSession\(\);window\.history\.replaceState/);
 assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*(?:\bpin\b|password)/i);
});
test('Google and PIN authentication share the same remember handler',()=>{
 assert.match(app,/saveLoginSession\(res,res\.user\?\.email\|\|email,remember\)/);
 assert.match(app,/saveLoginSession\(result,result\.user\?\.email\|\|'',!!\$\('rememberLogin'\)\?\.checked\)/);
});
