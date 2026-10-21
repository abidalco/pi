// The AI, headless. Runs on this computer's Claude Code login (your Claude subscription, no API key):
// long-polls the app (local or online), answers each job with one fresh `claude -p` call, posts the reply.
//   npm run auto            settings in bot/.env (see bot/.env.example)
// Leave it running. While this computer is off or asleep, jobs wait in the app and get answered when it's back.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, POLL_MS, headers } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.PI_BOT_MODEL || '';
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const JOB_LIMIT_MS = 4 * 60 * 1000; // the app hands a job out again after 5 min
// a clean folder outside the repo, so no project CLAUDE.md or MCP servers load into the bot
const CWD = path.join(os.tmpdir(), 'pi-bot');
fs.mkdirSync(CWD, { recursive: true });

// ---- the two sections: each delivery says which one it is for, and gets that section's playbook
const headless = (shape) => `\n\n---\n\n## Headless mode (this run)\n\nThere is no terminal loop and there are no scripts this time. Each message is ONE delivery from the app (exactly what bot/wait.mjs would print). Answer it with ${shape} Raw JSON object only: no prose, no code fences.`;
const SECTIONS = {
  brainstorm: {
    label: (d) => `brainstorm ${d.events.map((e) => e.type).join('+')} · “${d.session.topic}”`,
    reply: '/api/bot/say',
    address: (d) => ({ project: d.project.id, session: d.session.id }),
    giveUp: (d) => ({ project: d.project.id, session: d.session.id, text: '(The AI couldn’t answer that one. Say it again in a bit.)', round: false }),
    system: fs.readFileSync(path.join(here, '..', 'BOT.md'), 'utf8') + headless('ONE reply object for bot/say.mjs (see "Reply fields" and "Events" above). Leave out "project" and "session"; the runner adds them.'),
  },
  script: {
    label: (d) => `script ${d.job.type} for ${d.job.by} · ${d.project.name}`,
    reply: '/api/bot/done',
    address: (d) => ({ project: d.project.id, job: d.job.id }),
    giveUp: (d) => ({ project: d.project.id, job: d.job.id, skip: true }),
    system: fs.readFileSync(path.join(here, '..', 'BOT-SCRIPT.md'), 'utf8') + headless('the reply JSON for its `job.type` from the "Reply per job type" table. Leave out "project" and "job"; the runner adds them.'),
  },
};
const sectionOf = (d) => (d.job ? SECTIONS.script : d.events?.length ? SECTIONS.brainstorm : null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`${new Date().toTimeString().slice(0, 5)}  ${s}`);
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

function ask(prompt, system) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', system];
    if (MODEL) args.push('--model', MODEL);
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // always the subscription login, never API billing
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(CLAUDE, args, { cwd: CWD, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), JOB_LIMIT_MS);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? `"${CLAUDE}" not found: install Claude Code and log in` : e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let r;
      try { r = JSON.parse(out); } catch { return reject(new Error((err || out || `claude exited ${code}`).trim().slice(0, 300))); }
      if (r.is_error) return reject(new Error(String(r.result || r.subtype || 'claude error').slice(0, 300)));
      resolve(String(r.result || ''));
    });
    child.stdin.end(prompt);
  });
}

function parseReply(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('no JSON object in the reply');
}

async function post(app, payload) {
  const r = await fetch(`${BASE}${app.reply}`, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
  return r.json();
}

async function handle(d, APP) {
  const t0 = Date.now();
  const delivery = JSON.stringify(d, null, 1);
  let prompt = delivery, problem = '', bad = 0, down = 0;
  while (bad < 2 && down < 3) {
    let text, reply;
    try { text = await ask(prompt, APP.system); }
    catch (e) { // not the job's fault (usage limit, login, network, timeout): wait, then try the same delivery again
      problem = e.message;
      const wait = [30, 120, 300][down++] * 1000;
      log(`⏸ ${APP.label(d)}: ${problem}${down < 3 ? ` — trying again in ${wait / 1000} s` : ''}`);
      if (down < 3) await sleep(wait);
      continue;
    }
    try { reply = parseReply(text); }
    catch (e) { bad++; problem = e.message; prompt = `${delivery}\n\nYour last answer didn't parse (${problem}). Send the reply JSON object only.`; continue; }
    const r = await post(APP, { ...reply, ...APP.address(d) });
    if (r.ok) return log(`✓ ${APP.label(d)} · ${secs(t0)}${r.note ? ` · ${r.note}` : ''}`);
    bad++;
    problem = r.error || 'refused';
    prompt = `${delivery}\n\nThe app refused your last reply: ${problem}\nYour reply was: ${JSON.stringify(reply)}\nSend the corrected reply JSON object only.`;
  }
  log(`✗ ${APP.label(d)}: ${problem} — gave up on it`);
  await post(APP, APP.giveUp(d)).catch(() => {});
}

// keep a Mac awake while the bot runs (closing the lid on battery still sleeps it)
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }).on('error', () => {});

log(`π AI (Brainstorm + Script) · headless · ${BASE} · model: ${MODEL || 'Claude Code default'} · Ctrl+C to stop`);
let down = false;
for (;;) {
  let d;
  try {
    const r = await fetch(`${BASE}/api/bot/next?timeout=${POLL_MS}`, { headers: headers(), signal: AbortSignal.timeout(POLL_MS + 15000) });
    d = await r.json();
    if (r.status === 401) { log(d.error); process.exit(1); }
    if (down) { log(`back in touch with ${BASE}`); down = false; }
  } catch (e) {
    if (!down) log(`can't reach ${BASE} (${e.cause?.code || e.name}) — trying every 20 s`);
    down = true;
    await sleep(20000);
    continue;
  }
  const app = sectionOf(d);
  if (!app) continue;
  try { await handle(d, app); }
  catch (e) { log(`✗ ${app.label(d)}: ${e.cause?.code || e.message} — the app will hand it out again`); }
}
