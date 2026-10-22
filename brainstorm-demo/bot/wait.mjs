// Bot side, step 1: block until the team does something, then print the batch
// of events plus the full session context as JSON. Exits 0 always.
//   node bot/wait.mjs            → waits up to ~100 s, prints {idle:true} if nothing happened
//   node bot/wait.mjs --fresh    → drops any backlog first (use once after a long absence)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PI_BRAINSTORM_URL || 'http://localhost:3142';
const fresh = process.argv.includes('--fresh');
const timeout = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1]) || 100000;

let res;
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout + 15000);
  res = await fetch(`${BASE}/api/bot/next?timeout=${timeout}${fresh ? '&fresh=1' : ''}`, { signal: ctrl.signal });
  clearTimeout(t);
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'start the server first: npm start (in pi-brainstorm/), then run me again' }));
  process.exit(0);
}

const data = await res.json();
if (data.events?.length) {
  fs.writeFileSync(path.join(here, '.last-session'), data.session.id);
  data.reply_with = `node bot/say.mjs <<'EOF'\n{ "text": "...", "picks": ["...", "..."] }\nEOF   (session defaults to ${data.session.id})`;
}
console.log(JSON.stringify(data, null, 1));
