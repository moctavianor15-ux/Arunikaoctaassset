import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist');await cp('public','dist',{recursive:true});
await build({entryPoints:['src/pages.js'],outfile:'dist/_worker.js',bundle:true,format:'esm',platform:'neutral',external:['node:*'],target:'es2022'});
await writeFile('dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));
console.log('Pages siap: dist/ berisi frontend + backend _worker.js.');
