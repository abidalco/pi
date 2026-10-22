// π production system · Section 2 Script — demo server.
// Zero dependencies. One JSON file. SSE pushes the whole (light) state to every open tab.
// The AI is not in here: a Claude Code terminal long-polls /api/bot/next for one job at a time
// (Generator, Pacing, Breakdown, Continuity Judge, placement, skeleton) and answers via /api/bot/done.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PERSONALITIES, TWISTS, BLOCK_TYPES, FRAMINGS, SAMPLE } from './lib/data.mjs';
import { DEMO } from './lib/demo.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const argv = process.argv.slice(2);
const flag = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const PORT = Number(flag('port') || process.env.PORT || 3143);
const DATA_DIR = flag('data') || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BRAINSTORM_URL = flag('brainstorm') || process.env.PI_BRAINSTORM_URL || 'http://localhost:3142';
// the brainstorm demo sits next to this one: pi-brainstorm/ locally, brainstorm-demo/ in the repo
const BRAINSTORM_FILE = ['pi-brainstorm', 'brainstorm-demo'].map((d) => path.join(ROOT, '..', d, 'data', 'state.json')).find((f) => fs.existsSync(f)) || path.join(ROOT, '..', 'brainstorm-demo', 'data', 'state.json');
const BOT_SEEN_WINDOW = 3 * 60 * 1000;
const JUDGE_EDIT_DELAY = 6000; // a locked scene is re-checked this long after the last edit

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------- state
const fresh = () => ({
  seq: 0,
  started: false,
  project: { title: '', logline: '', characters: [], members: [], notes: '', from: null },
  settings: { staleBy: 'scene' }, // 'scene' = the spec · 'shot' = only shots whose blocks changed
  mainId: null,
  drafts: {},     // id → Draft
  assets: {},     // id → mock downstream asset (image / video / audio)
  snaps: {},      // content hash → blocks, so Stale can show what changed
  facts: [],      // Story Bible Facts Ledger: written by the Judge or the team, editable by anyone
  exceptions: [], // dismissed ⚠️ flags — "we know, it's intentional"
  log: [],        // who changed what, with which personality / twist (each line belongs to a sesh)
  seshes: {},     // id → Sesh: a titled stretch of work, saved as a version, reviewed afterwards
  jobs: [],       // the bot's inbox
  imported: [],   // brainstorm card ids already brought in
});

let S = fresh();
if (!argv.includes('--reset') && fs.existsSync(STATE_FILE)) {
  try { S = { ...fresh(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; }
  catch (e) { console.error('state.json unreadable, starting fresh:', e.message); }
}

// older state files: votes are gone; work since the last version becomes the draft's open sesh
function migrate() {
  delete S.proposals;
  S.seshes ||= {};
  for (const d of Object.values(S.drafts)) {
    if (d.sesh !== undefined) continue;
    d.sesh = null;
    delete d.orderApproved; delete d.orderApprovedAt;
    const last = d.versions.at(-1);
    const evs = S.log.filter((l) => l.draft === d.id && !l.sesh && l.ts > (last?.ts || 0) && !/^👎 rejected|^⌀ void/.test(l.text));
    if (!evs.length) continue;
    for (const e of evs) {
      e.text = e.text.replace(/^✅ passed: Move (\d+) (.+) → position (\d+)$/, '↕ moved “$2” $1 → $3').replace(/^✅ passed: Place “(.+)” (after .+|at the start)$/, '⤴ placed “$1” $2').replace(/^✅ passed: Lock (.+)$/, '🔒 locked $1');
      if (/^✅ passed/.test(e.text)) e.kind = 'move';
    }
    const id = `ss${(++S.seq).toString(36)}`;
    const people = [...new Set(evs.map((e) => e.who).filter((w) => w && w !== 'bot' && w !== 'system'))];
    const t = new Date(evs[0].ts);
    S.seshes[id] = { id, draft: d.id, title: `${t.toLocaleDateString('en-GB', { weekday: 'short' })} ${t.toTimeString().slice(0, 5)} sesh`, titled: false, by: people[0] || 'system', people,
      startedAt: evs[0].ts, lastAt: Date.now(), endedAt: null, status: 'open', changes: evs.length, base: last ? JSON.parse(JSON.stringify(last.snap)) : { order: [], floating: [], scenes: {} },
      baseV: last?.n || 0, v: null, tags: [], note: '', reviewedBy: null, reviewedAt: null, followsUp: null };
    for (const e of evs) e.sesh = id;
    d.sesh = id;
  }
}
migrate();
function migrateFacts() {
  const m = S.drafts[S.mainId];
  for (const f of S.facts || []) {
    if (f.source) continue;
    const sc = m && (m.scenes[f.scene] || Object.values(m.scenes).find((x) => x.title === f.scene));
    f.fact = String(f.fact || '').replace(/\s*\((?:sc\.?|scene)\s*\d+[^)]*\)\s*$/i, '').trim();
    Object.assign(f, { scene: sc ? sc.id : null, sceneTitle: sc ? sc.title : String(f.scene || ''), source: 'judge', by: 'bot', hash: null, edited: null, doubt: null });
    f.hash = sc ? hashOf(sc.blocks.filter((b) => b.type !== 'note' && !b.alt)) : null;
  }
}

const nid = (p) => `${p}${(++S.seq).toString(36)}`;
let CLOCK = 0; // the demo builder winds this back to stage its history
const now = () => Date.now() - CLOCK;
const clone = (x) => JSON.parse(JSON.stringify(x));
const str = (v, n = 4000) => String(v ?? '').slice(0, n);
class E extends Error {}
const bad = (m) => { throw new E(m); };

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(S)); }
    catch (e) { console.error(`state not saved (${e.code}): ${e.message}`); } // a full disk must not kill the demo
  }, 80);
}

// ---------------------------------------------------------------- blocks & hashes
const FIELDS = { heading: ['intExt', 'location', 'time'], action: ['text'], dialogue: ['character', 'paren', 'line'], transition: ['text'], note: ['text'] };
const INT_EXT = ['INT.', 'EXT.', 'INT./EXT.', ''];

function contentOf(b) {
  const o = { type: b.type };
  for (const f of FIELDS[b.type] || []) o[f] = b[f] || '';
  return o;
}
function makeBlock(raw) {
  const type = FIELDS[raw?.type] ? raw.type : 'action';
  const b = { id: nid('b'), type };
  for (const f of FIELDS[type]) b[f] = str(raw?.[f] ?? (f === 'text' || f === 'line' ? raw?.text ?? raw?.line ?? '' : ''));
  if (type === 'heading') b.intExt = INT_EXT.includes(String(b.intExt).toUpperCase()) ? String(b.intExt).toUpperCase() : normIntExt(b.intExt);
  return b;
}
function normIntExt(v) {
  const s = String(v || '').toUpperCase().replace(/\s/g, '');
  if (s.startsWith('INT') && s.includes('EXT')) return 'INT./EXT.';
  if (s.startsWith('INT')) return 'INT.';
  if (s.startsWith('EXT')) return 'EXT.';
  return '';
}
// Notes are team-only and alternates are not chosen yet: neither is "the script", so neither can make an asset stale.
const scriptBlocks = (sc) => sc.blocks.filter((b) => b.type !== 'note' && !b.alt);
const hashOf = (blocks) => crypto.createHash('sha1').update(JSON.stringify(blocks.map(contentOf))).digest('hex').slice(0, 12);
const sceneHash = (sc) => hashOf(scriptBlocks(sc));
function shotHash(sc, shot) {
  const ids = new Set(shot.blocks || []);
  const covered = scriptBlocks(sc).filter((b) => ids.has(b.id));
  return covered.length ? hashOf(covered) : sceneHash(sc);
}
function keepSnap(sc) {
  const h = sceneHash(sc);
  if (!S.snaps[h]) S.snaps[h] = scriptBlocks(sc).map((b) => ({ id: b.id, ...contentOf(b) }));
  return h;
}
const hasContent = (sc) => scriptBlocks(sc).some((b) => b.type !== 'heading' && ((b.text || b.line || '').trim()));
const headingText = (b) => [b.intExt, b.location, b.time && `- ${b.time}`].filter(Boolean).join(' ').toUpperCase();

// ---------------------------------------------------------------- drafts, scenes, lifecycle
const main = () => S.drafts[S.mainId];
const canEdit = (d, who) => !!d && (d.isMain || d.owner === 'team' || d.owner === who);
const num = (d, id) => { const i = d.order.indexOf(id); return i < 0 ? null : i + 1; };
const shotNum = (d, sc, shot) => { const n = num(d, sc.id); return n == null ? null : `${n}.${sc.shots.indexOf(shot) + 1}`; };

function newScene(title, blocks = []) {
  return { id: nid('sc'), title: str(title, 120) || 'Untitled scene', blocks: blocks.map(makeBlock), lock: null, check: null, editCheck: null, shots: [], pacing: null, placeSuggestion: null, from: null };
}
function newDraft({ name, owner, isMain = false }) {
  return { id: nid('d'), name, owner, isMain, forkedFrom: null, createdAt: now(), editedAt: now(), order: [], floating: [], scenes: {}, versions: [] };
}

// The Judge is the only check before a lock: ok or ⚠️ locks, ❌ doesn't. No team votes anywhere.
function checkOk(sc) {
  const c = sc.check;
  return !!c && c.state === 'done' && c.hash === sceneHash(sc) && c.verdict !== 'block';
}
// Floating → Placed → Drafted → Locked → Broken down. Derived, never stored.
function statusOf(d, sc) {
  if (d.floating.includes(sc.id)) return 'floating';
  if (sc.lock) return sc.shots.length && sc.shots.every((s) => s.status === 'approved') ? 'brokendown' : 'locked';
  return hasContent(sc) ? 'drafted' : 'placed';
}

function snapDraft(d) { return clone({ order: d.order, floating: d.floating, scenes: d.scenes }); }
const contentKey = (x) => JSON.stringify({ o: x.order, f: x.floating, s: Object.fromEntries(Object.entries(x.scenes).map(([id, sc]) => [id, [sc.title, sc.blocks.map((b) => [b.id, contentOf(b), b.alt?.group || 0])]])) });

function saveVersion(d, { name = '', auto = false, reason = '', who = 'system', sesh = null } = {}) {
  const n = (d.versions.at(-1)?.n || 0) + 1;
  d.versions.push({ n, name: str(name, 80), auto, reason, by: who, ts: now(), sesh, snap: snapDraft(d) });
  return n;
}

// Main keeps its locks / Judge checks / shot lists by scene id whenever its content is replaced
// (restore, making another draft Main): a changed locked scene shows up as Stale.
function adoptContent(target, snap, carryFrom) {
  const keep = {};
  for (const [id, sc] of Object.entries(carryFrom.scenes)) keep[id] = { lock: sc.lock, check: sc.check, editCheck: sc.editCheck, shots: sc.shots, pacing: sc.pacing };
  target.order = clone(snap.order); target.floating = clone(snap.floating); target.scenes = clone(snap.scenes);
  for (const [id, sc] of Object.entries(target.scenes)) Object.assign(sc, keep[id] || { lock: null, check: null, editCheck: null, shots: [] });
}

function stripPipeline(d) { for (const sc of Object.values(d.scenes)) { sc.lock = null; sc.check = null; sc.editCheck = null; sc.shots = []; } }

function log(who, kind, text, extra = {}) {
  const e = { id: nid('l'), ts: now(), who, kind, text, ...extra };
  S.log.push(e);
  if (S.log.length > 3000) S.log.splice(0, S.log.length - 3000);
  return e;
}

function insertAfter(order, id, after) {
  const i = after ? order.indexOf(after) : -1;
  order.splice(after && i < 0 ? order.length : i + 1, 0, id);
}

