// QBOOK lightweight zero-dependency UI quality gate.
// Static review only: browser, Lighthouse and authenticated UAT remain separate.
import {readFileSync,statSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html');
const css=read('public/design-system.css');
const nav=read('public/navigation.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
assert.deepEqual([...new Set(duplicates)],[],'Duplicate static HTML IDs');
const links=[...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(x=>x[1]);
assert.ok(links.includes('/design-system.css'),'Shared design system must be loaded');
for(const layer of ['/figma-pages.css','/uiux-phase1.css','/uiux-phase2.css'])
 assert.ok(!links.includes(layer),'Do not load deprecated duplicate layer '+layer);
for(const match of html.matchAll(/<dialog\s+([^>]+)>/g)){
 const attrs=match[1],id=attrs.match(/\bid="([^"]+)"/)?.[1];
 assert.ok(id,'Dialog must have ID');
 const label=attrs.match(/aria-labelledby="([^"]+)"/)?.[1];
 assert.ok(label&&ids.includes(label),'Dialog '+id+' must reference an existing accessible heading');
}
assert.match(html,/id="qbSkipLink"/);
assert.match(html,/id="shippingHeading" tabindex="-1"/);
assert.match(html,/id="overviewSearch" aria-label=/);
assert.match(html,/id="search" aria-label=/);
assert.match(nav,/event\.key==='Escape'/);
assert.match(nav,/event\.key==='Tab'/);
assert.match(css,/--qbook-color-brand:/);
assert.match(css,/:focus-visible/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/forced-colors:active/);
const bytes=p=>statSync(new URL('../'+p,import.meta.url)).size;
const result={result:'PASS',staticIds:ids.length,stylesheets:links.length,
 cssBytes:Object.fromEntries(links.map(link=>[link,bytes('public'+link)])),
 diagnosticOptIn:html.includes('/performance.js')};
console.log('QBOOK UI quality gate:',JSON.stringify(result));
