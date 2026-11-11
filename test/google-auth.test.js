import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {validGoogleClaims,verifyGoogleCredential} from '../src/google-auth.js';

globalThis.crypto ??= webcrypto;
const clientId='qbooks-demo.apps.googleusercontent.com';
const now=Math.floor(Date.now()/1000);
const claims={iss:'https://accounts.google.com',aud:clientId,sub:'12345678901234567890',email:'a@gmail.com',email_verified:true,iat:now-10,exp:now+3600};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');

test('Google claims must verify audience issuer expiry email and subject',()=>{
 assert.equal(validGoogleClaims(claims,clientId),true);
 assert.equal(validGoogleClaims({...claims,aud:'evil.apps.googleusercontent.com'},clientId),false);
 assert.equal(validGoogleClaims({...claims,iss:'https://other.example'},clientId),false);
 assert.equal(validGoogleClaims({...claims,exp:now-1},clientId),false);
 assert.equal(validGoogleClaims({...claims,email_verified:false},clientId),false);
 assert.equal(validGoogleClaims({...claims,sub:''},clientId),false);
 assert.equal(validGoogleClaims({...claims,hd:'example.com'},clientId),true);
});
test('Verify Google ID token signature with JWKS (reject tampering)',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
 jwk.kid='test-id';jwk.use='sig';jwk.alg='RS256';
 const fetcher=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 const header=encode({alg:'RS256',kid:'test-id',typ:'JWT'});
 const payload=encode(claims);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(header+'.'+payload));
 const jwt=header+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
 const identity=await verifyGoogleCredential(jwt,clientId,fetcher);
 assert.deepEqual(identity,{sub:claims.sub,email:claims.email,name:claims.email,authoritativeEmail:true});
 await assert.rejects(()=>verifyGoogleCredential(jwt,clientId+'x',fetcher),/không dành cho QBooks/);
 const bad=jwt.slice(0,-2)+'aa';
 await assert.rejects(()=>verifyGoogleCredential(bad,clientId,fetcher),/Chữ ký/);
});
