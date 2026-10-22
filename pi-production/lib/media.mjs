// References — making images, voice samples and clips. Each is a provider, chosen by settings; one always works.
//   images  mock    code-drawn placeholders (lib/refart.mjs), free, the default
//           openai  PI_IMAGES=openai + OPENAI_API_KEY (model PI_IMAGE_MODEL, default gpt-image-1).
//                   Billed per image by OpenAI; PI_IMAGE_CAP caps a project's images per month (default 200).
//           codex   PI_IMAGES=codex: no key on the server. Image jobs wait here for an image terminal (npm run images),
//                   which makes them with Codex CLI on that person's ChatGPT subscription and sends the PNGs back.
//   voice   say     this Mac's own voices + ffmpeg, free and local (macOS only)
//   video   none yet: people upload their own clip
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ok = (cmd, args) => { try { return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0; } catch { return false; } };
const FFMPEG = ok('ffmpeg', ['-version']);
const SAY = process.platform === 'darwin' && fs.existsSync('/usr/bin/say');
let VOICES = null; // the voices this Mac has, read once
const voicesHere = () => {
  if (VOICES) return VOICES;
  try { VOICES = new Set(spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).stdout.split('\n').map((l) => l.split(/\s{2,}/)[0].trim()).filter(Boolean)); } catch { VOICES = new Set(); }
  return VOICES;
};

export function providers() {
  const want = (process.env.PI_IMAGES || '').toLowerCase();
  return {
    image: want === 'codex' ? 'codex' : want === 'openai' && process.env.OPENAI_API_KEY ? 'openai' : 'mock',
    imageWorkers: imageWorkers.length,
    imageModel: process.env.PI_IMAGE_MODEL || 'gpt-image-1',
    imageCap: Number(process.env.PI_IMAGE_CAP) || 200,
    voice: SAY && FFMPEG ? 'say' : null,
    video: null,
  };
}
export const hashOf = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);

function run(cmd, args, { input = null, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(binary ? Buffer.concat(out) : Buffer.concat(out).toString()) : reject(new Error(`${cmd}: ${Buffer.concat(err).toString().trim().slice(-300) || `exit ${code}`}`))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

// ---------------------------------------------------------------- images: OpenAI
const SIZE = { portrait: '1024x1536', wide: '1536x1024', square: '1024x1024' };
const mimeOf = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(f).toLowerCase()]);
export async function openaiImages({ prompt, n = 4, shape = 'square', from = null }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('no OPENAI_API_KEY');
  const model = providers().imageModel;
  const size = SIZE[shape] || SIZE.square;
  let res;
  if (from && mimeOf(from)) { // the rest are made from the picked image, so the face or the object stays the same
    const fd = new FormData();
    fd.append('model', model); fd.append('prompt', prompt); fd.append('n', String(n)); fd.append('size', size);
    fd.append('image', new Blob([fs.readFileSync(from)], { type: mimeOf(from) }), path.basename(from));
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(180000) });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, n, size }), signal: AbortSignal.timeout(180000) });
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`the image model said: ${j.error?.message || res.status}`);
  return (j.data || []).map((d) => Buffer.from(d.b64_json, 'base64'));
}

// ---------------------------------------------------------------- images: Codex on a ChatGPT subscription
// One job = n images for one prompt. The server keeps the jobs in memory and long-polls them out to whichever
// image terminal has waited longest; render() awaits the PNGs. Several people can run a terminal at once.
const imageJobs = [];      // { id, prompt, n, size, from, resolve, reject, taken, timer }
const imageWorkers = [];   // { id, res, timer }
const JOB_MS = 10 * 60 * 1000;
let imageSeen = 0;
export const imageTerminalOnline = () => imageWorkers.length > 0 || Date.now() - imageSeen < 3 * 60 * 1000;
function handOut() {
  while (imageWorkers.length) {
    const job = imageJobs.find((j) => !j.taken);
    if (!job) return;
    const w = imageWorkers.shift(); clearTimeout(w.timer);
    job.taken = w.id;
    const from = job.from && fs.existsSync(job.from) ? { name: path.basename(job.from), b64: fs.readFileSync(job.from).toString('base64') } : null;
    try { w.res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); w.res.end(JSON.stringify({ job: { id: job.id, prompt: job.prompt, n: job.n, size: job.size, from } })); }
    catch { job.taken = null; }
  }
}
export function codexImages({ prompt, n = 4, shape = 'square', from = null }) {
  if (!imageTerminalOnline()) return Promise.reject(Object.assign(new Error('no image terminal is online: someone runs “npm run images” (Codex on their ChatGPT login)'), { code: 409 }));
  return new Promise((resolve, reject) => {
    const job = { id: crypto.randomBytes(6).toString('hex'), prompt, n, size: SIZE[shape] || SIZE.square, from, resolve, reject, taken: null };
    job.timer = setTimeout(() => { imageJobs.splice(imageJobs.indexOf(job), 1); reject(new Error('the image terminal took too long (10 min)')); }, JOB_MS);
    imageJobs.push(job);
    handOut();
  });
}
// GET /api/images/next — an image terminal waiting for work
export function imageWait(req, res, botId, timeout) {
  imageSeen = Date.now();
  for (const o of imageWorkers.filter((x) => x.id === botId)) { imageWorkers.splice(imageWorkers.indexOf(o), 1); clearTimeout(o.timer); try { o.res.end('{"idle":true,"replaced":true}'); } catch {} }
  const w = { id: botId, res, timer: null };
  w.timer = setTimeout(() => { const i = imageWorkers.indexOf(w); if (i >= 0) imageWorkers.splice(i, 1); res.end('{"idle":true}'); }, timeout);
  imageWorkers.push(w);
  req.on('close', () => { const i = imageWorkers.indexOf(w); if (i >= 0) { imageWorkers.splice(i, 1); clearTimeout(w.timer); } });
  handOut();
}
// POST /api/images/done — { job, images: [b64 png…] } or { job, error }
export function imageDone(b) {
  imageSeen = Date.now();
  const job = imageJobs.find((j) => j.id === b.job);
  if (!job) return { error: 'no such job (it timed out?)' };
  imageJobs.splice(imageJobs.indexOf(job), 1); clearTimeout(job.timer);
  if (b.error || !b.images?.length) job.reject(new Error(`the image terminal said: ${b.error || 'no images'}`));
  else job.resolve(b.images.map((x) => Buffer.from(x, 'base64')));
  return { ok: true };
}

