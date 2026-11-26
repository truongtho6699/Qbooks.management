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

test('native background uploader is wired on both platforms', () => {
  const js = readFileSync('public/app.js', 'utf8');
  assert.match(js, /PluginHeaders\?\.some\?\.\(p=>p\.name==='QBooksUpload'\)/);
  assert.match(js, /if\(uploads\.some\(\(\[,f\]\)=>isNativeFile\(f\)\)\)return saveNativePack/);
  assert.match(js, /transport:'r2'/);
  assert.match(readFileSync('src/worker.js', 'utf8'), /b\.transport!=='r2'&&directDriveEnabled\(env\)/);
  const manifest = readFileSync('mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /SystemForegroundService[\s\S]*foregroundServiceType="dataSync"/);
  assert.match(manifest, /FOREGROUND_SERVICE_DATA_SYNC/);
  assert.match(readFileSync('mobile/android/app/src/main/java/vn/qbooks/quantri/MainActivity.java', 'utf8'), /registerPlugin\(QBooksUploadPlugin\.class\)/);
  assert.match(readFileSync('mobile/ios/App/App/AppDelegate.swift', 'utf8'), /handleEventsForBackgroundURLSession/);
  assert.match(readFileSync('mobile/ios/App/App/QBooksUploader.swift', 'utf8'), /URLSessionConfiguration\.background/);
  assert.match(readFileSync('mobile/ios/App/App/Base.lproj/Main.storyboard', 'utf8'), /customClass="MainViewController"/);
  const pbx = readFileSync('mobile/ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  for (const f of ['QBooksUploader.swift', 'QBooksUploadPlugin.swift', 'MainViewController.swift']) assert.ok(pbx.includes(f + ' in Sources'), f);
});