// ---------------------------------------------------------------- seshes
// Work is never approved while it happens. The first change to a draft opens a sesh; everything done in it is
// logged against it. Ending a sesh (or 45 min of quiet) saves a version named after it. Afterwards the sesh is
// reviewed: approved, or tagged (what needs work) and picked up again in a follow-up sesh.
const SESH_IDLE = 45 * 60 * 1000;
const humans = (who) => who && who !== 'bot' && who !== 'system';
const seshTitle = (t = now()) => { const x = new Date(t); return `${x.toLocaleDateString('en-GB', { weekday: 'short' })} ${x.toTimeString().slice(0, 5)} sesh`; };

function openSesh(d, who) {
  let s = d.sesh && S.seshes[d.sesh];
  if (s && s.status === 'open') { if (humans(who) && !s.people.includes(who)) s.people.push(who); return s; }
  s = { id: nid('ss'), draft: d.id, title: seshTitle(), titled: false, by: humans(who) ? who : 'system', people: humans(who) ? [who] : [],
    startedAt: now(), lastAt: now(), endedAt: null, status: 'open', changes: 0, base: snapDraft(d), baseV: d.versions.at(-1)?.n || 0, v: null,
    tags: [], note: '', reviewedBy: null, reviewedAt: null, followsUp: null };
  S.seshes[s.id] = s; d.sesh = s.id;
  return s;
}
function track(d, who, kind, text, extra = {}) {
  const s = openSesh(d, who);
  s.changes++; s.lastAt = now();
  return log(who, kind, text, { draft: d.id, sesh: s.id, ...extra });
}
// typing: one line per scene per person, counting edits, instead of a line per keystroke
function trackEdit(d, who, sc) {
  const s = openSesh(d, who);
  s.changes++; s.lastAt = now();
  const e = [...S.log].reverse().find((x) => x.sesh === s.id && x.kind === 'edit' && x.scene === sc.id && x.who === who && now() - x.ts < 15 * 60 * 1000);
  const label = () => `✎ edited ${num(d, sc.id) ? `sc. ${num(d, sc.id)} ` : ''}${sc.title}`;
  if (e) { e.n = (e.n || 1) + 1; e.ts = now(); e.text = `${label()} (${e.n} changes)`; return e; }
  return log(who, 'edit', label(), { draft: d.id, sesh: s.id, scene: sc.id, n: 1 });
}
function endSesh(s, who, title) {
  if (!s || s.status !== 'open') return null;
  const d = S.drafts[s.draft];
  if (title) { s.title = str(title, 80); s.titled = true; }
  if (d) d.sesh = null;
  s.endedAt = now(); s.endedBy = who;
  if (!d || !s.changes) { s.status = 'empty'; return s; } // nothing happened
  s.status = 'saved';
  s.v = saveVersion(d, { name: s.title, sesh: s.id, who });
  log(who, 'sesh', `💾 sesh “${s.title}” saved as ${d.isMain ? 'Main' : d.name} v${s.v} (${s.changes} changes)`, { draft: d.id, sesh: s.id });
  return s;
}
setInterval(() => {
  let any = false;
  for (const s of Object.values(S.seshes)) if (s.status === 'open' && now() - s.lastAt > SESH_IDLE) { endSesh(s, 'system'); any = true; }
  if (any) changed();
}, 60 * 1000).unref();

function promoteToMain(nw, who) {
  const old = main();
  if (!nw || nw === old) return;
  endSesh(S.seshes[old.sesh], who);
  adoptContent(nw, snapDraft(nw), old);
  old.isMain = false; old.owner = 'team'; old.name = `Former Main (until ${new Date().toTimeString().slice(0, 5)})`;
  nw.formerName = nw.name; nw.name = 'Main'; nw.owner = 'team'; nw.isMain = true;
  S.mainId = nw.id;
  track(nw, who, 'main', `⭐ ${nw.formerName} is now Main. The old Main stays in the list.`);
}

function promoSummary(target) {
  const m = main();
  const out = { same: 0, changed: [], added: [], dropped: [], staleAssets: 0, orphanAssets: 0 };
  for (const [id, sc] of Object.entries(target.scenes)) {
    const o = m.scenes[id];
    if (!o) out.added.push(sc.title);
    else if (sceneHash(o) === sceneHash(sc) && o.title === sc.title) out.same++;
    else out.changed.push(`${o.lock ? '🔒 ' : ''}${sc.title}`);
  }
  for (const [id, sc] of Object.entries(m.scenes)) if (!target.scenes[id]) out.dropped.push(sc.title);
  for (const a of Object.values(S.assets)) {
    const t = target.scenes[a.scene];
    if (!t) { out.orphanAssets++; continue; }
    const shot = m.scenes[a.scene]?.shots.find((s) => s.id === a.shot);
    if (!shot) continue;
    const cur = S.settings.staleBy === 'shot' ? shotHash(t, shot) : sceneHash(t);
    if (cur !== (S.settings.staleBy === 'shot' ? a.madeFromShot : a.madeFromScene)) out.staleAssets++;
  }
  return out;
}

// ---------------------------------------------------------------- live sync
const clients = new Set(); // { res, who }
let botWaiter = null;
let botLastSeen = 0;
let delivering = false;
const presence = {}; // name → { draft, scene, block, ts }
const botOnline = () => !!botWaiter || now() - botLastSeen < BOT_SEEN_WINDOW;

function decorate(d) {
  const { versions, ...rest } = d;
  const scenes = {};
  for (const [id, sc] of Object.entries(d.scenes)) {
    scenes[id] = { ...sc, _hash: sceneHash(sc), _status: statusOf(d, sc), _num: num(d, id),
      shots: sc.shots.map((s) => ({ ...s, _hash: shotHash(sc, s), _num: shotNum(d, sc, s) })) };
  }
  return { ...rest, scenes, versions: versions.map(({ snap, ...v }) => v) };
}

const seshMeta = ({ base, ...rest }) => rest;
function publicState() {
  const drafts = {};
  for (const [id, d] of Object.entries(S.drafts)) drafts[id] = decorate(d);
  const online = [...new Set([...clients].map((c) => c.who).filter(Boolean))];
  return {
    started: S.started, project: S.project, settings: S.settings, mainId: S.mainId, drafts,
    seshes: Object.fromEntries(Object.entries(S.seshes).filter(([, x]) => x.status !== 'empty').map(([id, x]) => [id, seshMeta(x)])),
    assets: S.assets, facts: S.facts, exceptions: S.exceptions,
    log: S.log.slice(-200), jobs: S.jobs.slice(-80).map(({ result, ...j }) => ({ ...j, result: j.type === 'generate' ? result : result ? true : null })),
    imported: S.imported, presence, online,
    botOnline: botOnline(), botWaiting: !!botWaiter, pendingJobs: S.jobs.filter((j) => j.status === 'pending').length,
    personalities: PERSONALITIES, twists: TWISTS, blockTypes: BLOCK_TYPES, framings: FRAMINGS, brainstormUrl: BRAINSTORM_URL,
  };
}

let pushTimer = null;
function changed() {
  save();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const data = `data: ${JSON.stringify(publicState())}\n\n`;
    for (const c of clients) c.res.write(data);
  }, 40);
}

