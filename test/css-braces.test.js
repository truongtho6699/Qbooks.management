import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// An unclosed block silently nests every later rule (e.g. the mobile upload strip rules
// ended up inside a desktop-only media query), so check every stylesheet's braces.
test('every stylesheet has balanced braces', () => {
  for (const f of readdirSync('public').filter(n => n.endsWith('.css'))) {
    const css = readFileSync('public/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
    let depth = 0;
    for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') { depth--; assert.ok(depth >= 0, f + ': extra }'); } }
    assert.equal(depth, 0, f + ': unclosed {');
  }
});
