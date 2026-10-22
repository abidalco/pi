// Bot side, step 2 for the Script: answer one job. JSON from argv[2] or stdin (heredoc).
//   node bot/done.mjs <<'EOF'
//   { "options": [ { "note": "…", "blocks": [ { "type": "dialogue", "character": "MAYA", "paren": "", "line": "…" } ] } ] }
//   EOF
// "project" and "job" default to the last job wait.mjs delivered. Reply shape per job type: BOT-SCRIPT.md
// (and the "reply" field of every delivery).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, headers } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

let raw = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : fs.readFileSync(0, 'utf8');
raw = raw.trim();
if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
let payload;
try { payload = JSON.parse(raw); }
catch (e) { console.log(JSON.stringify({ error: `not valid JSON: ${e.message}`, got: raw.slice(0, 200) })); process.exit(0); }
if (!payload.job || !payload.project) {
  try {
    const last = JSON.parse(fs.readFileSync(path.join(here, '.last-job'), 'utf8'));
    payload.project ||= last.project; payload.job ||= last.job;
  } catch { console.log(JSON.stringify({ error: 'no project/job given and no previous delivery — pass "project" and "job"' })); process.exit(0); }
}
try {
  const res = await fetch(`${BASE}/api/bot/done`, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(payload) });
  console.log(JSON.stringify(await res.json(), null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'is the app running? npm start' }));
}