// ---------------------------------------------------------------- brainstorm bridge
async function brainstormCards() {
  let st = null;
  try {
    const r = await fetch(`${BRAINSTORM_URL}/api/state`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) st = await r.json();
  } catch {}
  if (!st) { try { st = JSON.parse(fs.readFileSync(BRAINSTORM_FILE, 'utf8')); } catch { return { source: 'none', cards: [] }; } }
  const cards = Object.values(st.cards || {}).filter((c) => c.status === 'promoted').map((c) => {
    const s = st.sessions?.[c.session];
    return { id: c.id, title: c.title, note: c.note, fields: c.fields || {}, type: s?.type || '?', topic: s?.topic || '', promotedTo: c.promotedTo, sparkedBy: c.sparkedBy, imported: S.imported.includes(c.id) };
  });
  return { source: st.sessions ? 'brainstorm' : 'none', cards };
}
const fieldText = (v) => (Array.isArray(v) ? v.join('\n') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

function parseHeading(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(INT\.?\s*\/\s*EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s+(.+?)(?:\s+[-–—]\s+(.+))?$/i);
  if (m) return { type: 'heading', intExt: normIntExt(m[1]), location: m[2].toUpperCase(), time: (m[3] || '').toUpperCase() };
  return { type: 'heading', intExt: '', location: t.toUpperCase().slice(0, 80), time: '' };
}
function parseLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\n+/)) {
    const line = raw.trim().replace(/^[-•*]\s*/, '');
    if (!line) continue;
    const m = line.match(/^([A-Za-zÀ-ÿ؀-ۿ][\wÀ-ÿ؀-ۿ .'’-]{0,30}?)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/);
    if (m) out.push({ type: 'dialogue', character: m[1].trim().toUpperCase(), paren: (m[2] || '').trim(), line: m[3].trim() });
    else out.push({ type: 'action', text: line });
  }
  return out;
}
function addCharacter(name) {
  const n = String(name || '').trim().toUpperCase().replace(/\s*\(.*\)$/, '');
  if (n && n.length <= 40 && !S.project.characters.includes(n)) S.project.characters.push(n);
}

// ---------------------------------------------------------------- export
function fountain(d, { title = true, scenes = null } = {}) {
  const lines = [];
  if (title) lines.push(`Title: ${S.project.title || 'Untitled'}`, ...(S.project.logline ? [`Notes: ${S.project.logline}`] : []), `Draft date: ${new Date().toISOString().slice(0, 10)}`, '', '');
  for (const id of scenes || d.order) {
    const sc = d.scenes[id];
    if (!sc) continue;
    const n = num(d, id);
    let headed = false;
    for (const b of scriptBlocks(sc)) {
      if (b.type === 'heading') {
        const h = headingText(b) || sc.title.toUpperCase();
        lines.push(`${b.intExt ? '' : '.'}${h}${n ? ` #${n}#` : ''}`, ''); headed = true;
      } else {
        if (!headed) { lines.push(`.${sc.title.toUpperCase()}${n ? ` #${n}#` : ''}`, ''); headed = true; }
        if (b.type === 'action') lines.push(...b.text.split('\n').map((l) => (l && l === l.toUpperCase() && /[A-Z]/.test(l) ? `!${l}` : l)), '');
        if (b.type === 'dialogue') lines.push(`${(b.character || 'SOMEONE').toUpperCase()}`, ...(b.paren ? [`(${b.paren.replace(/^\(|\)$/g, '')})`] : []), b.line, '');
        if (b.type === 'transition') { const t = b.text.toUpperCase(); lines.push(/TO:$/.test(t) ? t : `> ${t}`, ''); }
      }
    }
    if (!headed) lines.push(`.${sc.title.toUpperCase()}${n ? ` #${n}#` : ''}`, '');
  }
  return lines.join('\n');
}

const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function printable(d) {
  const body = d.order.map((id) => {
    const sc = d.scenes[id];
    const n = num(d, id);
    let headed = false;
    const parts = scriptBlocks(sc).map((b) => {
      if (b.type === 'heading') { headed = true; return `<div class="h"><span class="n">${n}</span>${escH(headingText(b) || sc.title.toUpperCase())}<span class="n r">${n}</span></div>`; }
      if (b.type === 'action') return `<div class="a">${escH(b.text)}</div>`;
      if (b.type === 'dialogue') return `<div class="d"><div class="c">${escH((b.character || '').toUpperCase())}</div>${b.paren ? `<div class="p">(${escH(b.paren.replace(/^\(|\)$/g, ''))})</div>` : ''}<div class="l">${escH(b.line)}</div></div>`;
      if (b.type === 'transition') return `<div class="t">${escH(b.text.toUpperCase())}</div>`;
      return '';
    }).join('');
    return (headed ? '' : `<div class="h"><span class="n">${n}</span>${escH(sc.title.toUpperCase())}<span class="n r">${n}</span></div>`) + parts;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escH(S.project.title || 'Script')} — ${escH(d.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:25mm 25mm 25mm 38mm}body{font:12pt/1.2 "Courier Prime","Courier New",monospace;color:#000;max-width:6.2in;margin:30px auto}
.title{height:80vh;display:flex;flex-direction:column;justify-content:center;text-align:center;page-break-after:always}.title h1{font-size:12pt;text-transform:uppercase;text-decoration:underline;margin:0 0 2em}
.h{font-weight:700;margin:2em 0 1em;position:relative}.n{position:absolute;left:-.6in}.n.r{left:auto;right:-.6in}.a{white-space:pre-wrap;margin:0 0 1em}.d{margin:0 0 1em}
.c{margin-left:2.1in}.p{margin-left:1.5in}.l{margin-left:1in;margin-right:1.4in;white-space:pre-wrap}.t{text-align:right;margin:1em 0}
@media print{.bar{display:none}}.bar{font:13px system-ui;background:#f4f3ee;padding:8px 12px;border-radius:8px;margin-bottom:20px}</style></head>
<body><div class="bar">${escH(d.name)} · notes and alternates are never exported · use the print dialog → Save as PDF</div>
<div class="title"><h1>${escH(S.project.title || 'Untitled')}</h1>${S.project.logline ? `<div>${escH(S.project.logline)}</div>` : ''}<div style="margin-top:3em">${escH(new Date().toISOString().slice(0, 10))}</div></div>
${body}<script>addEventListener('load',()=>setTimeout(()=>print(),400))</script></body></html>`;
}

// ---------------------------------------------------------------- bot jobs
function enqueue(type, who, fields) {
  const j = { id: nid('j'), type, by: who, ts: now(), status: 'pending', result: null, ...fields };
  S.jobs.push(j);
  if (S.jobs.length > 300) S.jobs.splice(0, S.jobs.length - 300);
  setImmediate(tryDeliver);
  return j;
}

const sceneView = (d, sc) => ({ id: sc.id, number: num(d, sc.id), title: sc.title, status: statusOf(d, sc), blocks: sc.blocks.filter((b) => !b.alt).map((b) => ({ id: b.id, ...contentOf(b) })), script: fountain(d, { title: false, scenes: [sc.id] }) });
const outlineOf = (d) => d.order.map((id) => { const sc = d.scenes[id]; const h = sc.blocks.find((b) => b.type === 'heading'); return { id, number: num(d, id), title: sc.title, heading: h ? headingText(h) : '', status: statusOf(d, sc) }; });

// ---------------------------------------------------------------- facts ledger
// A fact points at its scene by id (the number is shown live, never written into the text) and remembers the
// scene's content when it was written, so the Bible can say "this scene changed since — still true?".
const cleanFact = (t) => str(t, 300).replace(/\s*\((?:sc\.?|scene)\s*\d+[^)]*\)\s*$/i, '').trim();
function addFact(text, { scene = null, source = 'judge', by = 'bot' } = {}) {
  const fact = cleanFact(text);
  if (!fact || S.facts.some((x) => x.fact.toLowerCase() === fact.toLowerCase())) return null;
  const sc = scene && main()?.scenes[scene];
  const f = { id: nid('f'), fact, scene: sc ? sc.id : null, sceneTitle: sc?.title || '', source, by, at: now(), hash: sc ? sceneHash(sc) : null, edited: null, doubt: null };
  S.facts.push(f);
  return f;
}
const factScene = (f) => (f.scene && main()?.scenes[f.scene]) || null;

async function canon() {
  const bs = await brainstormCards();
  return {
    promoted: bs.cards.map(({ title, type, promotedTo, fields, note }) => ({ title, type, promotedTo, fields, note })),
    facts: S.facts.map((f) => { const sc = factScene(f); return { id: f.id, fact: f.fact, scene: sc ? sc.title : f.sceneTitle || null, by: f.source === 'team' || f.edited ? 'team' : 'judge' }; }),
    exceptions: S.exceptions.map((x) => `${x.scene}: ${x.note} — dismissed: “${x.reason}”`),
    characters: S.project.characters, title: S.project.title, logline: S.project.logline,
  };
}

async function jobContext(j) {
  const d = S.drafts[j.draft];
  const sc = d?.scenes[j.scene];
  if (j.type === 'skeleton') return { idea: j.idea, task: 'Build the script skeleton from the promoted Idea: title, logline, character list, and empty scene cards (title + one-line note each). 4–10 scenes.', reply: { title: '…', logline: '…', characters: ['NAME'], scenes: [{ title: '…', note: '…' }] } };
  if (!sc) return { error: 'the scene for this job no longer exists — reply with {"skip":true}' };
  const scene = sceneView(d, sc);
  if (j.type === 'generate') {
    const p = j.personality.key === 'custom' ? { name: 'Custom', prompt: j.personality.custom || 'Be yourself.' } : PERSONALITIES[j.personality.key];
    const tw = TWISTS[j.twistPicked || j.twist] || TWISTS.none;
    const ids = new Set(j.blocks);
    const i = d.order.indexOf(sc.id);
    return {
      task: 'Generator: return 2–4 genuinely different options for the SELECTED blocks, in the personality\'s voice, applying the twist. Each option is a list of blocks that would replace the selection.',
      personality: { name: p.name, prompt: p.prompt }, twist: { name: tw.name, rule: tw.rule }, ask: j.ask || null,
      selected: j.refine?.length ? j.refine : scene.blocks.filter((b) => ids.has(b.id)), refining: !!j.refine?.length,
      scene, prev: i > 0 ? outlineOf(d)[i - 1] : null, next: i >= 0 && i < d.order.length - 1 ? outlineOf(d)[i + 1] : null,
      characters: S.project.characters, story: { title: S.project.title, logline: S.project.logline },
      reply: { options: [{ note: 'one line on what this option does', blocks: [{ type: 'dialogue', character: 'MAYA', paren: '', line: '…' }] }] },
    };
  }
  if (j.type === 'pacing') return { task: 'Pacing check for this scene: where it drags, where it rushes, what could go. Proposals only.', scene, outline: outlineOf(d), reply: { summary: '2–3 sentences', notes: [{ block: 'block id or null', note: '…' }] } };
  if (j.type === 'breakdown') return { task: 'Break this locked scene into shots. Every shot lists the block ids it covers. Global numbering is done by the app.', scene, characters: S.project.characters, framings: FRAMINGS, reply: { shots: [{ framing: 'WS', camera: 'static', characters: 'MAYA', location: 'ROOF', action: '…', dialogue: '…', duration: 4, refs: '', blocks: ['b…'] }] } };
  if (j.type === 'place') return { task: 'Continuity Judge: suggest where this floating scene fits in the order. after = id of the scene it should follow, or null for the very start.', scene, outline: outlineOf(d), canon: await canon(), reply: { after: 'sc… or null', reason: 'one line' } };
  if (j.type === 'judge_lock' || j.type === 'judge_edit') {
    const others = d.order.filter((id) => id !== sc.id).map((id) => sceneView(d, d.scenes[id])).map(({ id, number, title, script }) => ({ id, number, title, script }));
    const locked = j.type === 'judge_edit' && sc.lock ? S.snaps[sc.lock.hash] : null;
    return {
      task: j.type === 'judge_lock'
        ? 'Continuity Judge, before a lock: check this scene against the Story Bible and every other scene. ok = consistent; warn = possible problem the team can dismiss as intentional; block = contradiction that must be fixed. Also extract new facts (who has / knows / lost what) for the Facts Ledger.'
        : 'Continuity Judge, after an edit to a LOCKED scene: say what changed against the locked version, whether it now contradicts anything, and extract new facts.',
      scene, lockedVersion: locked, otherScenes: others, canon: await canon(),
      sceneFacts: S.facts.filter((f) => f.scene === sc.id).map((f) => ({ id: f.id, fact: f.fact, by: f.source === 'team' || f.edited ? 'team' : 'judge' })),
      reply: { verdict: 'ok | warn | block', notes: [{ verdict: 'warn', note: '…', block: 'block id or null' }], facts: ['MAYA has the envelope'], retire: [{ id: 'f…', why: 'the line that said it is gone' }] },
    };
  }
  return {};
}

async function tryDeliver() {
  if (!botWaiter || delivering) return;
  const j = S.jobs.find((x) => x.status === 'pending');
  if (!j) return;
  delivering = true;
  const w = botWaiter;
  botWaiter = null;
  clearTimeout(w.timer);
  j.status = 'delivered'; j.deliveredAt = now();
  let ctx;
  try { ctx = await jobContext(j); } catch (e) { ctx = { error: e.message }; }
  delivering = false;
  botLastSeen = now();
  json(w.res, { job: { id: j.id, type: j.type, by: j.by }, ...ctx, reply_with: `node bot/done.mjs <<'EOF'\n{ ...reply }\nEOF   (job defaults to ${j.id})` });
  changed();
}

function sanitizeBlocks(list) { return (Array.isArray(list) ? list : []).filter((b) => b && FIELDS[b.type]).slice(0, 40).map((b) => { const m = makeBlock(b); delete m.id; return m; }); }

function finishJob(j, b) {
  const d = S.drafts[j.draft];
  const sc = d?.scenes[j.scene];
  if (b.skip) { j.status = 'failed'; j.note = 'skipped by the bot'; return 'skipped'; }
  if (j.type === 'skeleton') {
    const m = main();
    if (b.title) S.project.title = str(b.title, 120);
    if (b.logline) S.project.logline = str(b.logline, 600);
    for (const c of b.characters || []) addCharacter(c);
    for (const s of (b.scenes || []).slice(0, 20)) {
      const scn = newScene(s.title, s.note ? [{ type: 'note', text: s.note }] : []);
      m.scenes[scn.id] = scn; m.order.push(scn.id);
    }
    j.result = { scenes: (b.scenes || []).length };
    track(m, 'bot', 'skeleton', `🤖 built the skeleton: ${(b.scenes || []).length} scene cards, ${S.project.characters.length} characters`);
    return 'skeleton applied';
  }
  if (!sc) { j.status = 'failed'; j.note = 'scene gone'; return 'scene gone'; }
  if (j.type === 'generate') {
    const options = (b.options || []).slice(0, 6).map((o) => ({ note: str(o.note, 300), blocks: sanitizeBlocks(o.blocks) })).filter((o) => o.blocks.length);
    if (!options.length) bad('no usable options: each option needs blocks [{type, ...fields}]');
    j.result = { options };
    return `${options.length} options delivered`;
  }
  if (j.type === 'pacing') {
    sc.pacing = { summary: str(b.summary, 1200), notes: (b.notes || []).slice(0, 12).map((n) => ({ block: n.block || null, note: str(n.note, 400) })), by: j.by, at: now() };
    j.result = true;
    return 'pacing notes posted';
  }
  if (j.type === 'breakdown') {
    const ids = new Set(sc.blocks.map((x) => x.id));
    const shots = (b.shots || []).slice(0, 40).map((s) => newShot({ ...s, blocks: (s.blocks || []).filter((x) => ids.has(x)) }, 'bot'));
    sc.shots = [...sc.shots.filter((s) => s.status === 'approved'), ...shots];
    j.result = true;
    track(d, 'bot', 'shots', `🤖 proposed ${shots.length} shots for sc. ${num(d, sc.id)} ${sc.title}`, { scene: sc.id });
    return `${shots.length} shots proposed`;
  }
  if (j.type === 'place') {
    const after = b.after && d.order.includes(b.after) ? b.after : null;
    sc.placeSuggestion = { after, reason: str(b.reason, 400), at: now() };
    j.result = true;
    return 'placement suggested';
  }
  if (j.type === 'judge_lock' || j.type === 'judge_edit') {
    const notes = (b.notes || []).slice(0, 12).map((n) => ({ verdict: ['ok', 'warn', 'block'].includes(n.verdict) ? n.verdict : 'warn', note: str(n.note, 500), block: n.block || null, dismissed: false }));
    const worst = notes.some((n) => n.verdict === 'block') ? 'block' : notes.some((n) => n.verdict === 'warn') ? 'warn' : 'ok';
    const verdict = ['ok', 'warn', 'block'].includes(b.verdict) ? ({ ok: 0, warn: 1, block: 2 }[b.verdict] > { ok: 0, warn: 1, block: 2 }[worst] ? b.verdict : worst) : worst;
    for (const f of (b.facts || []).slice(0, 12)) if (f) addFact(typeof f === 'string' ? f : f.fact, { scene: sc.id });
    for (const r of (b.retire || []).slice(0, 12)) { // facts that stopped being true: the Judge removes its own, and only flags the team's
      const f = S.facts.find((x) => x.id === (typeof r === 'string' ? r : r.id));
      if (!f) continue;
      const why = str(typeof r === 'string' ? '' : r.why, 200);
      if (f.source === 'judge' && !f.edited) { S.facts = S.facts.filter((x) => x !== f); track(d, 'bot', 'fact', `⚖️ retired a fact: “${f.fact}”${why ? ` — ${why}` : ''}`, { scene: sc.id }); }
      else f.doubt = why || 'the Judge thinks this may no longer be true';
    }
    for (const f of S.facts) if (f.scene === sc.id && !f.doubt) f.hash = sceneHash(sc); // the Judge just checked them against this version
    const rec = { state: 'done', hash: j.hash, verdict, notes, at: now(), by: j.by };
    if (j.type === 'judge_edit') { sc.editCheck = rec; j.result = true; return `edit check: ${verdict}`; }
    sc.check = rec; j.result = true;
    track(d, 'bot', 'judge', `⚖️ ${{ ok: '✅', warn: '⚠️', block: '❌' }[verdict]} sc. ${num(d, sc.id) ?? '—'} ${sc.title}${notes.length ? ` — ${notes.map((n) => n.note).join(' · ').slice(0, 160)}` : ''}`, { scene: sc.id });
    if (checkOk(sc) && d.isMain) doLock(d, sc, j.by);
    return `judge: ${verdict}${sc.lock?.hash === sceneHash(sc) ? ' → locked' : ''}`;
  }
  return 'ok';
}

// No vote: the Judge passing (✅ or ⚠️) locks the scene for whoever asked. ⚠️ notes stay on it, dismissable.
function doLock(d, sc, who) {
  const h = keepSnap(sc);
  const re = !!sc.lock;
  sc.lock = { hash: h, at: now(), n: num(d, sc.id), by: [who] };
  sc.editCheck = null;
  track(d, who, 'lock', `🔒 ${re ? 're-locked' : 'locked'} sc. ${num(d, sc.id)} ${sc.title}`, { scene: sc.id });
}

// a locked scene that is edited gets re-checked by the Judge a few seconds after the last edit
const judgeTimers = {};
function touched(d, sc, who, { quiet = false } = {}) {
  d.editedAt = now();
  if (sc && !quiet) trackEdit(d, who, sc);
  if (!d.isMain || !sc?.lock) return;
  clearTimeout(judgeTimers[sc.id]);
  judgeTimers[sc.id] = setTimeout(() => {
    const cur = main()?.scenes[sc.id];
    if (!cur?.lock || sceneHash(cur) === cur.lock.hash) { if (cur) cur.editCheck = null; changed(); return; }
    const h = sceneHash(cur);
    if (cur.editCheck?.hash === h) return;
    const queued = S.jobs.find((x) => x.type === 'judge_edit' && x.scene === sc.id && x.status === 'pending');
    if (queued) queued.hash = h;
    else enqueue('judge_edit', who, { draft: S.mainId, scene: sc.id, hash: h });
    cur.editCheck = { state: 'checking', hash: h, notes: [], at: now() };
    changed();
  }, JUDGE_EDIT_DELAY);
}

function newShot(s = {}, by = 'team') {
  return {
    id: nid('sh'), framing: FRAMINGS.includes(String(s.framing).toUpperCase()) ? String(s.framing).toUpperCase() : str(s.framing, 20) || 'MS',
    camera: str(s.camera, 80), characters: str(Array.isArray(s.characters) ? s.characters.join(', ') : s.characters, 200),
    location: str(s.location, 120), action: str(s.action, 600), dialogue: str(s.dialogue, 600),
    duration: Math.max(0, Math.min(600, Number(s.duration) || 0)), refs: str(s.refs, 200), blocks: Array.isArray(s.blocks) ? s.blocks.slice(0, 40) : [],
    status: 'proposed', by,
  };
}

// ---------------------------------------------------------------- team actions
function ctxOf(b, who, { edit = true, needScene = true } = {}) {
  const d = S.drafts[b?.draft];
  if (!d) bad('no such draft');
  const sc = b.scene ? d.scenes[b.scene] : null;
  if (needScene && !sc) bad('no such scene');
  if (edit && !canEdit(d, who)) bad(`read-only: this is ${d.owner}'s draft. Fork it to change it.`);
  return { d, sc };
}
const findBlock = (sc, id) => { const i = sc.blocks.findIndex((x) => x.id === id); if (i < 0) bad('no such block'); return [sc.blocks[i], i]; };
const mainOnly = (d) => { if (!d.isMain) bad('only in ⭐ Main: locks, shot lists and downstream assets come from Main'); };

function startProject(mode, who, idea) {
  const keepMembers = S.project.members;
  S = { ...fresh(), seq: S.seq };
  S.project.members = keepMembers;
  const m = newDraft({ name: 'Main', owner: 'team', isMain: true });
  S.drafts[m.id] = m; S.mainId = m.id; S.started = true;
  if (mode === 'sample') {
    S.project.title = SAMPLE.title; S.project.logline = SAMPLE.logline; S.project.characters = [...SAMPLE.characters]; S.project.from = 'sample';
    for (const s of SAMPLE.scenes) { const sc = newScene(s.title, s.blocks); m.scenes[sc.id] = sc; m.order.push(sc.id); }
    for (const s of SAMPLE.floating) { const sc = newScene(s.title, s.blocks); sc.from = 'brainstorm (sample)'; m.scenes[sc.id] = sc; m.floating.push(sc.id); }
  } else if (mode === 'idea' && idea) {
    S.project.title = idea.title.replace(/^(pitch|idea)\s*[—–-]\s*/i, ''); S.project.logline = fieldText(idea.fields.logline);
    S.project.notes = ['synopsis', 'tone', 'themes'].map((k) => (idea.fields[k] ? `${k}: ${fieldText(idea.fields[k])}` : '')).filter(Boolean).join('\n');
    S.project.from = `💡 ${idea.title}`;
    S.imported.push(idea.id);
    enqueue('skeleton', who, { idea: { title: idea.title, note: idea.note, fields: idea.fields } });
  } else S.project.title = 'Untitled film';
  saveVersion(m, { auto: true, reason: mode === 'sample' ? 'sample loaded' : mode === 'idea' ? 'skeleton from Idea' : 'blank script', who });
  log(who, 'start', `started the script (${mode})`);
}

// Mid-production demo: Al Mousalsal two days in, staged as real seshes (the clock is wound back for each step).
async function startDemo(who) {
  const keepMembers = S.project.members;
  S = { ...fresh(), seq: S.seq };
  const other = who === 'Abdallah' ? 'Hadi' : 'Abdallah';
  S.project.members = [...new Set([...keepMembers, who, other])];
  const idea = (await brainstormCards()).cards.find((c) => c.type === 'idea' && /mousalsal/i.test(c.title));
  const at = (h) => { CLOCK = h * 3600e3; };
  try {
    at(50);
    if (idea) S.imported.push(idea.id);
    S.started = true;
    Object.assign(S.project, { title: DEMO.title, logline: DEMO.logline, characters: [...DEMO.characters], notes: DEMO.notes, from: `💡 ${idea?.title || 'Pitch — Al Mousalsal'}`, demo: true, startedAt: Date.now() });
    const m = newDraft({ name: 'Main', owner: 'team', isMain: true });
    S.drafts[m.id] = m; S.mainId = m.id;
    const sid = {}; const bid = {};
    const sc = (k) => m.scenes[sid[k]];
    const blk = (k, bk) => sc(k).blocks.find((b) => b.id === bid[`${k}.${bk}`]);
    const end = (h, title, review) => { at(h); const x = endSesh(S.seshes[m.sesh], who, title); if (review) Object.assign(x, review); return x; };

    // sesh 1 · the skeleton
    openSesh(m, who);
    for (const x of DEMO.skeleton) { const s1 = newScene(x.title, [{ type: 'note', text: x.note }]); sid[x.key] = s1.id; m.scenes[s1.id] = s1; m.order.push(s1.id); }
    track(m, 'bot', 'skeleton', `🤖 built the skeleton from 💡 Al Mousalsal: ${DEMO.skeleton.length} scene cards, ${DEMO.characters.length} characters`);
    end(49.8, 'Skeleton from the Idea', { status: 'approved', reviewedBy: other, reviewedAt: Date.now() - 49 * 3600e3 });

    // sesh 2 · first pass on every scene (both of you)
    at(45);
    openSesh(m, who);
    for (const [key, blocks] of Object.entries(DEMO.scenes)) {
      sc(key).blocks = blocks.map((raw) => { const b = makeBlock(raw); bid[`${key}.${raw.k}`] = b.id; return b; });
    }
    for (const f of DEMO.firstPass) blk(f.scene, f.k).line = f.line;
    const people = [who, other];
    Object.keys(DEMO.scenes).forEach((key, i) => { at(45 - i); for (let n = 0; n < 3 + i; n++) trackEdit(m, people[i % 2], sc(key)); });
    at(41); track(m, other, 'generator', 'kept option 2 in sc. 2 The theory — the cups as suspects', { scene: sid.s2, personality: '🧠 The Script Doctor', twist: '' });
    at(39.5); track(m, who, 'generator', 'kept option 1 in sc. 5 Jiddo’s chair — the glasses, not a photo', { scene: sid.s5, personality: '🎭 The Drama Coach', twist: '🔄 Flip it' });
    end(38, 'First pass on every scene', { status: 'approved', reviewedBy: who, reviewedAt: Date.now() - 37 * 3600e3 });

    // sesh 3 · lock the opening + breakdown
    const lockAndBreak = (key, h) => {
      at(h); const x = sc(key);
      x.check = { state: 'done', hash: sceneHash(x), verdict: 'ok', notes: [{ verdict: 'ok', note: 'Consistent with the canon and every other scene.', dismissed: false }], at: now(), by: who };
      track(m, who, 'judge', `⚖️ asked the Judge to check sc. ${num(m, x.id)} ${x.title} before locking`, { scene: x.id });
      track(m, 'bot', 'judge', `⚖️ ✅ sc. ${num(m, x.id)} ${x.title}`, { scene: x.id });
      doLock(m, x, who);
      at(h - 0.5);
      for (const y of DEMO.shots[key]) { const shot = newShot({ ...y, blocks: y.covers.map((k) => bid[`${key}.${k}`]) }, 'bot'); shot.status = 'approved'; shot.approvedBy = other; x.shots.push(shot); }
      track(m, 'bot', 'shots', `🤖 proposed ${x.shots.length} shots for sc. ${num(m, x.id)} ${x.title}`, { scene: x.id });
      at(h - 1);
      track(m, other, 'shots', `🎬 sc. ${num(m, x.id)} ${x.title} is broken down (${x.shots.length} shots)`, { scene: x.id });
      DEMO.shots[key].forEach((y, i) => {
        const shot = x.shots[i];
        for (const kind of y.assets) {
          const v = 1 + Object.values(S.assets).filter((a) => a.shot === shot.id && a.kind === kind).length;
          const a = { id: nid('a'), kind, scene: x.id, shot: shot.id, v, madeFromScene: keepSnap(x), madeFromShot: shotHash(x, shot), madeAs: shotNum(m, x, shot), createdAt: now(), by: kind === 'audio' ? who : other, status: 'ok', history: [] };
          S.assets[a.id] = a;
        }
      });
    };
    lockAndBreak('s1', 31);
    for (const [fact, scene] of DEMO.facts.filter((f) => f[1] === 'The announcement')) addFact(fact, { scene: sid.s1 });
    end(29, 'Lock the opening', { status: 'approved', reviewedBy: other, reviewedAt: Date.now() - 28 * 3600e3 });

    // sesh 4 · table-read fixes (the other person) — tagged for more work
    at(27);
    openSesh(m, other);
    for (const f of DEMO.firstPass) { const final = DEMO.scenes[f.scene].find((b) => b.k === f.k); blk(f.scene, f.k).line = final.line; trackEdit(m, other, sc(f.scene)); }
    at(26.2); trackEdit(m, other, sc('s3'));
    S.seshes[m.sesh].people = [other]; S.seshes[m.sesh].by = other;
    end(26, 'Table-read fixes', { status: 'tagged', tags: DEMO.tableReadTags, note: DEMO.tableReadNote, reviewedBy: who, reviewedAt: Date.now() - 24 * 3600e3 });

    // the other person's own draft, forked from Main v4
    at(20);
    const v4 = m.versions.find((v) => v.n === 4);
    const d = newDraft({ name: `${other}'s draft`, owner: other });
    const snap = clone(v4.snap);
    d.order = snap.order; d.floating = snap.floating; d.scenes = snap.scenes;
    stripPipeline(d);
    d.forkedFrom = { draft: m.id, name: 'Main', v: 4, after: 4 };
    S.drafts[d.id] = d;
    saveVersion(d, { auto: true, reason: 'forked from Main v4', who: other });
    log(other, 'draft', `⑂ forked “${d.name}” from Main v4`);
    at(19);
    openSesh(d, other);
    const e = DEMO.draft.edit;
    d.scenes[sid[e.scene]].blocks.find((b) => b.id === bid[`${e.scene}.${e.k}`]).line = e.line;
    trackEdit(d, other, d.scenes[sid[e.scene]]);
    const ns = newScene(DEMO.draft.newScene.title, DEMO.draft.newScene.blocks);
    d.scenes[ns.id] = ns; insertAfter(d.order, ns.id, sid[DEMO.draft.newScene.after]);
    for (const b of ns.blocks) if (b.type === 'dialogue') addCharacter(b.character);
    at(18.5); track(d, other, 'scene', `＋ added “${ns.title}” as sc. ${num(d, ns.id)}`, { scene: ns.id });
    at(18); endSesh(S.seshes[d.sesh], other, 'Both of them');

    // sesh 5 · lock The theory — saved, nobody has reviewed it yet
    lockAndBreak('s2', 9);
    for (const [fact, scene] of DEMO.facts.filter((f) => f[1] === 'The theory')) addFact(fact, { scene: sid.s2 });
    end(7, 'Lock The theory');

    // sesh 6 · open now: started by the other person
    at(3);
    const le = DEMO.lockedEdit;
    openSesh(m, other);
    blk(le.scene, le.k).line = le.line;
    trackEdit(m, other, sc(le.scene)); trackEdit(m, other, sc(le.scene));
    at(2.9);
    const s2 = sc(le.scene);
    s2.editCheck = { state: 'done', hash: sceneHash(s2), verdict: DEMO.lockedEditCheck.verdict, notes: DEMO.lockedEditCheck.notes.map((n) => ({ verdict: n.verdict, note: n.note, block: bid[`${le.scene}.${n.k}`] || null, dismissed: false })), at: now(), by: other };
    track(m, 'bot', 'judge', `⚖️ ⚠️ re-checked the edit to locked sc. 2 The theory — it now fights Jiddo’s chair`, { scene: s2.id });
    at(2);
    const fl = newScene(DEMO.floating.title, DEMO.floating.blocks);
    fl.from = DEMO.floating.from;
    fl.placeSuggestion = { after: sid[DEMO.floating.after], reason: DEMO.floating.reason, at: now() };
    m.scenes[fl.id] = fl; m.floating.push(fl.id);
    track(m, who, 'import', `🎬 “${fl.title}” arrived from Brainstorm into the floating tray`, { scene: fl.id });
    at(1.5);
    const al = DEMO.alt;
    const s4 = sc(al.scene);
    const group = nid('g');
    const altBlocks = al.blocks.map((x) => { const b = makeBlock(x); b.alt = { group, of: al.of.map((k) => bid[`${al.scene}.${k}`]), by: other, personality: al.personality, twist: al.twist, note: al.note }; return b; });
    const lastIdx = Math.max(...al.of.map((k) => s4.blocks.findIndex((b) => b.id === bid[`${al.scene}.${k}`])));
    s4.blocks.splice(lastIdx + 1, 0, ...altBlocks);
    track(m, other, 'generator', `kept an option as an alternate in sc. 4 ${s4.title} — ${al.note}`, { scene: s4.id, personality: al.personality, twist: al.twist });
    at(1.2);
    s4.pacing = { summary: DEMO.pacing.summary, notes: DEMO.pacing.notes.map((n) => ({ block: bid[`${DEMO.pacing.scene}.${n.k}`], note: n.note })), by: other, at: now() };
    at(1.1);
    const s3 = sc('s3');
    track(m, who, 'judge', `⚖️ asked the Judge to check sc. 3 ${s3.title} before locking`, { scene: s3.id });
    at(1);
    s3.check = { state: 'done', hash: sceneHash(s3), verdict: DEMO.s3Check.verdict, notes: DEMO.s3Check.notes.map((n) => ({ verdict: n.verdict, note: n.note, block: bid[`s3.${n.k}`], dismissed: false })), at: now(), by: who };
    track(m, 'bot', 'judge', `⚖️ ⚠️ sc. 3 ${s3.title} — 2 notes`, { scene: s3.id });
    doLock(m, s3, who);
    at(0.05);
    const s5 = sc('s5');
    m.order = m.order.filter((x) => x !== s5.id); insertAfter(m.order, s5.id, sid.s2);
    track(m, other, 'move', `↕ moved “${s5.title}” 5 → 3`, { scene: s5.id });
    m.editedAt = now();
  } finally { CLOCK = 0; }
  S.seshes[main().sesh].lastAt = now();
  S.log.sort((a, b) => a.ts - b.ts);
}

const A = {
  async start(b, who) {
    if (S.started && !b.force) bad('already started — reset first');
    if (b.mode === 'demo') return startDemo(who);
    let idea = null;
    if (b.mode === 'idea') { idea = (await brainstormCards()).cards.find((c) => c.id === b.card); if (!idea) bad('that Idea card is not in the brainstorm demo'); }
    startProject(['sample', 'idea', 'blank'].includes(b.mode) ? b.mode : 'blank', who, idea);
  },
  reset() { const members = S.project.members; S = { ...fresh(), seq: S.seq }; S.project.members = members; for (const k of Object.keys(presence)) delete presence[k]; },
  presence(b, who) { if (b.scene || b.block) presence[who] = { draft: b.draft, scene: b.scene, block: b.block, ts: now() }; else delete presence[who]; return { quiet: true }; },
  settings(b) { if (['scene', 'shot'].includes(b.staleBy)) S.settings.staleBy = b.staleBy; },
  project(b) { if (b.title !== undefined) S.project.title = str(b.title, 120); if (b.logline !== undefined) S.project.logline = str(b.logline, 600); },
  'character/add'(b) { addCharacter(b.name); },

  // ---- scenes & order: everything applies at once and is logged in the sesh
  order(b, who) {
    const { d } = ctxOf(b, who, { needScene: false });
    const all = [...d.order, ...d.floating].sort().join();
    const order = (b.order || []).filter((id) => d.scenes[id]);
    const floating = (b.floating || d.floating).filter((id) => d.scenes[id] && !order.includes(id));
    if ([...order, ...floating].sort().join() !== all) bad('order does not match the scenes');
    d.order = order; d.floating = floating;
    track(d, who, 'move', '↕ reordered the scenes');
    touched(d, null, who);
  },
  'scene/add'(b, who) {
    const { d } = ctxOf(b, who, { needScene: false });
    const sc = newScene(b.title || 'New scene', [{ type: 'heading', intExt: 'INT.', location: '', time: '' }]);
    d.scenes[sc.id] = sc;
    const after = b.after === 'end' ? d.order.at(-1) || null : b.after || null;
    if (b.floating) d.floating.push(sc.id); else insertAfter(d.order, sc.id, after);
    track(d, who, 'scene', `＋ added “${sc.title}” ${b.floating ? 'to the floating tray' : `as sc. ${num(d, sc.id)}`}`, { scene: sc.id });
    touched(d, null, who);
    return { id: sc.id };
  },
  'scene/title'(b, who) { const { d, sc } = ctxOf(b, who); sc.title = str(b.title, 120) || sc.title; touched(d, sc, who); },
  'scene/delete'(b, who) {
    const { d, sc } = ctxOf(b, who);
    if (sc.lock) bad('locked scenes cannot be deleted');
    const n = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); d.floating = d.floating.filter((x) => x !== sc.id); delete d.scenes[sc.id];
    track(d, who, 'scene', `🗑 deleted ${n ? `sc. ${n} ` : ''}“${sc.title}” (it's still in the versions)`);
    touched(d, null, who);
  },
  'scene/move'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const after = b.after || null;
    if (after === sc.id) return { unchanged: true };
    if (d.floating.includes(sc.id)) return A['scene/place'](b, who);
    const from = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); insertAfter(d.order, sc.id, after);
    const to = num(d, sc.id);
    if (to === from) return { unchanged: true };
    track(d, who, 'move', `↕ moved “${sc.title}” ${from} → ${to}`, { scene: sc.id });
    touched(d, null, who);
    return { applied: true };
  },
  'scene/place'(b, who) {
    const { d, sc } = ctxOf(b, who);
    if (!d.floating.includes(sc.id)) bad('not floating');
    const after = b.after === undefined ? sc.placeSuggestion?.after ?? null : b.after || null;
    d.floating = d.floating.filter((x) => x !== sc.id); insertAfter(d.order, sc.id, after); sc.placeSuggestion = null;
    track(d, who, 'move', `⤴ placed “${sc.title}” as sc. ${num(d, sc.id)}`, { scene: sc.id });
    touched(d, null, who);
    return { applied: true };
  },
  'scene/unplace'(b, who) {
    const { d, sc } = ctxOf(b, who);
    if (!d.order.includes(sc.id)) return { unchanged: true };
    const n = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); d.floating.push(sc.id);
    track(d, who, 'move', `⤓ sent sc. ${n} “${sc.title}” back to the tray`, { scene: sc.id });
    touched(d, null, who);
  },
  'scene/suggest'(b, who) {
    const { d, sc } = ctxOf(b, who, { edit: false });
    sc.placeSuggestion = { pending: true, at: now() };
    enqueue('place', who, { draft: d.id, scene: sc.id });
  },
  'scene/lock'(b, who) {
    const { d, sc } = ctxOf(b, who);
    mainOnly(d);
    if (d.floating.includes(sc.id)) bad('place the scene before locking it');
    if (sc.lock && sceneHash(sc) === sc.lock.hash) bad('already locked, and unchanged since');
    if (!hasContent(sc)) bad('nothing to lock yet: write the scene first');
    if (checkOk(sc)) { doLock(d, sc, who); return { locked: true }; }
    if (S.jobs.some((j) => j.type === 'judge_lock' && j.scene === sc.id && j.status !== 'done' && j.status !== 'failed' && j.hash === sceneHash(sc))) return { already: true };
    sc.check = { state: 'checking', hash: sceneHash(sc), notes: [], at: now(), by: who };
    enqueue('judge_lock', who, { draft: d.id, scene: sc.id, hash: sceneHash(sc) });
    track(d, who, 'judge', `⚖️ asked the Judge to check sc. ${num(d, sc.id)} ${sc.title} before locking`, { scene: sc.id });
  },
  'scene/judge-skip'(b, who) { // demo only: lock without the Judge while the bot is offline
    const { d, sc } = ctxOf(b, who);
    mainOnly(d);
    if (botOnline()) bad('the bot is online — let the Judge check it');
    for (const j of S.jobs) if (j.type === 'judge_lock' && j.scene === sc.id && j.status === 'pending') { j.status = 'failed'; j.note = 'skipped by the team (demo)'; }
    sc.check = { state: 'done', hash: sceneHash(sc), verdict: 'ok', notes: [{ verdict: 'ok', note: 'Judge skipped (bot offline, demo only)', dismissed: false }], at: now(), by: who, skipped: true };
    doLock(d, sc, who);
  },
  'scene/unlock'(b, who) {
    const { d, sc } = ctxOf(b, who);
    mainOnly(d);
    if (!sc.lock) bad('not locked');
    sc.lock = null; sc.editCheck = null;
    track(d, who, 'lock', `🔓 unlocked sc. ${num(d, sc.id)} ${sc.title} (its shots and assets stay)`, { scene: sc.id });
  },
  'scene/dismiss'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const target = b.edit ? sc.editCheck : sc.check;
    const n = target?.notes?.[b.idx];
    if (!n || n.verdict !== 'warn' || n.dismissed) bad('no open ⚠️ there');
    n.dismissed = true; n.dismissedBy = who;
    S.exceptions.push({ scene: sc.title, note: n.note, reason: str(b.reason || 'We know, it’s intentional', 300), who, ts: now() });
    track(d, who, 'judge', `“we know, it’s intentional” on sc. ${num(d, sc.id)}: ${n.note.slice(0, 120)}`, { scene: sc.id });
  },
  'scene/breakdown'(b, who) {
    const { d, sc } = ctxOf(b, who);
    mainOnly(d);
    if (!sc.lock) bad('the Shot List opens for locked scenes only');
    enqueue('breakdown', who, { draft: d.id, scene: sc.id });
  },
  'scene/pacing'(b, who) { const { d, sc } = ctxOf(b, who, { edit: false }); enqueue('pacing', who, { draft: d.id, scene: sc.id }); sc.pacing = { pending: true, by: who, at: now() }; },
  'scene/pacing-clear'(b, who) { const { sc } = ctxOf(b, who, { edit: false }); sc.pacing = null; },
  async 'scene/send-brainstorm'(b, who) {
    const { d, sc } = ctxOf(b, who, { edit: false });
    const type = b.type === 'dialogue' ? 'dialogue' : 'scene';
    const ids = new Set(b.blocks || []);
    let seed = fountain(d, { title: false, scenes: [sc.id] });
    if (ids.size) seed = sc.blocks.filter((x) => ids.has(x.id)).map((x) => (x.type === 'dialogue' ? `${x.character}${x.paren ? ` (${x.paren})` : ''}: ${x.line}` : x.type === 'heading' ? headingText(x) : x.text)).join('\n');
    seed = `From the script, sc. ${num(d, sc.id) ?? '(floating)'} “${sc.title}”:\n\n${seed}`;
    try {
      const r = await fetch(`${BRAINSTORM_URL}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who, type, topic: `${num(d, sc.id) ? `Sc. ${num(d, sc.id)} ` : ''}${sc.title}`, seed }), signal: AbortSignal.timeout(3000) });
      const j = await r.json();
      if (!j.ok) bad(j.error || 'brainstorm refused');
      log(who, 'brainstorm', `sent sc. ${num(d, sc.id) ?? '—'} ${sc.title} to a ${type} brainstorm`, { draft: d.id, scene: sc.id });
      return { url: `${BRAINSTORM_URL}/#s/${j.id}` };
    } catch (e) {
      if (e instanceof E) throw e;
      bad(`the brainstorm demo is not running at ${BRAINSTORM_URL} — start it with npm start in the brainstorm demo`);
    }
  },

  // ---- blocks
  'block/add'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const blk = makeBlock({ type: b.type || 'action', ...(b.fields || {}) });
    // the client may name the block (optimistic insert, so focus moves before the round trip)
    if (/^c[a-z0-9]{6,24}$/.test(b.id || '') && !Object.values(d.scenes).some((x) => x.blocks.some((y) => y.id === b.id))) blk.id = b.id;
    const i = b.after ? sc.blocks.findIndex((x) => x.id === b.after) : -1;
    sc.blocks.splice(b.after === 'end' || (b.after && i < 0) ? sc.blocks.length : i + 1, 0, blk);
    touched(d, sc, who);
    return { id: blk.id };
  },
  'block/update'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const [blk] = findBlock(sc, b.block);
    for (const [k, v] of Object.entries(b.patch || {})) if (FIELDS[blk.type].includes(k)) blk[k] = k === 'intExt' ? normIntExt(v) : str(v);
    if (blk.type === 'dialogue' && b.patch?.character) addCharacter(blk.character);
    touched(d, sc, who);
    return { quiet: true };
  },
  'block/type'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const [blk, i] = findBlock(sc, b.block);
    if (!FIELDS[b.type]) bad('unknown block type');
    const text = (blk.text || blk.line || blk.location || '').replace(/^\/$/, ''); // "/" was the slash-menu trigger
    const nb = makeBlock({ type: b.type, text, line: text, location: b.type === 'heading' ? text.toUpperCase() : '' });
    nb.id = blk.id; if (blk.alt) nb.alt = blk.alt;
    sc.blocks[i] = nb;
    touched(d, sc, who);
  },
  'block/delete'(b, who) { const { d, sc } = ctxOf(b, who); const [, i] = findBlock(sc, b.block); sc.blocks.splice(i, 1); touched(d, sc, who); },
  'block/move'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const [blk, i] = findBlock(sc, b.block);
    const j = Math.max(0, Math.min(sc.blocks.length - 1, i + (b.dir < 0 ? -1 : 1)));
    sc.blocks.splice(i, 1); sc.blocks.splice(j, 0, blk); touched(d, sc, who);
  },
  // drag a line (or several picked lines) to a new spot: same scene, or another one
  'block/reorder'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const dst = b.toScene ? d.scenes[b.toScene] : sc;
    if (!dst) bad('no such scene');
    const ids = new Set((b.ids || []).filter((id) => sc.blocks.some((x) => x.id === id)));
    if (!ids.size) bad('nothing to move');
    if (b.after && ids.has(b.after)) return { unchanged: true };
    const moving = sc.blocks.filter((x) => ids.has(x.id));
    sc.blocks = sc.blocks.filter((x) => !ids.has(x.id));
    const i = b.after ? dst.blocks.findIndex((x) => x.id === b.after) : -1;
    if (b.after && i < 0) { sc.blocks.push(...moving); bad('that spot is gone'); }
    dst.blocks.splice(i + 1, 0, ...moving);
    touched(d, sc, who);
    if (dst !== sc) touched(d, dst, who);
    return { applied: true };
  },
  'alt/use'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const [blk] = findBlock(sc, b.block);
    if (!blk.alt) bad('not an alternate');
    const g = blk.alt;
    const of = new Set(g.of);
    sc.blocks = sc.blocks.filter((x) => !of.has(x.id));
    for (const x of sc.blocks) if (x.alt?.group === g.group) delete x.alt;
    track(d, who, 'generator', `used an alternate in sc. ${num(d, sc.id) ?? '—'} ${sc.title}`, { scene: sc.id, personality: g.personality, twist: g.twist });
    touched(d, sc, who, { quiet: true });
  },
  'alt/remove'(b, who) {
    const { d, sc } = ctxOf(b, who);
    const [blk] = findBlock(sc, b.block);
    if (!blk.alt) bad('not an alternate');
    sc.blocks = sc.blocks.filter((x) => x.alt?.group !== blk.alt.group);
    touched(d, sc, who);
  },

  // ---- Generator
  gen(b, who) {
    const { d, sc } = ctxOf(b, who, { edit: false });
    const prev = b.from ? S.jobs.find((x) => x.id === b.from && x.type === 'generate') : null;
    // refining an option that is already in the script works on what's there now, and keeps the true original
    const want = prev?.applied?.ids?.length ? prev.applied.ids : b.blocks || [];
    const ids = want.filter((id) => sc.blocks.some((x) => x.id === id));
    if (!ids.length) bad('pick one or more lines first');
    const personality = { key: PERSONALITIES[b.personality] ? b.personality : 'director', custom: str(b.custom, 300) };
    const twist = TWISTS[b.twist] ? b.twist : 'none';
    const twistPicked = twist === 'shuffle' ? ['flip', 'yesand', 'wildcard', 'worst'][Math.floor(Math.random() * 4)] : null;
    const refine = b.refine ? sanitizeBlocks(b.refine) : null;
    for (const j of S.jobs) if (j.type === 'generate' && j.by === who && j.status === 'pending') { j.status = 'failed'; j.note = 'replaced by a newer request'; }
    for (const j of S.jobs) if (j.type === 'generate' && j.by === who && !j.dismissed && j !== prev) j.dismissed = true;
    if (prev) prev.dismissed = true;
    const original = prev?.applied ? prev.original : null;
    const j = enqueue('generate', who, { draft: d.id, scene: sc.id, blocks: ids, personality, twist, twistPicked, ask: str(b.ask, 400), refine, original, applied: prev?.applied ? { ...prev.applied } : null });
    return { job: j.id };
  },
  // Try an option in place. The panel keeps every option; trying another swaps it in, 'original' puts the lines back.
  'gen/apply'(b, who) {
    const j = S.jobs.find((x) => x.id === b.job);
    if (!j || j.type !== 'generate' || !j.result) bad('no such result');
    const back = b.option === 'original';
    const opt = back ? null : j.result.options[b.option];
    if (!back && !opt) bad('no such option');
    const { d, sc } = ctxOf({ draft: j.draft, scene: j.scene }, who);
    const span = (j.applied?.ids || j.blocks).filter((id) => sc.blocks.some((x) => x.id === id));
    if (!span.length) bad('those lines are gone from the script — pick them again');
    if (!j.original) j.original = clone(j.blocks.map((id) => sc.blocks.find((x) => x.id === id)).filter(Boolean));
    const p = j.personality.key === 'custom' ? `✏️ ${j.personality.custom || 'Custom'}` : `${PERSONALITIES[j.personality.key].emoji} ${PERSONALITIES[j.personality.key].name}`;
    const t = TWISTS[j.twistPicked || j.twist];
    const tw = j.twist === 'none' ? '' : `${t.emoji} ${t.name}${j.twistPicked ? ' (🔀)' : ''}`;
    const idx = span.map((id) => sc.blocks.findIndex((x) => x.id === id));
    if (b.mode === 'alt') {
      if (back) bad('the original is already there');
      const fresh = opt.blocks.map((x) => makeBlock(x));
      const group = nid('g');
      for (const x of fresh) x.alt = { group, of: span, by: who, personality: p, twist: tw, note: opt.note };
      sc.blocks.splice(Math.max(...idx) + 1, 0, ...fresh);
      track(d, who, 'generator', `kept an option as an alternate in sc. ${num(d, sc.id) ?? '—'} ${sc.title}${opt.note ? ` — ${opt.note}` : ''}`, { scene: sc.id, personality: p, twist: tw });
      touched(d, sc, who, { quiet: true });
      return {};
    }
    const fresh = back ? clone(j.original) : opt.blocks.map((x) => makeBlock(x));
    const ids = new Set(span);
    const at = Math.min(...idx);
    sc.blocks = [...sc.blocks.slice(0, at).filter((x) => !ids.has(x.id)), ...fresh, ...sc.blocks.slice(at).filter((x) => !ids.has(x.id))];
    for (const x of fresh) if (x.type === 'dialogue') addCharacter(x.character);
    j.applied = back ? null : { option: b.option, ids: fresh.map((x) => x.id), who, ts: now() };
    j.tried = [...new Set([...(j.tried || []), b.option])];
    // one log line per Generator run, rewritten as you try things
    const text = back ? `tried ${j.tried.length - 1} option${j.tried.length === 2 ? '' : 's'} in sc. ${num(d, sc.id) ?? '—'} ${sc.title}, back to the original`
      : `trying option ${b.option + 1} in sc. ${num(d, sc.id) ?? '—'} ${sc.title}${opt.note ? ` — ${opt.note}` : ''}`;
    const e = j.logId && S.log.find((x) => x.id === j.logId);
    if (e) { e.text = text; e.ts = now(); } else j.logId = track(d, who, 'generator', text, { scene: sc.id, personality: p, twist: tw }).id;
    touched(d, sc, who, { quiet: true });
    return { ids: j.applied?.ids || [] };
  },
  'gen/done'(b, who) {
    const j = S.jobs.find((x) => x.id === b.job && x.by === who);
    if (!j) return {};
    j.dismissed = true;
    const e = j.logId && S.log.find((x) => x.id === j.logId);
    if (!e) return {};
    if (!j.applied) { S.log = S.log.filter((x) => x !== e); return {}; } // back to the original: nothing changed
    const d = S.drafts[j.draft]; const sc = d?.scenes[j.scene]; const opt = j.result?.options[j.applied.option];
    e.text = `kept option ${j.applied.option + 1}${j.tried?.length > 1 ? ` of ${j.result.options.length}` : ''} in sc. ${(d && sc && num(d, sc.id)) ?? '—'} ${sc?.title || ''}${opt?.note ? ` — ${opt.note}` : ''}`;
  },
  'gen/clear'(b, who) { for (const j of S.jobs) if (j.type === 'generate' && j.by === who && (j.id === b.job || !b.job)) j.dismissed = true; },

  // ---- shots (Phase 3, Main, locked scenes)
  'shot/add'(b, who) { const { d, sc } = ctxOf(b, who); mainOnly(d); if (!sc.lock) bad('locked scenes only'); const s = newShot({}, who); const i = sc.shots.findIndex((x) => x.id === b.after); sc.shots.splice(i < 0 ? sc.shots.length : i + 1, 0, s); return { id: s.id }; },
  'shot/update'(b, who) {
    const { d, sc } = ctxOf(b, who); mainOnly(d);
    const s = sc.shots.find((x) => x.id === b.shot); if (!s) bad('no such shot');
    const p = b.patch || {};
    for (const k of ['framing', 'camera', 'characters', 'location', 'action', 'dialogue', 'refs']) if (p[k] !== undefined) s[k] = str(p[k], 600);
    if (p.duration !== undefined) s.duration = Math.max(0, Math.min(600, Number(p.duration) || 0));
    if (Array.isArray(p.blocks)) s.blocks = p.blocks.filter((id) => sc.blocks.some((x) => x.id === id));
    return { quiet: true };
  },
  'shot/approve'(b, who) {
    const { d, sc } = ctxOf(b, who); mainOnly(d);
    const list = b.all ? sc.shots : sc.shots.filter((x) => x.id === b.shot);
    if (!list.length) bad('no such shot');
    for (const s of list) { s.status = b.yes === false ? 'proposed' : 'approved'; s.approvedBy = who; }
    if (sc.shots.every((s) => s.status === 'approved')) track(d, who, 'shots', `🎬 sc. ${num(d, sc.id)} ${sc.title} is broken down (${sc.shots.length} shots)`, { scene: sc.id });
  },
  'shot/delete'(b, who) { const { d, sc } = ctxOf(b, who); mainOnly(d); const has = Object.values(S.assets).some((a) => a.shot === b.shot); if (has) bad('this shot has assets — they would be orphaned'); sc.shots = sc.shots.filter((x) => x.id !== b.shot); },
  'shot/move'(b, who) {
    const { d, sc } = ctxOf(b, who); mainOnly(d);
    const i = sc.shots.findIndex((x) => x.id === b.shot); if (i < 0) bad('no such shot');
    const j = Math.max(0, Math.min(sc.shots.length - 1, i + (b.dir < 0 ? -1 : 1)));
    const [s] = sc.shots.splice(i, 1); sc.shots.splice(j, 0, s);
  },

  // ---- mock downstream assets + Stale protection
  'asset/add'(b, who) {
    const m = main();
    const sc = m.scenes[b.scene]; const shot = sc?.shots.find((x) => x.id === b.shot);
    if (!shot) bad('no such shot in Main');
    if (shot.status !== 'approved') bad('approve the shot first');
    const kind = ['image', 'video', 'audio'].includes(b.kind) ? b.kind : 'image';
    const v = 1 + Object.values(S.assets).filter((a) => a.shot === shot.id && a.kind === kind).length;
    const a = { id: nid('a'), kind, scene: sc.id, shot: shot.id, v, madeFromScene: keepSnap(sc), madeFromShot: shotHash(sc, shot), madeAs: shotNum(m, sc, shot), createdAt: now(), by: who, status: 'ok', history: [] };
    S.assets[a.id] = a;
    return { id: a.id };
  },
  'asset/decide'(b, who) {
    const a = S.assets[b.asset]; if (!a) bad('no such asset');
    const m = main(); const sc = m.scenes[a.scene]; const shot = sc?.shots.find((x) => x.id === a.shot);
    if (!shot) bad('orphaned: its scene or shot is not in Main any more');
    const what = b.what;
    if (!['keep', 'regenerate', 'adjust', 'adjusted'].includes(what)) bad('keep / regenerate / adjust');
    const from = a.madeFromScene;
    if (what === 'adjust') { a.status = 'adjusting'; a.adjustNote = str(b.note, 300); }
    else {
      if (what === 'regenerate') a.v += 1;
      a.status = 'ok'; a.adjustNote = '';
      a.madeFromScene = keepSnap(sc); a.madeFromShot = shotHash(sc, shot); a.madeAs = shotNum(m, sc, shot);
    }
    a.history.push({ who, what, ts: now(), from });
    track(m, who, 'stale', `${{ keep: '✋ kept', regenerate: '🔁 regenerated', adjust: '🛠 sent to adjust', adjusted: '✓ adjusted' }[what]} ${a.kind} for shot ${shotNum(m, sc, shot)}`, { scene: sc.id });
  },

  // ---- facts ledger: anyone changes it, every change is logged
  'fact/add'(b, who) {
    const f = addFact(b.fact, { scene: b.scene || null, source: 'team', by: who });
    if (!f) bad('empty, or already in the ledger');
    track(main(), who, 'fact', `📖 added a fact: “${f.fact}”`, { scene: f.scene });
    return { id: f.id };
  },
  'fact/edit'(b, who) {
    const f = S.facts.find((x) => x.id === b.id); if (!f) bad('no such fact');
    const t = cleanFact(b.fact);
    if (!t) bad('empty — delete it instead');
    if (t === f.fact && b.scene === undefined) return { unchanged: true };
    const was = f.fact;
    f.fact = t; f.edited = { by: who, at: now() }; f.doubt = null;
    if (b.scene !== undefined) { const sc = b.scene && main().scenes[b.scene]; f.scene = sc ? sc.id : null; f.sceneTitle = sc?.title || ''; }
    const sc = factScene(f); f.hash = sc ? sceneHash(sc) : null;
    if (t !== was) track(main(), who, 'fact', `📖 changed a fact: “${was}” → “${t}”`, { scene: f.scene });
    else track(main(), who, 'fact', `📖 moved a fact to ${sc ? sc.title : 'no scene'}`, { scene: f.scene });
  },
  'fact/delete'(b, who) {
    const f = S.facts.find((x) => x.id === b.id); if (!f) bad('no such fact');
    S.facts = S.facts.filter((x) => x !== f);
    track(main(), who, 'fact', `📖 removed a fact: “${f.fact}”`, { scene: f.scene });
  },
  'fact/confirm'(b, who) { // "still true" after its scene changed
    const f = S.facts.find((x) => x.id === b.id); if (!f) bad('no such fact');
    const sc = factScene(f); f.hash = sc ? sceneHash(sc) : null; f.doubt = null;
    track(main(), who, 'fact', `📖 confirmed a fact still holds: “${f.fact}”`, { scene: f.scene });
  },

  // ---- seshes
  'sesh/end'(b, who) {
    const { d } = ctxOf(b, who, { needScene: false });
    const x = endSesh(S.seshes[d.sesh], who, b.title);
    if (!x) bad('no open sesh on this draft');
    return { status: x.status, v: x.v };
  },
  'sesh/title'(b, who) {
    const x = S.seshes[b.sesh]; if (!x) bad('no such sesh');
    x.title = str(b.title, 80) || x.title; x.titled = true;
    const v = x.v && S.drafts[x.draft]?.versions.find((y) => y.n === x.v);
    if (v) v.name = x.title;
  },
  'sesh/review'(b, who) {
    const x = S.seshes[b.sesh]; if (!x) bad('no such sesh');
    if (x.status === 'open') bad('end the sesh first');
    if (!['approved', 'tagged', 'saved'].includes(b.status)) bad('approved / tagged');
    x.status = b.status; x.reviewedBy = b.status === 'saved' ? null : who; x.reviewedAt = now();
    if (b.status === 'tagged') { x.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t) => str(t, 30).trim()).filter(Boolean).slice(0, 8); x.note = str(b.note, 600); }
    log(who, 'review', `${{ approved: '✓ approved', tagged: '🏷 tagged', saved: '↺ re-opened the review of' }[b.status]} sesh “${x.title}”${b.status === 'tagged' && x.tags.length ? ` [${x.tags.join(', ')}]` : ''}`, { draft: x.draft });
  },
  'sesh/followup'(b, who) {
    const x = S.seshes[b.sesh]; if (!x) bad('no such sesh');
    const d = S.drafts[x.draft]; if (!d) bad('that draft is gone');
    if (!canEdit(d, who)) bad(`read-only: ${d.name} is ${d.owner}'s`);
    endSesh(S.seshes[d.sesh], who);
    const n = openSesh(d, who);
    n.title = `Re: ${x.title}`; n.titled = true; n.followsUp = x.id;
    return { id: n.id, draft: d.id };
  },
  'sesh/revert'(b, who) { // put the draft back to how it was before a sesh
    const x = S.seshes[b.sesh]; if (!x) bad('no such sesh');
    const d = S.drafts[x.draft]; if (!d) bad('that draft is gone');
    if (!canEdit(d, who)) bad(`read-only: ${d.name} is ${d.owner}'s`);
    endSesh(S.seshes[d.sesh], who);
    const n = openSesh(d, who); n.title = `Undo: ${x.title}`; n.titled = true;
    if (d.isMain) adoptContent(d, x.base, d); else { const c = clone(x.base); d.order = c.order; d.floating = c.floating; d.scenes = c.scenes; }
    track(d, who, 'version', `↩ put ${d.isMain ? 'Main' : d.name} back to before “${x.title}”`);
    for (const sc of Object.values(d.scenes)) touched(d, sc, who, { quiet: true });
  },

  // ---- drafts & versions
  'draft/fork'(b, who) {
    const src = S.drafts[b.from]; if (!src) bad('no such draft');
    const v = b.v ? src.versions.find((x) => x.n === Number(b.v)) : null;
    if (b.v && !v) bad('no such version');
    const d = newDraft({ name: str(b.name, 60) || `${who}'s draft`, owner: who });
    const snap = v ? clone(v.snap) : snapDraft(src);
    d.order = snap.order; d.floating = snap.floating; d.scenes = snap.scenes;
    stripPipeline(d);
    d.forkedFrom = { draft: src.id, name: src.name, v: v?.n ?? null, after: src.versions.at(-1)?.n ?? 0 };
    S.drafts[d.id] = d;
    saveVersion(d, { auto: true, reason: `forked from ${src.name} ${v ? `v${v.n}` : `(now, after v${d.forkedFrom.after})`}`, who });
    log(who, 'draft', `forked “${d.name}” from ${src.name} ${v ? `v${v.n}` : 'now'}`);
    return { id: d.id };
  },
  'draft/rename'(b, who) { const { d } = ctxOf(b, who, { needScene: false }); if (d.isMain) bad('Main is Main'); d.name = str(b.name, 60) || d.name; },
  'draft/restore'(b, who) {
    const { d } = ctxOf(b, who, { needScene: false });
    const v = d.versions.find((x) => x.n === Number(b.v)); if (!v) bad('no such version');
    endSesh(S.seshes[d.sesh], who); // what was there is saved first, so nothing is overwritten
    const n = openSesh(d, who); n.title = `Restored v${v.n}`; n.titled = true;
    if (d.isMain) adoptContent(d, v.snap, d); else { const c = clone(v.snap); d.order = c.order; d.floating = c.floating; d.scenes = c.scenes; }
    track(d, who, 'version', `↩ restored ${d.isMain ? 'Main' : d.name} v${v.n}${v.name ? ` “${v.name}”` : ''}`);
    for (const sc of Object.values(d.scenes)) touched(d, sc, who, { quiet: true });
  },
  'draft/make-main'(b, who) {
    const d = S.drafts[b.draft]; if (!d) bad('no such draft');
    if (d.isMain) bad('already Main');
    promoteToMain(d, who);
  },
  'draft/pull'(b, who) { // open question in the spec — built so you can try it
    const src = S.drafts[b.from]; const dst = S.drafts[b.into];
    if (!src || !dst) bad('no such draft');
    if (!canEdit(dst, who)) bad(`read-only: ${dst.name} is ${dst.owner}'s`);
    const ver = b.v ? src.versions.find((x) => x.n === Number(b.v)) : null;
    const sc = (ver ? ver.snap.scenes : src.scenes)[b.scene]; if (!sc) bad('no such scene');
    const cur = dst.scenes[sc.id];
    if (cur) { cur.title = sc.title; cur.blocks = clone(sc.blocks); track(dst, who, 'pull', `⤵ pulled “${sc.title}” from ${src.name}${ver ? ` v${ver.n}` : ''} (replaced this draft's version)`, { scene: sc.id }); touched(dst, cur, who, { quiet: true }); }
    else {
      const copy = clone(sc); copy.lock = null; copy.check = null; copy.editCheck = null; copy.shots = [];
      dst.scenes[copy.id] = copy; dst.order.push(copy.id);
      track(dst, who, 'pull', `⤵ pulled “${sc.title}” from ${src.name}${ver ? ` v${ver.n}` : ''} as sc. ${num(dst, copy.id)}`, { scene: copy.id });
      touched(dst, null, who);
    }
  },

  // ---- brainstorm import
  async import(b, who) {
    const card = (await brainstormCards()).cards.find((c) => c.id === b.card);
    if (!card) bad('card not found in the brainstorm demo');
    if (S.imported.includes(card.id) && !b.again) bad('already imported');
    const m = main(); if (!m) bad('start the script first');
    if (card.type === 'scene') {
      const f = card.fields;
      const blocks = [];
      if (f.location) blocks.push(parseHeading(fieldText(f.location)));
      const note = ['who_is_there', 'purpose', 'beats', 'ending_hook'].map((k) => (f[k] ? `${k.replace(/_/g, ' ')}: ${fieldText(f[k])}` : '')).filter(Boolean).join('\n') || card.note;
      if (note) blocks.push({ type: 'note', text: note });
      const sc = newScene(card.title, blocks); sc.from = `🎬 brainstorm: ${card.topic}`;
      m.scenes[sc.id] = sc; m.floating.push(sc.id);
      sc.placeSuggestion = { pending: true, at: now() };
      enqueue('place', who, { draft: m.id, scene: sc.id });
      track(m, who, 'import', `🎬 “${card.title}” arrived from Brainstorm into the floating tray`, { scene: sc.id });
    } else if (card.type === 'dialogue') {
      const target = m.scenes[b.scene]; if (!target) bad('pick the scene the lines go into');
      const lines = parseLines(fieldText(card.fields.exchange) || card.note);
      if (!lines.length) bad('no lines found on that card');
      for (const l of lines) { target.blocks.push(makeBlock(l)); if (l.character) addCharacter(l.character); }
      track(m, who, 'import', `💬 ${lines.length} lines from “${card.title}” inserted into sc. ${num(m, target.id) ?? '—'} ${target.title}`, { scene: target.id });
      touched(m, target, who, { quiet: true });
    } else if (card.type === 'character') {
      addCharacter(fieldText(card.fields.name) || card.title);
      log(who, 'import', `🧑 ${fieldText(card.fields.name) || card.title} added to the character list`);
    } else if (card.type === 'idea') {
      if (!b.logline) bad('Ideas start a new script (reset → start from Idea), or bring just the logline');
      S.project.logline = fieldText(card.fields.logline) || S.project.logline;
    } else bad('Arc cards are canon: the Judge reads them from the Story Bible');
    if (!S.imported.includes(card.id)) S.imported.push(card.id);
  },
};

