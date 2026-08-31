import { cpSync, mkdirSync, rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

rmSync('public', { recursive: true, force: true });
mkdirSync('public', { recursive: true });

cpSync('web/index.html', 'public/index.html');
cpSync('web/style.css', 'public/style.css');
cpSync('web/manifest.webmanifest', 'public/manifest.webmanifest');
cpSync('web/sw.js', 'public/sw.js');
cpSync('web/icon.svg', 'public/icon.svg');

await esbuild.build({
  entryPoints: ['web/app.jsx'],
  outfile: 'public/app.js',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
});

console.log('build: public/{index.html,style.css,app.js} ready');
