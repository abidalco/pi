// Bot side, step 1: block until the team does something, then print ONE delivery as JSON. Exits 0 always.
//   "section": "brainstorm" → a batch of events plus the session context; answer with bot/say.mjs (BOT.md)
//   "section": "script"     → one job plus its context; answer with bot/done.mjs (BOT-SCRIPT.md)
//   node bot/wait.mjs            → waits up to ~100 s, prints {idle:true} if nothing happened
//   node bot/wait.mjs --fresh    → drops any brainstorm backlog first (use once after a long absence)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, POLL_MS, BOT_ID, headers } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fresh = process.argv.includes('--fresh');
const timeout = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1]) || POLL_MS;

let res;
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout + 15000);
  res = await fetch(`${BASE}/api/bot/next?bot=${encodeURIComponent(BOT_ID)}&timeout=${timeout}${fresh ? '&fresh=1' : ''}`, { headers: headers(), signal: ctrl.signal });
  clearTimeout(t);
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'start the app first: npm start (in pi-production/), then run me again' }));
  process.exit(0);
}

const data = await res.json();
if (data.events?.length) {
  fs.writeFileSync(path.join(here, '.last-session'), JSON.stringify({ project: data.project.id, session: data.session.id }));
  data.reply_with = `node bot/say.mjs <<'EOF'\n{ "text": "...", "picks": ["...", "..."] }\nEOF   (project and session default to ${data.project.id} / ${data.session.id})`;
}
if (data.job) fs.writeFileSync(path.join(here, '.last-job'), JSON.stringify({ project: data.project.id, job: data.job.id }));
console.log(JSON.stringify(data, null, 1));
