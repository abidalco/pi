// Bot side, step 1: block until the team asks for something, then print ONE job plus its context as JSON.
//   node bot/wait.mjs          → waits up to ~100 s, prints {idle:true} if nothing came in
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PI_SCRIPT_URL || 'http://localhost:3143';
const timeout = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1]) || 100000;

let res;
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout + 15000);
  res = await fetch(`${BASE}/api/bot/next?timeout=${timeout}`, { signal: ctrl.signal });
  clearTimeout(t);
} catch (e) {
  console.log(JSON.stringify({ error: `cannot reach ${BASE} (${e.cause?.code || e.name})`, hint: 'start the server first: npm start (in pi-script/), then run me again' }));
  process.exit(0);
}
const data = await res.json();
if (data.job) fs.writeFileSync(path.join(here, '.last-job'), data.job.id);
console.log(JSON.stringify(data, null, 1));
