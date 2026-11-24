import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/design-system.css',import.meta.url),'utf8');
test('upload status on phones is a slim strip with percent, tap to expand and dismiss',()=>{
 for(const id of ['backgroundUploadPercent','backgroundUploadClose','qbookUploadClose'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(css,/\.qbook-background-upload small\{display:none\}/);
 assert.match(css,/\.qbook-background-upload\.expanded small\{display:block\}/);
 assert.match(css,/\.qbook-upload-activity \.qbook-upload-note\{display:none\}/);
 assert.match(app,/window\.matchMedia\?\.\('\(max-width:800px\)'\)\.matches\)setUploadListOpen\(false\)/);
});
test('finished uploads tidy themselves away',()=>{
 assert.match(app,/if\(stateName==='done'\)backgroundBarTimer=setTimeout/);
 assert.match(app,/if\(records\.length&&done===records\.length\)uploadPanelTimer=setTimeout/);
});
