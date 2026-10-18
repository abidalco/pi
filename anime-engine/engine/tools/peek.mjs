#!/usr/bin/env node
// Cheap looks at a film, sized to keep token cost down when Claude reviews them.
//   node engine/tools/peek.mjs films/<name> --sheet [--cols 5] [--w 384]   → out/sheet.jpg (SHEET_TIMES, one image)
//   node engine/tools/peek.mjs films/<name> --t 1.2,3.4 [--w 960]          → out/peek.jpg (grid of those times)
//   node engine/tools/peek.mjs films/<name> --cues                         → sound/cues.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const dir = args.find(a => !a.startsWith('--'));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
page.on('pageerror', e => console.error('[film error]', e.message));
await page.goto(pathToFileURL(path.resolve(dir, 'index.html')).href + '?render=1');
await page.waitForFunction(() => window.FILM && typeof window.seek === 'function');
if (flag('cues')) {
  const cues = await page.evaluate(() => window.CUES);
  fs.mkdirSync(path.join(dir, 'sound'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sound', 'cues.json'), JSON.stringify(cues, null, 1));
  console.log(path.join(dir, 'sound', 'cues.json'), cues.cues.length, 'cues', cues.duration + 's');
} else {
  const times = flag('t') ? String(flag('t')).split(',').map(Number) : await page.evaluate(() => window.SHEET_TIMES);
  const tw = Number(flag('w', flag('t') ? 960 : 384)), cols = Number(flag('cols', flag('t') ? 2 : 5)), th = Math.round(tw * 9 / 16);
  const shots = [];
  for (const t of times) { await page.evaluate(async t => { await window.seek(t); }, t); shots.push({ t, b: (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64') }); }
  const p2 = await (await browser.newContext({ viewport: { width: tw * cols, height: th } })).newPage();
  await p2.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${tw}px)}div{position:relative}
    img{width:${tw}px;display:block}span{position:absolute;left:4px;top:2px;color:#ff0;font:bold 13px monospace;text-shadow:0 0 3px #000}</style>
    ${shots.map(s => `<div><img src="data:image/jpeg;base64,${s.b}"><span>${s.t.toFixed(2)}</span></div>`).join('')}`);
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const f = path.join(dir, 'out', flag('t') ? 'peek.jpg' : 'sheet.jpg');
  await p2.screenshot({ path: f, fullPage: true, type: 'jpeg', quality: 82 });
  console.log(f);
}
await browser.close();
