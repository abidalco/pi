// π production system — the app. Zero dependencies: Node 22 built-ins only.
//   npm start                      → http://localhost:3144   (projects in data/projects/)
//   --port=3144  --projects=<dir>  (or PORT / PI_PROJECTS_DIR)
// The home page is the projects. A project is a folder with one SQLite file (lib/projects.mjs).
// Every open tab gets the whole picture pushed over SSE whenever any project changes.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setProjectsDir, listProjects, openProject, createProject, deleteProject } from './lib/projects.mjs';
import * as BS from './lib/brainstorm.mjs';
import * as SC from './lib/script.mjs';
import * as RF from './lib/references.mjs';
import * as MEDIA from './lib/media.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const PORT = Number(arg('port') || process.env.PORT) || 3144;
const PROJECTS_DIR = arg('projects') || process.env.PI_PROJECTS_DIR || path.join(ROOT, 'data', 'projects');
setProjectsDir(PROJECTS_DIR);
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// ---------- live: one stream per tab; any change in any project pushes the picture again ----------
const clients = new Set(); // { res, who, project, session, section }
const tracked = new Set();
function track(p) { // hear about a project's changes once
  if (tracked.has(p.id)) return p;
  tracked.add(p.id);
  p.on(() => changed());
  return p;
}
const open = (id) => track(openProject(id));
const onlineIn = (pid) => [...new Set([...clients].filter((c) => c.project === pid && c.who).map((c) => c.who))];
// memo: one push computes each project's pieces once, however many tabs look at them
function picture(c, memo = {}) {
  memo.projects ||= listProjects().map((p) => ({ id: p.id, name: p.name, logline: p.logline, color: p.color, created_at: p.created_at, people: p.people, pulse: p.pulse }));
  for (const p of memo.projects) track(openProject(p.id));
  let overview = null, brainstorm = null, script = null, refs = null, production = null;
  if (c.project) {
    try {
      const pr = open(c.project);
      overview = memo[`o:${pr.id}`] ||= pr.overview();
      brainstorm = memo[`b:${pr.id}:${c.session || ''}`] ||= BS.publicState(pr, c.session, botOnline());
      if (c.section === 'script') script = memo[`s:${pr.id}`] ||= SC.publicState(pr, { online: onlineIn(pr.id) });
      if (c.section === 'references' || c.section === 'production') refs = memo[`r:${pr.id}`] ||= RF.publicState(pr, { projects: memo.projects, botOnline: botOnline() });
      if (c.section === 'production') production = memo[`pd:${pr.id}`] ||= RF.productionState(pr);
    } catch { overview = { missing: true }; }
  }
  return { projects: memo.projects, overview, brainstorm, script, refs, production, config: BS.CONFIG, scriptConfig: SC.CONFIG, botOnline: botOnline() };
}

// ---------- the bot: one queue across projects and sections, one long-poll waiter ----------
const BOT_SEEN_WINDOW = 3 * 60 * 1000;
const botWaiters = [];  // one long-poll per connected bot terminal: { id, res, timer } — oldest waiter gets the next delivery
const dropWaiter = (w) => { const i = botWaiters.indexOf(w); if (i >= 0) botWaiters.splice(i, 1); clearTimeout(w.timer); };
let botLastSeen = 0;
const botOnline = () => botWaiters.length > 0 || Date.now() - botLastSeen < BOT_SEEN_WINDOW;
SC.setBotOnline(botOnline);
const allProjects = () => { const out = []; for (const p of listProjects()) { try { out.push(open(p.id)); } catch {} } return out; };
// the oldest thing waiting goes first: a brainstorm batch (one session's events) or one script job
function tryDeliver() {
  if (!botWaiters.length) return;
  const all = allProjects();
  const batch = BS.pendingBatch(all);
  const sjob = SC.pendingJob(all), rjob = RF.pendingJob(all);
  const job = sjob && (!rjob || sjob.ts <= rjob.ts) ? { ...sjob, via: SC } : rjob ? { ...rjob, via: RF } : null;
  if (!batch && !job) return;
  let out;
  if (job && (!batch || job.ts < batch.jobs[0].ts)) {
    out = job.via.deliver(job.p, job.id);
    if (!out) return;
  } else {
    BS.markDelivered(batch.p, batch.jobs);
    BS.setBusy(batch.p, batch.session, true);
    out = { section: 'brainstorm', events: batch.jobs.map(BS.jobEvent), ...BS.botContext(batch.p, batch.session) };
  }
  const w = botWaiters[0]; dropWaiter(w); const { res } = w; botLastSeen = Date.now();
  try { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(out)); } catch {}
  changed();
}
BS.onEnqueue(tryDeliver);
SC.onEnqueue(tryDeliver);
RF.onEnqueue(tryDeliver);
SC.onScriptChange((p, who) => RF.scheduleScan(p, who)); // characters and places come from the script on their own
BS.onLand((p, card, who, opts) => SC.land(p, card, who, opts), (p, card) => SC.sendLabel(p, card)); // the join: Promoted → Send lands a card in the Script or the Bible
let pushTimer = null;
function changed() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const memo = {}; for (const c of clients) send(c, memo); }, 30);
}
function send(c, memo) { try { c.res.write(`data: ${JSON.stringify(picture(c, memo))}\n\n`); } catch {} }
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 20000);
// a script sesh nobody touched for 45 minutes saves itself as a version
setInterval(() => { for (const p of allProjects()) { try { SC.sweep(p); } catch (e) { console.error('sweep:', e.message); } } }, 60 * 1000).unref();