// ---------------------------------------------------------------- http
function json(res, obj, code = 200) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const fail = (res, msg, code = 400) => json(res, { error: msg }, code);
function body(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
const nameOf = (b) => String(b?.who || '').trim().slice(0, 40);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const c = { res, who: String(url.searchParams.get('who') || '').slice(0, 40) };
    clients.add(c);
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    changed(); // others see who's online
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(c); if (c.who && ![...clients].some((x) => x.who === c.who)) delete presence[c.who]; changed(); });
    return;
  }
  if (p === '/api/state') return json(res, publicState());
  if (p === '/api/brainstorm') return json(res, await brainstormCards());
  if (p === '/api/version') {
    const d = S.drafts[url.searchParams.get('draft')];
    const v = d?.versions.find((x) => x.n === Number(url.searchParams.get('v')));
    if (!d) return fail(res, 'no such draft', 404);
    if (!v) return json(res, { draft: d.id, name: d.name, v: null, snap: snapDraft(d) }); // "now"
    return json(res, { draft: d.id, name: d.name, v: v.n, label: v.name || v.reason, snap: v.snap });
  }
  if (p === '/api/snap') return json(res, { blocks: S.snaps[url.searchParams.get('h')] || null });
  if (p === '/api/sesh') {
    const x = S.seshes[url.searchParams.get('id')];
    if (!x) return fail(res, 'no such sesh', 404);
    const d = S.drafts[x.draft];
    const after = x.v ? d?.versions.find((v) => v.n === x.v)?.snap : x.status === 'open' && d ? snapDraft(d) : null;
    return json(res, { sesh: seshMeta(x), events: S.log.filter((l) => l.sesh === x.id), before: x.base, after, draftName: d ? (d.isMain ? 'Main' : d.name) : '?' });
  }
  if (p === '/api/promo') { const d = S.drafts[url.searchParams.get('draft')]; return d ? json(res, promoSummary(d)) : fail(res, 'no such draft', 404); }
  if (p === '/export/pdf' || p === '/export/fountain') {
    const d = S.drafts[url.searchParams.get('draft')] || main();
    if (!d) return fail(res, 'nothing to export', 404);
    if (p === '/export/pdf') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(printable(d)); }
    const name = `${(S.project.title || 'script').replace(/[^\w-]+/g, '_')}_${d.name.replace(/[^\w-]+/g, '_')}.fountain`;
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` });
    return res.end(fountain(d));
  }

  // ---- bot
  if (p === '/api/bot/next' && req.method === 'GET') {
    botLastSeen = now();
    for (const j of S.jobs) if (j.status === 'delivered' && now() - j.deliveredAt > 5 * 60 * 1000) j.status = 'pending'; // bot died mid-job
    if (botWaiter) { clearTimeout(botWaiter.timer); json(botWaiter.res, { idle: true, replaced: true }); botWaiter = null; }
    const timeout = Math.min(Number(url.searchParams.get('timeout')) || 100000, 590000);
    const timer = setTimeout(() => { if (botWaiter?.res === res) { botWaiter = null; json(res, { idle: true }); changed(); } }, timeout);
    botWaiter = { res, timer };
    req.on('close', () => { if (botWaiter?.res === res) { clearTimeout(timer); botWaiter = null; changed(); } });
    await tryDeliver();
    if (botWaiter) changed();
    return;
  }
  if (p === '/api/bot/done' && req.method === 'POST') {
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    botLastSeen = now();
    const j = S.jobs.find((x) => x.id === b.job);
    if (!j) return fail(res, `no such job: ${b.job}`, 404);
    if (j.status === 'done') return fail(res, `job ${j.id} is already done`);
    try {
      const note = finishJob(j, b);
      if (j.status !== 'failed') { j.status = 'done'; j.doneAt = now(); }
      changed();
      return json(res, { ok: true, job: j.id, note, next: 'node bot/wait.mjs' });
    } catch (e) {
      if (!(e instanceof E)) console.error(e);
      return fail(res, e.message);
    }
  }

  // ---- team
  const m = p.match(/^\/api\/(.+)$/);
  if (m && req.method === 'POST' && A[m[1]]) {
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    const who = nameOf(b);
    if (!who && m[1] !== 'reset') return fail(res, 'who?');
    if (who && !S.project.members.includes(who) && m[1] !== 'member/remove') S.project.members.push(who);
    try {
      const out = (await A[m[1]](b, who)) || {};
      changed();
      return json(res, { ok: true, ...out });
    } catch (e) {
      if (!(e instanceof E)) console.error(e);
      return fail(res, e.message);
    }
  }
  if (p.startsWith('/api/')) return fail(res, 'not found', 404);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

migrateFacts();

server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`port ${PORT} is busy — the demo is probably already running: open http://localhost:${PORT}\n(or stop the other one: lsof -ti :${PORT} | xargs kill, or pick another port: node server.mjs --port=3144)`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`π script demo → http://localhost:${PORT}   (data: ${STATE_FILE})`);
  console.log(`bot: "npm run bot" in another terminal · brainstorm bridge: ${BRAINSTORM_URL}`);
});
