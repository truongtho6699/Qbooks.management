import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('capacitor shell points at production and tags its user agent', () => {
  const cfg = JSON.parse(readFileSync('mobile/capacitor.config.json', 'utf8'));
  assert.equal(cfg.appId, 'vn.qbooks.quantri');
  assert.equal(cfg.server.url, 'https://qbooks-quantri.pages.dev');
  assert.match(cfg.appendUserAgent, /^QBooksApp\//);
});

test('web app detects the native shell, skips Google sign-in there and keeps the screen awake while uploading', () => {
  const js = readFileSync('public/app.js', 'utf8');
  assert.match(js, /const IN_APP=\/QBooksApp\\\/\/\.test\(navigator\.userAgent\)/);
  assert.match(js, /if\(IN_APP\)\{\n  \/\/ Google blocks/);
  assert.match(js, /navigator\.wakeLock\.request\('screen'\)/);
});

test('native projects declare camera and microphone access for the 720p recorder', () => {
  const manifest = readFileSync('mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
  for (const p of ['CAMERA', 'RECORD_AUDIO']) assert.match(manifest, new RegExp('android.permission.' + p));
  const plist = readFileSync('mobile/ios/App/App/Info.plist', 'utf8');
  for (const k of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription']) assert.ok(plist.includes(k), k);
});

test('PWA manifest has PNG icons for home-screen install', () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  assert.match(readFileSync('public/index.html', 'utf8'), /rel="apple-touch-icon" href="\/icons\/icon-180.png"/);
});
