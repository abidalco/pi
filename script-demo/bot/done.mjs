// Bot side, step 2: answer the job. JSON from argv[2] or stdin (heredoc). "job" defaults to the last one wait.mjs delivered.
//   node bot/done.mjs <<'EOF'
//   { "options": [ { "note": "…", "blocks": [ { "type": "dialogue", "character": "MAYA", "paren": "", "line": "…" } ] } ] }
//   EOF
// Reply shape per job type is in BOT.md (and in the "reply" field of every delivery).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PI_SCRIPT_URL || 'http://localhost:3143';

let raw = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : fs.readFileSync(0, 'utf8');
raw = raw.trim();
if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
let payload;
try { payload = JSON.parse(raw); }
catch (e) { console.log(JSON.stringify({ error: `not valid JSON: ${e.message}`, got: raw.slice(0, 200) })); process.exit(0); }
if (!payload.job) {
  try { payload.job = fs.readFileSync(path.join(here, '.last-job'), 'utf8').trim(); }
  catch { console.log(JSON.stringify({ error: 'no job given and no previous delivery — pass "job"' })); process.exit(0); }
}
try {
  const res = await fetch(`${BASE}/api/bot/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  console.log(JSON.stringify(await res.json(), null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'is the server running? npm start' }));
}
