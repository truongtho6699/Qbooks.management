// Build a single Cloudflare Cron Worker module from repository sources.
// This script deliberately does not deploy or enable syncing.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const files=['src/sync-google.js','src/r2-drive-move.js','src/drive-auto-worker.js'];
const sections=[];
for(const path of files){
 let code=await readFile(resolve(path),'utf8');
 code=code.replace(/^import\s+.*?\s+from\s+['"][^'"]+['"];?\s*$/gm,'');
 code=code.replace(/^export\s+(?!default\b)/gm,'');
 if(/^import\s/m.test(code))throw Error('Bundling found an unsupported import in '+path);
 sections.push('// ----- '+path+' -----\n'+code);
}
const bundle=sections.join('\n\n');
new Function(bundle.replace('export default {','return {'));
await mkdir(resolve('dist'),{recursive:true});
await writeFile(resolve('dist/qbooks-drive-auto-sync.mjs'),bundle);
console.log('Bundled Cloudflare Cron Worker: '+Buffer.byteLength(bundle)+' bytes');
