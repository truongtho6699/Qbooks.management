import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const nav=read('public/navigation.js');
const css=read('public/design-system.css');
const diagnostics=read('public/performance.js');
test('one approved design system replaces three incremental overrides',()=>{
 assert.match(html,/href="\/design-system\.css"/);
 for(const path of ['/figma-pages.css','/uiux-phase1.css','/uiux-phase2.css'])assert.ok(!html.includes('href="'+path+'"'),path);
 for(const source of ['Figma Pages','Phase 1','Phase 2'])assert.ok(css.includes(source),source);
 assert.match(css,/--qbook-color-brand:/);
 assert.match(css,/--qbook-hit-target:44px/);
});
test('visible keyboard focus, reduced motion and high contrast are handled',()=>{
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/forced-colors:active/);
 assert.match(nav,/if\(event\.key==='Tab'/);
 assert.match(nav,/if\(event\.key==='Escape'/);
 assert.match(nav,/if\(fromDrawer\)document\.getElementById\('shippingHeading'\)\?\.focus\?\.\(\)/);
 assert.match(nav,/if\(open\)button\.setAttribute\('aria-controls'/);
});
test('all native dialogs have accessible labels with known heading ids',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const dialogs=[...html.matchAll(/<dialog\s+([^>]+)>/g)];
 assert.equal(dialogs.length,5);
 for(const [,attrs] of dialogs){
  const labelledby=/aria-labelledby="([^"]+)"/.exec(attrs)?.[1];
  assert.ok(labelledby&&ids.has(labelledby));
 }
 assert.match(html,/id="overviewSearch" aria-label=/);
 assert.match(html,/id="search" aria-label=/);
 assert.match(html,/id="shippingHeading" tabindex="-1"/);
});
test('performance diagnostics is opt-in and never sends user data',()=>{
 assert.match(html,/defer src="\/performance\.js"/);
 assert.match(diagnostics,/URLSearchParams\(window\.location\.search\)\.has\('perf'\)/);
 assert.match(diagnostics,/PerformanceObserver/);
 assert.match(diagnostics,/largest-contentful-paint/);
 assert.match(diagnostics,/layout-shift/);
 assert.match(diagnostics,/first-contentful-paint/);
 assert.doesNotMatch(diagnostics,/\bfetch\s*\(/);
 assert.match(diagnostics,/download='qbooks-performance-local\.json'/);
 // A normal user without ?perf must not instantiate observers or panels.
 let observerCount=0;
 runInNewContext(diagnostics,{
  URLSearchParams:class{has(){return false}},
  window:{location:{search:''}},performance:{},PerformanceObserver:class{constructor(){observerCount++}}
 });
 assert.equal(observerCount,0);
});
test('the UI audit script is included in CI check command',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts.check,/scripts\/audit-ui\.mjs/);
 assert.match(pkg.scripts.check,/public\/performance\.js/);
});
