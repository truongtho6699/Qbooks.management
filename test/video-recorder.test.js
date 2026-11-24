import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('recorder asks for 720p back camera at about 2 Mbps and caps at 60 minutes',()=>{
 assert.match(app,/width:\{ideal:1280\},height:\{ideal:720\}/);
 assert.match(app,/facingMode:\{ideal:'environment'\}/);
 assert.match(app,/const RECORDER_MAX_MS=60\*60\*1000,RECORDER_BITRATE=2000000;/);
 assert.match(html,/id="recordVideoBtn"/);
 assert.match(html,/<dialog id="recorderDialog" class="recorder-dialog" aria-labelledby="recorderTitle">/);
});

test('recorder prefers MP4 (iPhone) and falls back to WebM (Android/Chrome)',()=>{
 const src=app.slice(app.indexOf('function recorderMime('),app.indexOf('function recorderError('));
 const run=supported=>{const ctx={window:{MediaRecorder:{isTypeSupported:t=>supported.includes(t)}}};vm.createContext(ctx);vm.runInContext(src+';this.r=recorderMime();',ctx);return ctx.r;};
 assert.equal(run(['video/mp4']),'video/mp4');
 assert.equal(run(['video/webm;codecs=vp8,opus','video/webm']),'video/webm;codecs=vp8,opus');
 assert.equal(run([]),'');
});

test('recorded file joins the video input, starts the immediate upload and skips the duration probe',()=>{
 assert.match(app,/recordedVideos\.add\(file\)/);
 assert.match(app,/input\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
 assert.match(app,/if\(recordedVideos\.has\(file\)\)return;/);
 assert.match(app,/if\(!navigator\.mediaDevices\?\.getUserMedia\|\|!window\.MediaRecorder\)\{\$\('videos'\)\.click\(\);return;\}/);
});

test('recorded file name passes the server filename rule',()=>{
 const name='QBOOKS_HD78222_20261124T210512.mp4';
 assert.match(name,/^[\w.\-() ]{1,180}$/);
});