// ---------- http ----------
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const fail = (res, msg, code = 400) => json(res, code, { error: msg });
function body(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } });
  });
}
function rawBody(req, limit = 80e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('that file is too big (80 MB at most)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
// a project's own files (reference images, voices, clips), with byte ranges so audio and video can seek
function serveFile(req, res, file) {
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'private, max-age=3600' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' });
  fs.createReadStream(file).pipe(res);
}
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) p = '/index.html';
  const f = path.join(PUBLIC, p);
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}
const name = (b) => String(b?.who || '').trim().slice(0, 40);
const ID = /^[a-z0-9؀-ۿ][a-z0-9؀-ۿ-]{0,60}$/;
const projectOr404 = (res, id) => { if (!ID.test(id)) { fail(res, 'no such project', 404); return null; } try { return open(id); } catch { fail(res, 'no such project', 404); return null; } };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // online: the bot routes need PI_BOT_KEY, everything else needs the team password (PI_SITE_PASSWORD). Both unset = open (local).
  const BOT_KEY = process.env.PI_BOT_KEY || '', SITE_PW = process.env.PI_SITE_PASSWORD || '';
  const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  if (p.startsWith('/api/bot/') && BOT_KEY) {
    if (!same(req.headers.authorization || '', `Bearer ${BOT_KEY}`)) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"bad bot key"}'); }
  } else if (SITE_PW && p !== '/healthz') {
    const given = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
    if (!same(given, SITE_PW)) { res.writeHead(401, { 'www-authenticate': 'Basic realm="π production"' }); return res.end('password needed'); }
  }
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }

  if (p === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const c = { res, who: String(url.searchParams.get('who') || '').slice(0, 40), project: url.searchParams.get('project') || null, session: url.searchParams.get('session') || null, section: url.searchParams.get('section') || null };
    if (c.project && !ID.test(c.project)) c.project = null;
    if (c.session && !/^[a-z0-9]+$/.test(c.session)) c.session = null;
    clients.add(c);
    send(c);
    if (c.project) changed(); // the others see who's here
    req.on('close', () => {
      clients.delete(c);
      if (c.project && c.who && ![...clients].some((x) => x.project === c.project && x.who === c.who)) SC.leave(c.project, c.who);
      if (c.project) changed();
    });
    return;
  }

  // ---- the bot side (both sections)
  if (p === '/api/bot/next' && req.method === 'GET') {
    botLastSeen = Date.now();
    const all = allProjects();
    if (url.searchParams.get('fresh')) for (const pr of all) { try { pr.run("UPDATE jobs SET status = 'done' WHERE section = 'brainstorm' AND status = 'pending'"); } catch {} }
    for (const pr of all) { try { SC.requeueStale(pr); RF.requeueStale(pr); BS.requeueStale(pr); } catch {} }
    const botId = String(url.searchParams.get('bot') || 'bot').slice(0, 40);
    for (const o of botWaiters.filter((x) => x.id === botId)) { dropWaiter(o); json(o.res, 200, { idle: true, replaced: true }); } // same terminal reconnecting
    const timeout = Math.min(Number(url.searchParams.get('timeout')) || 100000, 590000);
    const w = { id: botId, res, timer: null };
    w.timer = setTimeout(() => { if (botWaiters.includes(w)) { dropWaiter(w); json(res, 200, { idle: true }); changed(); } }, timeout);
    botWaiters.push(w);
    req.on('close', () => { if (botWaiters.includes(w)) { dropWaiter(w); changed(); } });
    tryDeliver();
    if (botWaiters.includes(w)) changed(); // now online
    return;
  }
  if (p === '/api/bot/images/next' && req.method === 'GET') { // the image terminal (bot/images.mjs), Codex on a ChatGPT login
    return MEDIA.imageWait(req, res, String(url.searchParams.get('bot') || 'images').slice(0, 40), Math.min(Number(url.searchParams.get('timeout')) || 50000, 590000));
  }
  if (p === '/api/bot/images/done' && req.method === 'POST') {
    let b; try { b = JSON.parse((await rawBody(req)).toString()); } catch { return fail(res, 'bad json'); }
    const out = MEDIA.imageDone(b); changed(); return json(res, out.error ? 404 : 200, out);
  }
  if (p === '/api/bot/context' && req.method === 'GET') {
    try { return json(res, 200, BS.botContext(open(url.searchParams.get('project') || ''), url.searchParams.get('session'))); }
    catch (e) { return fail(res, e.message, 404); }
  }
  if (p === '/api/bot/say' && req.method === 'POST') { // Brainstorm: one reply to a batch of events
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    botLastSeen = Date.now();
    let pr;
    try { pr = open(String(b.project || '')); } catch { return fail(res, `no such project: ${b.project}`, 404); }
    try { const out = BS.botSay(pr, b); changed(); tryDeliver(); return json(res, 200, out); } // tryDeliver: events that waited on this reply go out now
    catch (e) { return fail(res, e.message, e.code || 400); }
  }
  if (p === '/api/bot/done' && req.method === 'POST') { // Script: the answer to one job
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    botLastSeen = Date.now();
    let pr;
    try { pr = open(String(b.project || '')); } catch { return fail(res, `no such project: ${b.project}`, 404); }
    try { return json(res, 200, RF.ownsJob(pr, b.job) ? (() => { const out = RF.botDone(pr, b); changed(); return out; })() : SC.botDone(pr, b)); }
    catch (e) { if (!e.code) console.error(e); return fail(res, e.message, e.code || 400); }
  }

  // ---- brainstorm, inside a project
  const bm = p.match(/^\/api\/projects\/([^/]+)\/(session|card)(?:\/([a-z0-9]+)\/([a-z-]+))?$/);
  if (bm && req.method === 'POST') {
    const pr = projectOr404(res, bm[1]); if (!pr) return;
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    const who = name(b);
    if (!who) return fail(res, 'who?');
    try {
      let out;
      if (bm[2] === 'session' && !bm[3]) { const s = BS.createSession(pr, b, who); out = { ok: true, id: s.id }; }
      else if (bm[2] === 'session') out = BS.sessionAction(pr, bm[3], bm[4], b, who);
      else if (bm[2] === 'card' && !bm[3]) { const c = BS.createCard(pr, b, who); out = { ok: true, id: c.id }; }
      else out = BS.cardAction(pr, bm[3], bm[4], b, who);
      return json(res, 200, out);
    } catch (e) { return fail(res, e.message, e.code || 400); }
  }

  // ---- a project's files
  const fm = p.match(/^\/files\/([^/]+)\/(.+)$/);
  if (fm && req.method === 'GET') {
    let pid; try { pid = decodeURIComponent(fm[1]); } catch { res.writeHead(400); return res.end(); }
    if (!ID.test(pid)) { res.writeHead(404); return res.end(); }
    let pr; try { pr = open(pid); } catch { res.writeHead(404); return res.end(); }
    let rel; try { rel = decodeURIComponent(fm[2]); } catch { res.writeHead(400); return res.end(); }
    return serveFile(req, res, RF.fileOf(pr, rel));
  }

  // ---- references, inside a project
  const rm = p.match(/^\/api\/projects\/([^/]+)\/refs\/([a-z-]+(?:\/[a-z-]+)?)$/);
  if (rm && req.method === 'POST') {
    const pr = projectOr404(res, rm[1]); if (!pr) return;
    const act = rm[2];
    try {
      if (act === 'upload') { // the file is the body; who and where are in the query
        const who = String(url.searchParams.get('who') || '').trim().slice(0, 40);
        if (!who) return fail(res, 'who?');
        const buf = await rawBody(req);
        const q = Object.fromEntries(['ref', 'variant', 'slot', 'kind'].map((k) => [k, url.searchParams.get(k) || '']));
        const out = await RF.upload(pr, q, buf, req.headers['content-type'], who);
        changed();
        return json(res, 200, out);
      }
      const b = await body(req);
      if (!b) return fail(res, 'bad json');
      const who = name(b);
      if (!who) return fail(res, 'who?');
      if (act === 'copy') { const out = RF.copyTo(pr, b.ref, String(b.to || ''), who); changed(); return json(res, 200, out); }
      const out = await RF.action(pr, act, b, who);
      return json(res, 200, out);
    } catch (e) { if (!e.code) console.error(e); return fail(res, e.message, typeof e.code === 'number' ? e.code : 400); }
  }

  // ---- promoted cards: cleaned in Brainstorm → Promoted, then sent on
  const pm = p.match(/^\/api\/projects\/([^/]+)\/promoted\/([a-z0-9]+)\/(edit|send)$/);
  if (pm && req.method === 'POST') {
    const pr = projectOr404(res, pm[1]); if (!pr) return;
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    const who = name(b);
    if (!who) return fail(res, 'who?');
    try { return json(res, 200, BS.promotedAction(pr, pm[2], pm[3], b, who)); }
    catch (e) { if (!e.code) console.error(e); return fail(res, e.message, e.code || 400); }
  }

  // ---- script, inside a project
  const sm = p.match(/^\/api\/projects\/([^/]+)\/script\/([a-z-]+(?:\/[a-z-]+)?)$/);
  if (sm) {
    const pr = projectOr404(res, sm[1]); if (!pr) return;
    const act = sm[2];
    const q = (k) => url.searchParams.get(k);
    if (req.method === 'GET') {
      try {
        if (act === 'version') return json(res, 200, SC.version(pr, q('draft'), q('v')));
        if (act === 'snap') return json(res, 200, SC.snap(pr, q('h')));
        if (act === 'sesh') return json(res, 200, SC.seshDetail(pr, q('id')));
        if (act === 'promo') return json(res, 200, SC.promo(pr, q('draft')));
        if (act === 'export/pdf' || act === 'export/fountain') {
          const out = SC.exportDraft(pr, q('draft'), act.slice(7));
          if (!out) return fail(res, 'nothing to export yet', 404);
          res.writeHead(200, { 'content-type': out.type, 'cache-control': 'no-store', ...(out.filename ? { 'content-disposition': `attachment; filename="${out.filename}"` } : {}) });
          return res.end(out.body);
        }
      } catch (e) { return fail(res, e.message, e.code || 400); }
      return fail(res, 'nothing here', 404);
    }
    if (req.method === 'POST') {
      const b = await body(req);
      if (!b) return fail(res, 'bad json');
      const who = name(b);
      if (!who) return fail(res, 'who?');
      try { return json(res, 200, SC.action(pr, act, b, who)); }
      catch (e) { if (!e.code) console.error(e); return fail(res, e.message, e.code || 400); }
    }
  }

  if (p === '/api/projects' && req.method === 'GET') return json(res, 200, { projects: picture({}).projects });
  if (p === '/api/projects' && req.method === 'POST') {
    const b = await body(req);
    const who = name(b);
    const title = String(b?.name || '').trim().slice(0, 80);
    if (!who) return fail(res, 'who?');
    if (!title) return fail(res, 'a project needs a name');
    try { const pr = track(createProject({ name: title, by: who })); changed(); return json(res, 200, { ok: true, id: pr.id }); }
    catch (e) { return fail(res, e.message); }
  }

  const m = p.match(/^\/api\/projects\/([^/]+)(?:\/(join|export|delete|update))?$/);
  if (m) {
    const pr = projectOr404(res, m[1]); if (!pr) return;
    const sub = m[2] || '';
    if (sub === 'join' && req.method === 'POST') { // opening a project puts you in it
      const who = name(await body(req));
      if (!who) return fail(res, 'who?');
      if (!pr.people().some((x) => x.name === who)) { pr.addPerson(who); pr.log('project', 'joined', 'joined the project', who); }
      return json(res, 200, { ok: true });
    }
    if (sub === 'update' && req.method === 'POST') { // name, logline, colour
      const b = await body(req);
      const who = name(b);
      if (!who) return fail(res, 'who?');
      const next = pr.update({ name: b.name, logline: b.logline, color: b.color }, who);
      return json(res, 200, { ok: true, ...next });
    }
    if (sub === 'delete' && req.method === 'POST') { // to data/trash, not gone for good
      const b = await body(req);
      const who = name(b);
      if (!who) return fail(res, 'who?');
      if (String(b.name || '').trim() !== pr.info().name) return fail(res, 'type the project’s name exactly to delete it');
      tracked.delete(pr.id);
      const to = deleteProject(pr.id);
      changed();
      return json(res, 200, { ok: true, trash: to });
    }
    if (sub === 'export') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${pr.id}-${new Date().toISOString().slice(0, 10)}.json"` });
      return res.end(JSON.stringify(pr.export(), null, 1));
    }
    if (!sub && req.method === 'GET') return json(res, 200, { overview: pr.overview() });
    return fail(res, 'nothing here', 404);
  }

  if (p.startsWith('/api/')) return fail(res, 'nothing here', 404);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`port ${PORT} is busy — the app is probably already running: open http://localhost:${PORT}\n(or stop the other one: lsof -ti :${PORT} | xargs kill, or pick another port: npm start -- --port=3145)`);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`π production system → http://localhost:${PORT}   (projects: ${PROJECTS_DIR})`);
  console.log('bot: "npm run bot" (a Claude Code terminal) or "npm run auto" (headless) — one queue for Brainstorm, Script and References');
});