// ---------------------------------------------------------------- voice: this Mac's voices, shaped by the description
// voice = { age, pitch, accent, pace, range, sample } as written on the card
export function voicePlan(voice = {}, { name = '', heard = false } = {}) {
  const t = Object.values(voice).join(' ').toLowerCase();
  const female = /female|woman|girl|\bshe\b|her\b/.test(t), male = !female && /\bmale|man\b|boy|\bhe\b|his\b/.test(t);
  const years = Number((String(voice.age || '').match(/(\d{2})/) || [])[1]) || 0;
  const older = years >= 50 || /old|elderly|aged|gravel/.test(t);
  const have = voicesHere();
  const pick = (...names) => names.find((n) => have.has(n)) || 'Samantha';
  const v = /indian/.test(t) ? pick('Rishi', 'Daniel') : /irish|scottish/.test(t) ? pick(male ? 'Daniel' : 'Moira', 'Samantha') : /australian/.test(t) ? pick(male ? 'Daniel' : 'Karen') : /south african/.test(t) ? pick('Tessa')
    : male ? (older ? pick('Ralph', 'Daniel') : /american|us\b/.test(t) ? pick('Ralph', 'Daniel') : pick('Daniel', 'Ralph')) : pick('Samantha');
  const rate = /fast|rapid|quick|clipped|brisk/.test(t) ? 195 : /slow|measured|deliberate|drawl/.test(t) ? 145 : 170;
  let pitch = /low|deep|husky|gravel|dark/.test(t) ? (male || older ? 0.86 : 0.92) : /high|bright|light|young/.test(t) ? 1.06 : 1;
  if (older && pitch === 1) pitch = 0.94;
  const radio = /radio|phone|intercom|walkie|tannoy|speaker|filtered/.test(t) || (heard && /radio|phone/.test(t));
  const line = String(voice.sample || '').replace(/^[\s“”"']+|[\s“”"']+$/g, '').trim() || (name ? `My name is ${name}.` : 'Hello.');
  return { voice: v, rate, pitch, radio, line };
}
async function probeRate(file) { try { return Number((await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', file])).trim()) || 22050; } catch { return 22050; } }
export async function voiceSample(voice, { name = '', heard = false, out }) {
  if (!SAY || !FFMPEG) throw new Error('no voice provider here (needs macOS `say` and ffmpeg)');
  const plan = voicePlan(voice, { name, heard });
  const tmp = path.join(os.tmpdir(), `pi-voice-${Date.now().toString(36)}.aiff`);
  await run('say', ['-v', plan.voice, '-r', String(plan.rate), '-o', tmp, plan.line]);
  const sr = await probeRate(tmp);
  const shape = `asetrate=${Math.round(sr * plan.pitch)},aresample=44100,atempo=${(1 / plan.pitch).toFixed(3)}`;
  const tone = plan.radio ? 'highpass=f=380,lowpass=f=3000,acompressor=threshold=0.08:ratio=8:attack=5:release=60,volume=2.2,alimiter=limit=0.7' : 'highpass=f=75,aecho=0.8:0.5:34:0.12';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af', `${shape},${tone},loudnorm=I=-18:TP=-2`, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '112k', out]);
  fs.rmSync(tmp, { force: true });
  return { ...(await peaksOf(out)), plan };
}
// 56 bars of loudness and the length, for the player's waveform
export async function peaksOf(file, bars = 56) {
  if (!FFMPEG) return { dur: null, peaks: [] };
  const pcm = await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { binary: true });
  const n = Math.floor(pcm.length / 2);
  if (!n) return { dur: 0, peaks: [] };
  const step = Math.max(1, Math.floor(n / bars)), peaks = [];
  for (let i = 0; i < bars; i++) { let m = 0; for (let k = i * step; k < Math.min(n, (i + 1) * step); k++) m = Math.max(m, Math.abs(pcm.readInt16LE(k * 2))); peaks.push(m); }
  const top = Math.max(...peaks) || 1;
  return { dur: +(n / 8000).toFixed(2), peaks: peaks.map((x) => +(x / top).toFixed(2)) };
}
export async function durationOf(file) {
  try { return Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim()) || null; } catch { return null; }
}
