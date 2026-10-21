// Bot side, step 2: post one reply. JSON comes from argv[2] or stdin (heredoc).
//   node bot/say.mjs <<'EOF'
//   { "text": "Who is this happening to?", "picks": ["a kid", "a thief", "nobody yet"] }
//   EOF
// Fields (all optional except that something must be there):
//   project   string   defaults to the project of the last wait.mjs delivery
//   session   string   defaults to the session of the last wait.mjs delivery
//   text      string   the bot's chat message (short; markdown-lite **bold** ok)
//   picks     string[] 2–6 quick-pick answers shown as buttons under the message
//   cards     [{ title, note?, fields?, sparkedBy?, parent? }]   new idea cards
//   update    [{ id, title?, note?, fields?, sparkedBy? }]       edit existing cards (not promoted ones)
//   stage     number   0-based stage index to move the session to
//   verdicts  [{ card, verdict: "ok" | "warn" | "block", note }] only during judging
//   result    string   card id that wins the tiebreak            only during tiebreak
//   recap     string   closes the session                        only during wrapping
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

if (!payload.session || !payload.project) {
  try {
    const last = JSON.parse(fs.readFileSync(path.join(here, '.last-session'), 'utf8'));
    payload.project ||= last.project; payload.session ||= last.session;
  } catch { console.log(JSON.stringify({ error: 'no project/session given and no previous delivery — pass "project" and "session"' })); process.exit(0); }
}

try {
  const res = await fetch(`${BASE}/api/bot/say`, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(payload) });
  const out = await res.json();
  if (out.ok) out.next = 'node bot/wait.mjs';
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'is the server running? npm start' }));
}
