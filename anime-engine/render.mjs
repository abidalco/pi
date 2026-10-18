#!/usr/bin/env node
// Frame-exact renderer: drives window.seek(t) in headless Chromium, pipes PNGs to ffmpeg.
// Usage:
//   node render.mjs films/<name>                    full render → out/<name>.mp4
//   node render.mjs films/<name> --audio track.wav  mux + loudnorm to -14 LUFS
//   node render.mjs films/<name> --sheet            contact sheet, one frame per beat
//   node render.mjs films/<name> --frames 0,1.5,3   single PNG frames
//   flags: --fps N  --from S  --to S  --scale N (device scale for sheet/frames)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const filmArg = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!filmArg) { console.error('usage: node render.mjs films/<name> [--sheet|--frames t,t|--audio f]'); process.exit(1); }

const filmDir = fs.statSync(filmArg).isDirectory() ? filmArg : path.dirname(filmArg);
const htmlPath = fs.statSync(filmArg).isDirectory() ? path.join(filmArg, 'index.html') : filmArg;
const name = path.basename(path.resolve(filmDir));
const outDir = path.join(filmDir, 'out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const scale = Number(flag('scale', 1));

const beatsPath = path.join(filmDir, 'beats.json');
const beatsJson = fs.existsSync(beatsPath) ? fs.readFileSync(beatsPath, 'utf8') : 'null';

async function openFilm(deviceScaleFactor = 1) {
  const probe = await browser.newPage();
  await probe.goto(pathToFileURL(path.resolve(htmlPath)).href + '?render=1');
  await probe.waitForFunction(() => window.FILM && typeof window.seek === 'function');
  const film = await probe.evaluate(() => window.FILM);
  await probe.close();
  const ctx = await browser.newContext({ viewport: { width: film.width, height: film.height }, deviceScaleFactor });
  await ctx.addInitScript(b => { window.BEATS = JSON.parse(b); }, beatsJson);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('[film error]', e.message));
  await page.goto(pathToFileURL(path.resolve(htmlPath)).href + '?render=1');
  await page.waitForFunction(() => window.FILM && typeof window.seek === 'function');
  await page.evaluate(() => document.fonts.ready);
  return { page, film };
}

async function grab(page, t) {
  await page.evaluate(async t => { await window.seek(t); }, t);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
}

function run(cmd, argv, stdinFeeder) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: [stdinFeeder ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', rej);
    p.on('close', c => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
    if (stdinFeeder) stdinFeeder(p.stdin).catch(rej);
  });
}

const clampSlope = s => Math.min(1, Math.max(0.15, s));

function measureLufs(file) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']);
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('close', () => { const m = [...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(); m ? res(Number(m[1])) : rej(new Error('ebur128 failed')); });
  });
}

const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

if (flag('frames')) {
  const { page } = await openFilm(scale);
  for (const t of String(flag('frames')).split(',').map(Number)) {
    const f = path.join(outDir, `frame_${t.toFixed(2)}.png`);
    fs.writeFileSync(f, await grab(page, t));
    console.log(f);
  }
} else if (flag('sheet')) {
  const { page, film } = await openFilm(1);
  let times, label = 'beat';
  const own = await page.evaluate(() => window.SHEET_TIMES || null);
  if (own) times = own.filter(t => t < film.duration);
  else if (fs.existsSync(beatsPath)) {
    times = JSON.parse(beatsJson).beats.filter(t => t < film.duration);
  } else {
    label = 'sec';
    times = Array.from({ length: Math.ceil(film.duration) }, (_, i) => i);
  }
  const shots = [];
  for (const t of times) shots.push({ t, src: 'data:image/png;base64,' + (await grab(page, t)).toString('base64') });
  // Compose the sheet in a second page: phone-size thumbnails so readability is judged honestly.
  const thumbW = film.width >= film.height ? 360 : 200;
  const cols = film.width >= film.height ? 4 : 6;
  const ctx = await browser.newContext({ viewport: { width: cols * (thumbW + 12) + 12, height: 400 } });
  const sheet = await ctx.newPage();
  await sheet.setContent(`<!doctype html><style>
    body{margin:0;padding:12px;background:#111;color:#aaa;font:12px ui-monospace,monospace}
    h1{font-size:13px;color:#ddd;margin:0 0 10px}
    .g{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:12px}
    img{width:${thumbW}px;display:block;background:#000}
    span{display:block;padding:3px 0}</style>
    <h1>${name} · ${film.width}×${film.height} · ${film.duration}s · ${shots.length} frames (per ${label})</h1>
    <div class=g>${shots.map((s, i) => `<div><img src="${s.src}"><span>#${i + 1} · ${fmt(s.t)}</span></div>`).join('')}</div>`);
  const f = path.join(outDir, 'sheet.png');
  await sheet.screenshot({ path: f, fullPage: true });
  console.log(f);
} else {
  const { page, film } = await openFilm(1);
  const fps = Number(flag('fps', film.fps || 30));
  const from = Number(flag('from', 0));
  const to = Number(flag('to', film.duration));
  const total = Math.round((to - from) * fps);
  const silent = path.join(outDir, `${name}.video.mp4`);
  const t0 = Date.now();
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent],
    async stdin => {
      for (let i = 0; i < total; i++) {
        const buf = await grab(page, from + i / fps);
        if (!stdin.write(buf)) await new Promise(r => stdin.once('drain', r));
        if (i % fps === 0) process.stdout.write(`\r${i}/${total} frames`);
      }
      stdin.end();
    });
  process.stdout.write(`\r${total}/${total} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  const audio = flag('audio') === true ? null : flag('audio');
  const final = path.join(outDir, `${name}.mp4`);
  if (audio) {
    // -14 LUFS integrated, -1 dBTP: measure, apply gain, limit, re-measure (one-pass loudnorm undershoots on punchy mixes).
    const master = path.join(outDir, `${name}.master.wav`);
    let gain = 0, lufs, prev = null;
    for (let pass = 0; pass < 8; pass++) {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(from), '-t', String(to - from), '-i', audio,
        '-af', `volume=${gain}dB,alimiter=limit=0.891:level=false:attack=1:release=60`, '-ar', '48000', '-c:a', 'pcm_s24le', master]);
      lufs = await measureLufs(master);
      if (Math.abs(lufs + 14) < 0.3) break;
      if (process.env.DEBUG_LUFS) console.log(`  pass ${pass}: ${lufs.toFixed(1)} LUFS @ ${gain.toFixed(1)} dB`);
      // secant step: the limiter absorbs part of each dB of gain, so scale by the measured slope
      const slope = prev && gain !== prev.gain ? clampSlope((lufs - prev.lufs) / (gain - prev.gain)) : 1;
      prev = { gain, lufs };
      gain += (-14 - lufs) / slope;
    }
    console.log(`audio: ${lufs.toFixed(1)} LUFS (gain ${gain.toFixed(1)} dB)`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', master,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', final]);
    fs.unlinkSync(silent);
    fs.unlinkSync(master);
  } else {
    fs.renameSync(silent, final);
  }
  console.log(final);
}

await browser.close();
