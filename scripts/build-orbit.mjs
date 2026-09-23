import { access, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

// Keep upstream source editable; ship scripts and textures separately for caching.
const root = path.resolve('vendor/orbit-main');
const out = path.resolve('public/orbit-runtime');
await mkdir(path.join(out, 'assets'), { recursive: true });

const hasAuthorizedUpstream = process.env.TIMI_SKIP_ORBIT !== '1'
  && await access(path.join(root, 'src/universe.js')).then(() => true).catch(() => false);

if (!hasAuthorizedUpstream) {
  const upstream = 'https://ryh842487118-bot.github.io/orbit/';
  const source = 'https://github.com/ryh842487118-bot/orbit';
  await writeFile(path.join(out, 'index.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ORBIT · 外部观星台</title><style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030914;color:#e7eef9;font:16px/1.8 system-ui}.card{max-width:620px;margin:24px;padding:36px;border:1px solid #ffffff24;border-radius:24px;background:#0b1424e8;box-shadow:0 30px 90px #0009}h1{font-size:clamp(28px,7vw,52px);margin:0 0 8px}p{color:#b9c6d8}a{display:inline-block;margin:12px 12px 0 0;padding:10px 16px;border-radius:999px;background:#e9f1ff;color:#07111f;text-decoration:none}.source{background:transparent;color:#cbd8e9;border:1px solid #ffffff38}</style>
<main class="card"><small>TIMI STUDIO / OPTIONAL MODULE</small><h1>观星台未随仓库分发</h1><p>ORBIT 上游暂未声明软件许可证，因此本开源仓库只保留接入方式。你仍可前往原作者的在线版本体验。</p><a href="${upstream}" target="_blank" rel="noreferrer">打开原版 ORBIT ↗</a><a class="source" href="${source}" target="_blank" rel="noreferrer">查看上游源码</a></main>`);
  console.log('ORBIT upstream source not present; generated the attribution-safe fallback page.');
  process.exit(0);
}

const names = ['earth-day','earth-night','earth-clouds','moon','mercury','venus-atmosphere','mars','jupiter','saturn','saturn-rings','uranus','neptune','sun'];
const assets = {};
for (const name of names) {
  const file = `${name}.${name === 'saturn-rings' ? 'png' : 'jpg'}`;
  assets[name] = `./assets/${file}`;
  await copyFile(path.join(root, 'assets', file), path.join(out, 'assets', file));
}
await esbuild.build({ entryPoints: [path.join(root, 'src/universe.js')], bundle: true,
  format: 'iife', minify: true, target: 'es2020', legalComments: 'inline', outfile: path.join(out, 'orbit.js') });
let shell = await readFile(path.join(root, 'src/shell.html'), 'utf8');
const styles = await Promise.all(['src/style.css','src/ui/earthsense.css','src/ui/trajectory.css','src/ui/compact.css'].map(f => readFile(path.join(root,f),'utf8')));
await writeFile(path.join(out,'orbit.css'), styles.join('\n'));
shell = shell.replace('<style>/* INLINE_CSS */</style>', '<link rel="stylesheet" href="./orbit.css">')
  .replace('/* INLINE_ASSETS */', `window.ORBIT_ASSETS=${JSON.stringify(assets)};`)
  .replace('<script>/* INLINE_JS */</script>', '<script src="./orbit.js" defer></script>')
  .replace(/\s*<meta name="google-adsense-account"[^>]*>/, '')
  .replace('<title>ORBIT · 漫游宇宙 · 感知地球</title>', '<title>Timi · 星空观测室</title>');
// Upstream formatting can change: fail rather than silently omit the application.
if (!shell.includes('src="./orbit.js"')) throw new Error('ORBIT shell entry changed');
await writeFile(path.join(out, 'index.html'), shell);
await copyFile(path.join(root,'assets/CREDITS.md'), path.join(out,'CREDITS.md'));
console.log(`ORBIT built with ${names.length} separately cached textures; no embedded 8K maps.`);
