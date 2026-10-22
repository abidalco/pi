// The image terminal. Runs on this computer's Codex CLI login (your ChatGPT subscription, no OpenAI API key):
// long-polls the app for image jobs (References → Generate, with PI_IMAGES=codex on the server), makes each
// image with one `codex exec` call (its built-in image tool), posts the PNGs back.
//   npm run images          settings in bot/.env (PI_URL, PI_BOT_KEY, PI_BOT_ID — same as the Claude bot)
// Two people can each run one; every job goes to one terminal only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BASE, BOT_ID, LOCAL, headers } from './env.mjs';

const CODEX = process.env.CODEX_BIN || 'codex';
const PARALLEL = Math.max(1, Number(process.env.PI_IMAGE_PARALLEL) || 2); // images made at once, per job
const ONE_LIMIT_MS = 5 * 60 * 1000;
const POLL = LOCAL ? 100000 : 50000;
const GEN_DIR = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`${new Date().toTimeString().slice(0, 5)}  ${s}`);
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

// the newest image codex saved on its own, in case it didn't copy it where it was told
function newestSince(dir, t0) {
  let best = null;
  const walk = (d) => { let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) { const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(png|jpe?g|webp)$/i.test(e.name)) { const t = fs.statSync(f).mtimeMs; if (t >= t0 && (!best || t > best.t)) best = { f, t }; } } };
  walk(dir);
  return best?.f || null;
}

function makeOne(job, i, fromFile) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-img-'));
    const out = path.join(dir, `out-${i}.png`);
    const prompt = [
      `Use your image generation tool to make exactly ONE image, ${job.size} pixels. Do not write code or use any other tool except to save the file.`,
      fromFile ? 'The attached image is the reference: keep the same person (face, build, colouring) or the same object, exactly.' : '',
      `Save the image as ${out} and then stop.`,
      '', 'The image:', job.prompt,
      job.n > 1 ? `\n(This is option ${i + 1} of ${job.n}: make it a distinct take within the brief.)` : '',
    ].filter(Boolean).join('\n');
    const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir, '--enable', 'image_generation'];
    if (fromFile) args.push('-i', fromFile);
    args.push('-');
    const t0 = Date.now();
    const env = { ...process.env }; delete env.OPENAI_API_KEY; // always the ChatGPT login, never API billing
    const child = spawn(CODEX, args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), ONE_LIMIT_MS);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? `"${CODEX}" not found: npm i -g @openai/codex, then codex login` : e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const file = fs.existsSync(out) ? out : newestSince(dir, t0) || newestSince(GEN_DIR, t0);
      if (file) { const buf = fs.readFileSync(file); fs.rmSync(dir, { recursive: true, force: true }); return resolve(buf); }
      fs.rmSync(dir, { recursive: true, force: true });
      reject(new Error((err.trim().split('\n').slice(-3).join(' ') || `codex exited ${code} without an image`).slice(0, 300)));
    });
    child.stdin.end(prompt);
  });
}

async function makeJob(job) {
  let fromFile = null;
  if (job.from) { fromFile = path.join(os.tmpdir(), `pi-from-${job.id}${path.extname(job.from.name) || '.png'}`); fs.writeFileSync(fromFile, Buffer.from(job.from.b64, 'base64')); }
  try {
    const results = [];
    for (let i = 0; i < job.n; i += PARALLEL) {
      const batch = Array.from({ length: Math.min(PARALLEL, job.n - i) }, (_, k) => makeOne(job, i + k, fromFile).then((b) => b, (e) => e));
      results.push(...await Promise.all(batch));
    }
    const images = results.filter(Buffer.isBuffer);
    if (!images.length) throw results.find((x) => x instanceof Error) || new Error('no images');
    return images.map((b) => b.toString('base64'));
  } finally { if (fromFile) fs.rmSync(fromFile, { force: true }); }
}

async function post(body) {
  for (let tries = 0; tries < 3; tries++) {
    try { const r = await fetch(`${BASE}/api/bot/images/done`, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) }); return await r.json(); }
    catch (e) { await sleep(2000); if (tries === 2) throw e; }
  }
}

log(`image terminal “${BOT_ID}” → ${BASE}  (Codex on your ChatGPT login; ${PARALLEL} at a time)`);
for (;;) {
  let d;
  try {
    const r = await fetch(`${BASE}/api/bot/images/next?bot=${encodeURIComponent(BOT_ID)}&timeout=${POLL}`, { headers: headers(), signal: AbortSignal.timeout(POLL + 15000) });
    if (r.status === 401) { log('the app refused the bot key (PI_BOT_KEY in bot/.env)'); await sleep(30000); continue; }
    d = await r.json();
  } catch (e) { log(`cannot reach ${BASE} (${e.cause?.code || e.name}), retrying`); await sleep(5000); continue; }
  if (!d.job) continue;
  const t0 = Date.now();
  log(`${d.job.n} image${d.job.n > 1 ? 's' : ''} ${d.job.size}${d.job.from ? ' from a reference' : ''}: ${d.job.prompt.slice(0, 70).replace(/\s+/g, ' ')}…`);
  try {
    const images = await makeJob(d.job);
    await post({ job: d.job.id, images });
    log(`  sent ${images.length} in ${secs(t0)}`);
  } catch (e) {
    log(`  failed: ${e.message}`);
    try { await post({ job: d.job.id, error: e.message }); } catch {}
  }
}
