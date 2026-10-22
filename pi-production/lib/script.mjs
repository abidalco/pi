// Script — Section 2, on the project file. Same work as the old demo (drafts, scenes as lines, versions, seshes,
// locks through the Judge, shots, the Generator, the Facts Ledger); every change is rows in pi.db.
// Each action is one unit of work: load the project's drafts, change them in memory as the demo did, write back
// only the scenes, seshes, jobs and facts that changed, in one transaction.
// The bot is not in here: it long-polls /api/bot/next (one queue across projects and sections) and answers /api/bot/done.
import crypto from 'node:crypto';
import { J, P, nid, now } from './projects.mjs';
import { PERSONALITIES, TWISTS, BLOCK_TYPES, FRAMINGS, SAMPLE } from './script-data.mjs';
import { createSession } from './brainstorm.mjs';
import * as RF from './references.mjs';

export const CONFIG = { personalities: PERSONALITIES, twists: TWISTS, blockTypes: BLOCK_TYPES, framings: FRAMINGS };
const JUDGE_EDIT_DELAY = 6000;           // a locked scene is re-checked this long after the last edit
const SESH_IDLE = 45 * 60 * 1000;        // a sesh nobody touched for this long saves itself
const STALE_DELIVERY = 5 * 60 * 1000;    // a job the bot took and never answered goes back in the queue

const err = (msg, code = 400) => Object.assign(new Error(msg), { code });
const bad = (m) => { throw err(m); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const str = (v, n = 4000) => String(v ?? '').slice(0, n);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

let deliverHook = () => {};
export const onEnqueue = (fn) => { deliverHook = fn; };
let changeHook = () => {}; // the references read the script: they hear about every change (lib/references.mjs scan)
export const onScriptChange = (fn) => { changeHook = fn; };
let botOnline = () => false;
export const setBotOnline = (fn) => { botOnline = fn; };

// ---------------------------------------------------------------- lines (blocks) & hashes
const FIELDS = { heading: ['intExt', 'location', 'time'], action: ['text'], dialogue: ['character', 'paren', 'line'], transition: ['text'], note: ['text'] };
const INT_EXT = ['INT.', 'EXT.', 'INT./EXT.', ''];
function contentOf(b) {
  const o = { type: b.type };
  for (const f of FIELDS[b.type] || []) o[f] = b[f] || '';
  return o;
}
function normIntExt(v) {
  const s = String(v || '').toUpperCase().replace(/\s/g, '');
  if (s.startsWith('INT') && s.includes('EXT')) return 'INT./EXT.';
  if (s.startsWith('INT')) return 'INT.';
  if (s.startsWith('EXT')) return 'EXT.';
  return '';
}
function makeBlock(raw) {
  const type = FIELDS[raw?.type] ? raw.type : 'action';
  const b = { id: nid('b'), type };
  for (const f of FIELDS[type]) b[f] = str(raw?.[f] ?? (f === 'text' || f === 'line' ? raw?.text ?? raw?.line ?? '' : ''));
  if (type === 'heading') b.intExt = INT_EXT.includes(String(b.intExt).toUpperCase()) ? String(b.intExt).toUpperCase() : normIntExt(b.intExt);
  return b;
}
// Notes are team-only and alternates are not chosen yet: neither is "the script", so neither can make a lock stale.
const scriptBlocks = (sc) => sc.blocks.filter((b) => b.type !== 'note' && !b.alt);
const hashOf = (blocks) => crypto.createHash('sha1').update(JSON.stringify(blocks.map(contentOf))).digest('hex').slice(0, 12);
const sceneHash = (sc) => hashOf(scriptBlocks(sc));
function shotHash(sc, shot) {
  const ids = new Set(shot.blocks || []);
  const covered = scriptBlocks(sc).filter((b) => ids.has(b.id));
  return covered.length ? hashOf(covered) : sceneHash(sc);
}
const hasContent = (sc) => scriptBlocks(sc).some((b) => b.type !== 'heading' && ((b.text || b.line || '').trim()));
const headingText = (b) => [b.intExt, b.location, b.time && `- ${b.time}`].filter(Boolean).join(' ').toUpperCase();

// ---------------------------------------------------------------- rows ↔ the objects the logic works on
const draftObj = (r, scenes) => ({ id: r.id, name: r.name, owner: r.owner, isMain: !!r.is_main, forkedFrom: P(r.forked_from_json), createdAt: r.created_at, editedAt: r.edited_at, sesh: r.sesh || null, order: P(r.order_json, []), floating: P(r.floating_json, []), formerName: r.former_name || null, scenes });
const draftHead = (d) => [d.name, d.owner, d.isMain ? 1 : 0, d.forkedFrom ? J(d.forkedFrom) : null, d.createdAt, d.editedAt || null, d.sesh || null, J(d.order), J(d.floating), d.formerName || null];
const sceneObj = (r, blocks, shots) => ({ id: r.id, title: r.title, blocks, lock: P(r.lock_json), check: P(r.check_json), editCheck: P(r.edit_check_json), shots, pacing: P(r.pacing_json), placeSuggestion: P(r.place_json), from: r.from_label || null, fromCard: r.from_card || null });
const shotObj = (r) => ({ id: r.id, framing: r.framing || '', camera: r.camera || '', characters: r.characters || '', location: r.location || '', action: r.action || '', dialogue: r.dialogue || '', duration: r.duration ?? 0, refs: r.refs || '', blocks: P(r.blocks_json, []), status: r.status || 'proposed', by: r.by || null, approvedBy: r.approved_by || null });
const seshObj = (r, withBase = true) => ({ id: r.id, draft: r.draft, title: r.title, titled: !!r.titled, by: r.by, people: P(r.people_json, []), startedAt: r.started_at, lastAt: r.last_at, endedAt: r.ended_at, status: r.status, changes: r.changes, ...(withBase ? { base: P(r.base_json) } : {}), baseV: r.base_v, v: r.v, tags: P(r.tags_json, []), note: r.note || '', reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, followsUp: r.follows_up, endedBy: r.ended_by });
const seshHead = (s) => [s.draft, s.title, s.titled ? 1 : 0, s.by, J(s.people), s.startedAt, s.lastAt || null, s.endedAt || null, s.status, s.changes || 0, s.baseV ?? null, s.v ?? null, J(s.tags || []), s.note || null, s.reviewedBy || null, s.reviewedAt || null, s.followsUp || null, s.endedBy || null];
const jobObj = (r) => ({ ...P(r.payload_json, {}), id: r.id, type: r.type, by: r.by, ts: r.ts, status: r.status, result: P(r.result_json), deliveredAt: r.delivered_at, doneAt: r.done_at });
const jobRow = (j) => { const { id, type, by, ts, status, result, deliveredAt, doneAt, ...payload } = j; return [type, by || null, ts, status, J(payload), result == null ? null : J(result), deliveredAt || null, doneAt || null]; };
const factObj = (r) => ({ id: r.id, fact: r.fact, scene: r.scene || null, sceneTitle: r.scene_title || '', source: r.source, by: r.by, at: r.at, hash: r.hash || null, edited: P(r.edited_json), doubt: r.doubt || null, fromCard: r.from_card || null });
const factRow = (f) => [f.fact, f.scene || null, f.sceneTitle || null, f.source || null, f.by || null, f.at, f.hash || null, f.edited ? J(f.edited) : null, f.doubt || null, f.fromCard || null];
const eventObj = (r) => ({ ...P(r.ref_json, {}), id: r.id, ts: r.ts, who: r.who, kind: r.kind, text: r.text });

// prepared statements, once per open project
const STMTS = new WeakMap();
function stmts(p) {
  if (STMTS.has(p)) return STMTS.get(p);
  const q = (sql) => p.db.prepare(sql);
  const s = {
    draftIns: q('INSERT INTO drafts(id, name, owner, is_main, forked_from_json, created_at, edited_at, sesh, order_json, floating_json, former_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    draftUpd: q('UPDATE drafts SET name=?, owner=?, is_main=?, forked_from_json=?, created_at=?, edited_at=?, sesh=?, order_json=?, floating_json=?, former_name=? WHERE id=?'),
    sceneUpsert: q(`INSERT INTO scenes(draft, id, title, from_card, from_label, lock_json, check_json, edit_check_json, pacing_json, place_json) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(draft, id) DO UPDATE SET title=excluded.title, from_card=excluded.from_card, from_label=excluded.from_label, lock_json=excluded.lock_json, check_json=excluded.check_json, edit_check_json=excluded.edit_check_json, pacing_json=excluded.pacing_json, place_json=excluded.place_json`),
    sceneDel: q('DELETE FROM scenes WHERE draft = ? AND id = ?'),
    blocksDel: q('DELETE FROM blocks WHERE draft = ? AND scene = ?'),
    blockIns: q('INSERT INTO blocks(draft, scene, id, pos, type, data_json) VALUES (?,?,?,?,?,?)'),
    shotsDel: q('DELETE FROM shots WHERE draft = ? AND scene = ?'),
    shotIns: q('INSERT INTO shots(draft, scene, id, pos, framing, camera, characters, location, action, dialogue, duration, refs, blocks_json, status, by, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    seshIns: q('INSERT INTO seshes(draft, title, titled, by, people_json, started_at, last_at, ended_at, status, changes, base_v, v, tags_json, note, reviewed_by, reviewed_at, follows_up, ended_by, id, base_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    seshUpd: q('UPDATE seshes SET draft=?, title=?, titled=?, by=?, people_json=?, started_at=?, last_at=?, ended_at=?, status=?, changes=?, base_v=?, v=?, tags_json=?, note=?, reviewed_by=?, reviewed_at=?, follows_up=?, ended_by=? WHERE id=?'),
    jobIns: q("INSERT INTO jobs(type, by, ts, status, payload_json, result_json, delivered_at, done_at, id, section) VALUES (?,?,?,?,?,?,?,?,?,'script')"),
    jobUpd: q('UPDATE jobs SET type=?, by=?, ts=?, status=?, payload_json=?, result_json=?, delivered_at=?, done_at=? WHERE id=?'),
    factIns: q('INSERT INTO facts(fact, scene, scene_title, source, by, at, hash, edited_json, doubt, from_card, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    factUpd: q('UPDATE facts SET fact=?, scene=?, scene_title=?, source=?, by=?, at=?, hash=?, edited_json=?, doubt=?, from_card=? WHERE id=?'),
    factDel: q('DELETE FROM facts WHERE id = ?'),
  };
  STMTS.set(p, s);
  return s;
}

// ---------------------------------------------------------------- the unit of work
class Work {
  constructor(p) {
    this.p = p;
    this.drafts = {};
    this.mainId = null;
    const group = (rows, f) => { const m = {}; for (const r of rows) (m[`${r.draft}/${r.scene}`] ||= []).push(f(r)); return m; };
    const blocks = group(p.all('SELECT * FROM blocks ORDER BY draft, scene, pos'), (r) => ({ id: r.id, type: r.type, ...P(r.data_json, {}) }));
    const shots = group(p.all('SELECT * FROM shots ORDER BY draft, scene, pos'), shotObj);
    const scenes = {};
    for (const r of p.all('SELECT * FROM scenes')) (scenes[r.draft] ||= {})[r.id] = sceneObj(r, blocks[`${r.draft}/${r.id}`] || [], shots[`${r.draft}/${r.id}`] || []);
    for (const r of p.all('SELECT * FROM drafts ORDER BY created_at')) { const d = draftObj(r, scenes[r.id] || {}); this.drafts[d.id] = d; if (d.isMain) this.mainId = d.id; }
    this.seshes = {}; this.origSesh = new Map();
    this._jobs = null; this._facts = null; this._assets = null;
    this.queued = false;
    this.remember();
  }
  remember() {
    this.orig = {};
    for (const d of Object.values(this.drafts)) this.orig[d.id] = { head: J(draftHead(d)), scenes: Object.fromEntries(Object.entries(d.scenes).map(([id, sc]) => [id, J(sc)])) };
    this.origSesh = new Map(Object.values(this.seshes).filter(Boolean).map((s) => [s.id, J(seshHead(s))]));
    this.origJobs = this._jobs ? new Map(this._jobs.map((j) => [j.id, J(j)])) : null;
    this.origFacts = this._facts ? new Map(this._facts.map((f) => [f.id, J(f)])) : null;
  }
  // write back what changed since load (or since the last save)
  save() {
    const st = stmts(this.p);
    for (const d of Object.values(this.drafts)) {
      const o = this.orig[d.id];
      const head = draftHead(d);
      if (!o) st.draftIns.run(d.id, ...head);
      else if (o.head !== J(head)) st.draftUpd.run(...head, d.id);
      for (const sc of Object.values(d.scenes)) {
        if (o && o.scenes[sc.id] === J(sc)) continue;
        st.sceneUpsert.run(d.id, sc.id, sc.title, sc.fromCard || null, sc.from || null, sc.lock ? J(sc.lock) : null, sc.check ? J(sc.check) : null, sc.editCheck ? J(sc.editCheck) : null, sc.pacing ? J(sc.pacing) : null, sc.placeSuggestion ? J(sc.placeSuggestion) : null);
        st.blocksDel.run(d.id, sc.id);
        sc.blocks.forEach((b, i) => { const { id, type, ...data } = b; st.blockIns.run(d.id, sc.id, id, i, type, J(data)); });
        st.shotsDel.run(d.id, sc.id);
        sc.shots.forEach((sh, i) => st.shotIns.run(d.id, sc.id, sh.id, i, sh.framing || null, sh.camera || null, sh.characters || null, sh.location || null, sh.action || null, sh.dialogue || null, sh.duration ?? null, sh.refs || null, J(sh.blocks || []), sh.status || null, sh.by || null, sh.approvedBy || null));
      }
      if (o) for (const id of Object.keys(o.scenes)) if (!d.scenes[id]) st.sceneDel.run(d.id, id);
    }
    for (const s of Object.values(this.seshes)) {
      if (!s) continue;
      const head = seshHead(s);
      if (!this.origSesh.has(s.id)) st.seshIns.run(...head, s.id, J(s.base || null));
      else if (this.origSesh.get(s.id) !== J(head)) st.seshUpd.run(...head, s.id);
    }
    if (this._jobs) for (const j of this._jobs) {
      if (!this.origJobs.has(j.id)) st.jobIns.run(...jobRow(j), j.id);
      else if (this.origJobs.get(j.id) !== J(j)) st.jobUpd.run(...jobRow(j), j.id);
    }
    if (this._facts) {
      const ids = new Set(this._facts.map((f) => f.id));
      for (const id of this.origFacts.keys()) if (!ids.has(id)) st.factDel.run(id);
      for (const f of this._facts) {
        if (!this.origFacts.has(f.id)) st.factIns.run(...factRow(f), f.id);
        else if (this.origFacts.get(f.id) !== J(f)) st.factUpd.run(...factRow(f), f.id);
      }
    }
    if (this._assets) this.p.kvSet('script.assets', this._assets);
    this.p.touch();
    this.remember();
  }

  main() { return this.drafts[this.mainId]; }
  sesh(id) {
    if (!id) return null;
    if (this.seshes[id] === undefined) { const r = this.p.one('SELECT * FROM seshes WHERE id = ?', id); this.seshes[id] = r ? seshObj(r) : null; if (r) this.origSesh.set(id, J(seshHead(this.seshes[id]))); }
    return this.seshes[id];
  }
  addSesh(s) { this.seshes[s.id] = s; }
  jobs() {
    if (!this._jobs) { this._jobs = this.p.all("SELECT * FROM jobs WHERE section = 'script' ORDER BY ts, rowid").map(jobObj); this.origJobs = new Map(this._jobs.map((j) => [j.id, J(j)])); }
    return this._jobs;
  }
  job(id) { return this.jobs().find((j) => j.id === id) || null; }
  enqueue(type, who, fields) {
    const j = { id: nid('j'), type, by: who, ts: now(), status: 'pending', result: null, ...fields };
    this.jobs().push(j);
    this.queued = true;
    return j;
  }
  facts() {
    if (!this._facts) { this._facts = this.p.all('SELECT * FROM facts ORDER BY at, rowid').map(factObj); this.origFacts = new Map(this._facts.map((f) => [f.id, J(f)])); }
    return this._facts;
  }
  setFacts(list) { this.facts(); this._facts = list; }
  assets() { if (!this._assets) this._assets = this.p.kvGet('script.assets', {}) || {}; return this._assets; }
  imported() { return this.p.kvGet('script.imported', []) || []; }
  markImported(id) { const l = this.imported(); if (!l.includes(id)) this.p.kvSet('script.imported', [...l, id]); }
  characters() { return this.p.all('SELECT name FROM characters ORDER BY added_at, rowid').map((r) => r.name); }
  addCharacter(name) {
    const n = String(name || '').trim().toUpperCase().replace(/\s*\(.*\)$/, '');
    if (n && n.length <= 40) this.p.run('INSERT OR IGNORE INTO characters(name, added_at) VALUES (?,?)', n, now());
  }
  staleBy() { return this.p.info().settings?.script?.staleBy === 'shot' ? 'shot' : 'scene'; }
  log(who, kind, text, extra = {}) {
    const e = { id: nid('l'), ts: now(), who, kind, text, ...extra };
    this.p.run('INSERT INTO events(id, ts, who, section, kind, text, ref_json) VALUES (?,?,?,?,?,?,?)', e.id, e.ts, who, 'script', kind, text, J(extra));
    return e;
  }
  logFind(id) { const r = id && this.p.one('SELECT * FROM events WHERE id = ?', id); return r ? eventObj(r) : null; }
  logUpdate(e) { const { id, ts, who, kind, text, ...ref } = e; this.p.run('UPDATE events SET ts = ?, text = ?, ref_json = ? WHERE id = ?', ts, text, J(ref), id); }
  logDelete(id) { this.p.run('DELETE FROM events WHERE id = ?', id); }
  lastV(d) { return this.p.one('SELECT max(n) AS n FROM versions WHERE draft = ?', d.id)?.n || 0; }
  saveVersion(d, { name = '', auto = false, reason = '', who = 'system', sesh = null } = {}) {
    this.save(); // the draft's row must exist first
    const n = this.lastV(d) + 1;
    this.p.run('INSERT INTO versions(draft, n, name, auto, reason, by, ts, snap_json, sesh) VALUES (?,?,?,?,?,?,?,?,?)', d.id, n, str(name, 80), auto ? 1 : 0, reason, who, now(), J(snapDraft(d)), sesh);
    return n;
  }
  version(draftId, n) {
    const r = this.p.one('SELECT * FROM versions WHERE draft = ? AND n = ?', draftId, Number(n));
    return r ? { n: r.n, name: r.name || '', auto: !!r.auto, reason: r.reason || '', by: r.by, ts: r.ts, sesh: r.sesh, snap: P(r.snap_json) } : null;
  }
  keepSnap(sc) {
    const h = sceneHash(sc);
    this.p.run('INSERT OR IGNORE INTO snaps(hash, blocks_json) VALUES (?,?)', h, J(scriptBlocks(sc).map((b) => ({ id: b.id, ...contentOf(b) }))));
    return h;
  }
}

// one action = one transaction; jobs it queued are handed to the bot right after
function run(p, fn) {
  let w;
  const out = p.tx(() => { w = new Work(p); const r = fn(w); w.save(); return r; });
  if (w.queued) setImmediate(deliverHook);
  return out;
}

// ---------------------------------------------------------------- drafts, scenes, lifecycle
const canEdit = (d, who) => !!d && (d.isMain || d.owner === 'team' || d.owner === who);
const num = (d, id) => { const i = d.order.indexOf(id); return i < 0 ? null : i + 1; };
const shotNum = (d, sc, shot) => { const n = num(d, sc.id); return n == null ? null : `${n}.${sc.shots.indexOf(shot) + 1}`; };
const scLabel = (d, sc) => `${num(d, sc.id) ? `sc. ${num(d, sc.id)} ` : ''}${sc.title}`;
const draftLabel = (d) => (d.isMain ? 'Main' : d.name);

function newScene(title, blocks = []) {
  return { id: nid('sc'), title: str(title, 120) || 'Untitled scene', blocks: blocks.map(makeBlock), lock: null, check: null, editCheck: null, shots: [], pacing: null, placeSuggestion: null, from: null, fromCard: null };
}
function newDraft({ name, owner, isMain = false }) {
  return { id: nid('d'), name, owner, isMain, forkedFrom: null, createdAt: now(), editedAt: now(), sesh: null, order: [], floating: [], scenes: {}, formerName: null };
}
// The Judge is the only check before a lock: ok or a question locks, a contradiction doesn't. No team votes anywhere.
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
const snapDraft = (d) => clone({ order: d.order, floating: d.floating, scenes: d.scenes });
// Main keeps its locks / Judge checks / shot lists by scene id whenever its content is replaced (restore, another
// draft made Main): a changed locked scene shows as changed since locking.
function adoptContent(target, snap, carryFrom) {
  const keep = {};
  for (const [id, sc] of Object.entries(carryFrom.scenes)) keep[id] = { lock: sc.lock, check: sc.check, editCheck: sc.editCheck, shots: sc.shots, pacing: sc.pacing };
  target.order = clone(snap.order); target.floating = clone(snap.floating); target.scenes = clone(snap.scenes);
  for (const [id, sc] of Object.entries(target.scenes)) Object.assign(sc, keep[id] || { lock: null, check: null, editCheck: null, shots: [] });
}
function stripPipeline(d) { for (const sc of Object.values(d.scenes)) { sc.lock = null; sc.check = null; sc.editCheck = null; sc.shots = []; } }
function insertAfter(order, id, after) {
  const i = after ? order.indexOf(after) : -1;
  order.splice(after && i < 0 ? order.length : i + 1, 0, id);
}

// ---------------------------------------------------------------- seshes
// Work is never approved while it happens. The first change to a draft opens a sesh; everything done in it is logged
// against it. Ending a sesh (or 45 min of quiet) saves a version named after it. Afterwards it is reviewed: approved,
// or tagged (what needs work) and picked up again in a follow-up sesh.
const humans = (who) => who && who !== 'bot' && who !== 'system';
const seshTitle = (t = now()) => { const x = new Date(t); return `${x.toLocaleDateString('en-GB', { weekday: 'short' })} ${x.toTimeString().slice(0, 5)} sesh`; };
function openSesh(w, d, who) {
  let s = w.sesh(d.sesh);
  if (s && s.status === 'open') { if (humans(who) && !s.people.includes(who)) s.people.push(who); return s; }
  s = { id: nid('ss'), draft: d.id, title: seshTitle(), titled: false, by: humans(who) ? who : 'system', people: humans(who) ? [who] : [],
    startedAt: now(), lastAt: now(), endedAt: null, status: 'open', changes: 0, base: snapDraft(d), baseV: w.lastV(d), v: null,
    tags: [], note: '', reviewedBy: null, reviewedAt: null, followsUp: null, endedBy: null };
  w.addSesh(s); d.sesh = s.id;
  return s;
}
function track(w, d, who, kind, text, extra = {}) {
  const s = openSesh(w, d, who);
  s.changes++; s.lastAt = now();
  return w.log(who, kind, text, { draft: d.id, sesh: s.id, ...extra });
}
// typing: one line per scene per person, counting edits, instead of a line per keystroke
function trackEdit(w, d, who, sc) {
  const s = openSesh(w, d, who);
  s.changes++; s.lastAt = now();
  const r = w.p.one("SELECT * FROM events WHERE section = 'script' AND kind = 'edit' AND who = ? AND ts > ? AND json_extract(ref_json, '$.sesh') = ? AND json_extract(ref_json, '$.scene') = ? ORDER BY ts DESC LIMIT 1", who, now() - 15 * 60 * 1000, s.id, sc.id);
  const label = `edited ${scLabel(d, sc)}`;
  if (r) { const e = eventObj(r); e.n = (e.n || 1) + 1; e.ts = now(); e.text = `${label} (${e.n} changes)`; w.logUpdate(e); return e; }
  return w.log(who, 'edit', label, { draft: d.id, sesh: s.id, scene: sc.id, n: 1 });
}
function endSesh(w, s, who, title) {
  if (!s || s.status !== 'open') return null;
  const d = w.drafts[s.draft];
  if (title) { s.title = str(title, 80); s.titled = true; }
  if (d) d.sesh = null;
  s.endedAt = now(); s.endedBy = who;
  if (!d || !s.changes) { s.status = 'empty'; return s; } // nothing happened
  s.status = 'saved';
  s.v = w.saveVersion(d, { name: s.title, sesh: s.id, who });
  w.log(who, 'sesh', `saved the sesh “${s.title}” as ${draftLabel(d)} v${s.v} (${plural(s.changes, 'change')})`, { draft: d.id, sesh: s.id });
  return s;
}
// the server calls this every minute: seshes nobody touched for 45 min save themselves
export function sweep(p) {
  const old = () => p.all("SELECT id FROM seshes WHERE status = 'open' AND last_at < ?", now() - SESH_IDLE);
  if (!old().length) return false;
  run(p, (w) => { for (const r of old()) endSesh(w, w.sesh(r.id), 'system'); });
  return true;
}

function promoteToMain(w, nw, who) {
  const old = w.main();
  if (!nw || nw === old) return;
  endSesh(w, w.sesh(old.sesh), who);
  adoptContent(nw, snapDraft(nw), old);
  old.isMain = false; old.owner = 'team'; old.name = `Former Main (until ${new Date().toTimeString().slice(0, 5)})`;
  nw.formerName = nw.name; nw.name = 'Main'; nw.owner = 'team'; nw.isMain = true;
  w.mainId = nw.id;
  track(w, nw, who, 'main', `made “${nw.formerName}” the Main draft (the old Main stays in the list)`);
}

function promoSummary(w, target) {
  const m = w.main();
  const out = { same: 0, changed: [], added: [], dropped: [], staleAssets: 0, orphanAssets: 0 };
  for (const [id, sc] of Object.entries(target.scenes)) {
    const o = m.scenes[id];
    if (!o) out.added.push(sc.title);
    else if (sceneHash(o) === sceneHash(sc) && o.title === sc.title) out.same++;
    else out.changed.push(`${sc.title}${o.lock ? ' (locked)' : ''}`);
  }
  for (const [id, sc] of Object.entries(m.scenes)) if (!target.scenes[id]) out.dropped.push(sc.title);
  const by = w.staleBy();
  for (const a of Object.values(w.assets())) {
    const t = target.scenes[a.scene];
    if (!t) { out.orphanAssets++; continue; }
    const shot = m.scenes[a.scene]?.shots.find((s) => s.id === a.shot);
    if (!shot) continue;
    if ((by === 'shot' ? shotHash(t, shot) : sceneHash(t)) !== (by === 'shot' ? a.madeFromShot : a.madeFromScene)) out.staleAssets++;
  }
  return out;
}

// ---------------------------------------------------------------- the Brainstorm side, same file
const fieldText = (v) => (Array.isArray(v) ? v.join('\n') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
function promotedCards(p) {
  return p.all("SELECT c.id, c.title, c.note, c.fields_json, c.promoted_to, c.promoted_at, c.sparked_by, c.session, s.type, s.topic, s.origin_json, (SELECT landed_json FROM promotions pr WHERE pr.card = c.id ORDER BY pr.ts DESC LIMIT 1) AS landed_json FROM cards c JOIN sessions s ON s.id = c.session WHERE c.status = 'promoted' ORDER BY c.promoted_at")
    .map((r) => ({ id: r.id, title: r.title, note: r.note, fields: P(r.fields_json, {}), type: r.type, topic: r.topic, session: r.session, origin: P(r.origin_json), promotedTo: r.promoted_to, promotedAt: r.promoted_at, sparkedBy: r.sparked_by, landed: P(r.landed_json) }));
}
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

// ---------------------------------------------------------------- export
export function fountain(p, d, { title = true, scenes = null } = {}) {
  const info = p.info();
  const lines = [];
  if (title) lines.push(`Title: ${info.name || 'Untitled'}`, ...(info.logline ? [`Notes: ${info.logline}`] : []), `Draft date: ${new Date().toISOString().slice(0, 10)}`, '', '');
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
function printable(p, d) {
  const info = p.info();
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escH(info.name || 'Script')} — ${escH(draftLabel(d))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:25mm 25mm 25mm 38mm}body{font:12pt/1.2 "Courier Prime","Courier New",monospace;color:#000;max-width:6.2in;margin:30px auto}
.title{height:80vh;display:flex;flex-direction:column;justify-content:center;text-align:center;page-break-after:always}.title h1{font-size:12pt;text-transform:uppercase;text-decoration:underline;margin:0 0 2em}
.h{font-weight:700;margin:2em 0 1em;position:relative}.n{position:absolute;left:-.6in}.n.r{left:auto;right:-.6in}.a{white-space:pre-wrap;margin:0 0 1em}.d{margin:0 0 1em}
.c{margin-left:2.1in}.p{margin-left:1.5in}.l{margin-left:1in;margin-right:1.4in;white-space:pre-wrap}.t{text-align:right;margin:1em 0}
@media print{.bar{display:none}}.bar{font:13px system-ui;background:#f5f5f3;padding:8px 12px;border-radius:8px;margin-bottom:20px}</style></head>
<body><div class="bar">${escH(draftLabel(d))} · notes and alternates are never exported · use the print dialog → Save as PDF</div>
<div class="title"><h1>${escH(info.name || 'Untitled')}</h1>${info.logline ? `<div>${escH(info.logline)}</div>` : ''}<div style="margin-top:3em">${escH(new Date().toISOString().slice(0, 10))}</div></div>
${body}<script>addEventListener('load',()=>setTimeout(()=>print(),400))</script></body></html>`;
}
export function exportDraft(p, draftId, kind) {
  const w = new Work(p);
  const d = w.drafts[draftId] || w.main();
  if (!d) return null;
  if (kind === 'pdf') return { type: 'text/html; charset=utf-8', body: printable(p, d) };
  const name = `${(p.info().name || 'script').replace(/[^\w-]+/g, '_')}_${draftLabel(d).replace(/[^\w-]+/g, '_')}.fountain`;
  return { type: 'text/plain; charset=utf-8', body: fountain(p, d), filename: name };
}

// ---------------------------------------------------------------- what the bot gets for a job
const sceneView = (p, d, sc) => ({ id: sc.id, number: num(d, sc.id), title: sc.title, status: statusOf(d, sc), blocks: sc.blocks.filter((b) => !b.alt).map((b) => ({ id: b.id, ...contentOf(b) })), script: fountain(p, d, { title: false, scenes: [sc.id] }) });
const outlineOf = (d) => d.order.map((id) => { const sc = d.scenes[id]; const h = sc.blocks.find((b) => b.type === 'heading'); return { id, number: num(d, id), title: sc.title, heading: h ? headingText(h) : '', status: statusOf(d, sc) }; });

// A fact points at its scene by id (the number is shown live, never written into the text) and remembers the scene's
// content when it was written, so the Bible can say "this scene changed since — still true?".
const cleanFact = (t) => str(t, 300).replace(/\s*\((?:sc\.?|scene)\s*\d+[^)]*\)\s*$/i, '').trim();
function addFact(w, text, { scene = null, source = 'judge', by = 'bot', fromCard = null } = {}) {
  const fact = cleanFact(text);
  const facts = w.facts();
  if (!fact || facts.some((x) => x.fact.toLowerCase() === fact.toLowerCase())) return null;
  const sc = scene && w.main()?.scenes[scene];
  const f = { id: nid('f'), fact, scene: sc ? sc.id : null, sceneTitle: sc?.title || '', source, by, at: now(), hash: sc ? sceneHash(sc) : null, edited: null, doubt: null, fromCard };
  facts.push(f);
  return f;
}
const factScene = (w, f) => (f.scene && w.main()?.scenes[f.scene]) || null;
const scriptExceptions = (p) => p.all("SELECT ref_json, note, reason, who, ts FROM exceptions WHERE section = 'script' ORDER BY ts").map((x) => ({ scene: P(x.ref_json, {}).scene || '', note: x.note, reason: x.reason, who: x.who, ts: x.ts }));

function canon(w) {
  const info = w.p.info();
  return {
    promoted: promotedCards(w.p).map(({ title, type, promotedTo, fields, note }) => ({ title, type, promotedTo, fields, note })),
    facts: w.facts().map((f) => { const sc = factScene(w, f); return { id: f.id, fact: f.fact, scene: sc ? sc.title : f.sceneTitle || null, by: f.edited || f.source === 'team' ? 'team' : f.source === 'brainstorm' ? 'brainstorm (canon)' : 'judge' }; }),
    exceptions: scriptExceptions(w.p).map((x) => `${x.scene}: ${x.note} — dismissed: “${x.reason}”`),
    characters: w.characters(), title: info.name, logline: info.logline,
    references: RF.canon(w.p), // the Bible's Visual Continuity: approved looks and their lasting changes
  };
}

function jobContext(w, j) {
  const p = w.p;
  const d = w.drafts[j.draft];
  const sc = d?.scenes[j.scene];
  if (j.type === 'skeleton') return { idea: j.idea, task: 'Build the script skeleton from the promoted Idea: logline, character list, and empty scene cards (title + one-line note each). 4–10 scenes.', reply: { logline: '…', characters: ['NAME'], scenes: [{ title: '…', note: '…' }] } };
  if (!sc) return { error: 'the scene for this job no longer exists — reply with {"skip":true}' };
  const scene = sceneView(p, d, sc);
  const info = p.info();
  if (j.type === 'generate') {
    const pers = j.personality.key === 'custom' ? { name: 'Custom', prompt: j.personality.custom || 'Be yourself.' } : PERSONALITIES[j.personality.key] || PERSONALITIES.director;
    const tw = TWISTS[j.twistPicked || j.twist] || TWISTS.none;
    const ids = new Set(j.blocks);
    const i = d.order.indexOf(sc.id);
    return {
      task: 'Generator: return 2–4 genuinely different options for the SELECTED blocks, in the personality\'s voice, applying the twist. Each option is a list of blocks that would replace the selection.',
      personality: { name: pers.name, prompt: pers.prompt }, twist: { name: tw.name, rule: tw.rule }, ask: j.ask || null,
      selected: j.refine?.length ? j.refine : scene.blocks.filter((b) => ids.has(b.id)), refining: !!j.refine?.length,
      scene, prev: i > 0 ? outlineOf(d)[i - 1] : null, next: i >= 0 && i < d.order.length - 1 ? outlineOf(d)[i + 1] : null,
      characters: w.characters(), story: { title: info.name, logline: info.logline },
      reply: { options: [{ note: 'one line on what this option does', blocks: [{ type: 'dialogue', character: 'MAYA', paren: '', line: '…' }] }] },
    };
  }
  if (j.type === 'pacing') return { task: 'Pacing check for this scene: where it drags, where it rushes, what could go. Proposals only.', scene, outline: outlineOf(d), reply: { summary: '2–3 sentences', notes: [{ block: 'block id or null', note: '…' }] } };
  if (j.type === 'breakdown') return { task: 'Break this locked scene into shots. Every shot lists the block ids it covers. Global numbering is done by the app.', scene, characters: w.characters(), framings: FRAMINGS, reply: { shots: [{ framing: 'WS', camera: 'static', characters: 'MAYA', location: 'ROOF', action: '…', dialogue: '…', duration: 4, refs: '', blocks: ['b…'] }] } };
  if (j.type === 'place') return { task: 'Continuity Judge: suggest where this floating scene fits in the order. after = id of the scene it should follow, or null for the very start.', scene, outline: outlineOf(d), canon: canon(w), reply: { after: 'sc… or null', reason: 'one line' } };
  if (j.type === 'judge_lock' || j.type === 'judge_edit') {
    const others = d.order.filter((id) => id !== sc.id).map((id) => sceneView(p, d, d.scenes[id])).map(({ id, number, title, script }) => ({ id, number, title, script }));
    const locked = j.type === 'judge_edit' && sc.lock ? P(p.one('SELECT blocks_json FROM snaps WHERE hash = ?', sc.lock.hash)?.blocks_json) : null;
    return {
      task: j.type === 'judge_lock'
        ? 'Continuity Judge, before a lock: check this scene against the Story Bible and every other scene. ok = consistent; warn = possible problem the team can dismiss as intentional; block = contradiction that must be fixed. Also extract new facts (who has / knows / lost what) for the Facts Ledger.'
        : 'Continuity Judge, after an edit to a LOCKED scene: say what changed against the locked version, whether it now contradicts anything, and extract new facts.',
      scene, lockedVersion: locked, otherScenes: others, canon: canon(w),
      sceneFacts: w.facts().filter((f) => f.scene === sc.id).map((f) => ({ id: f.id, fact: f.fact, by: f.source === 'judge' && !f.edited ? 'judge' : 'team' })),
      reply: { verdict: 'ok | warn | block', notes: [{ verdict: 'warn', note: '…', block: 'block id or null' }], facts: ['MAYA has the envelope'], retire: [{ id: 'f…', why: 'the line that said it is gone' }], ...(j.type === 'judge_lock' ? { changes: [{ who: 'MAYA', name: 'Cut cheek', what: 'a fresh cut on her right cheek, a plaster over it' }] } : {}) },
    };
  }
  return {};
}

const sanitizeBlocks = (list) => (Array.isArray(list) ? list : []).filter((b) => b && FIELDS[b.type]).slice(0, 40).map((b) => { const m = makeBlock(b); delete m.id; return m; });
function newShot(s = {}, by = 'team') {
  return {
    id: nid('sh'), framing: FRAMINGS.includes(String(s.framing).toUpperCase()) ? String(s.framing).toUpperCase() : str(s.framing, 20) || 'MS',
    camera: str(s.camera, 80), characters: str(Array.isArray(s.characters) ? s.characters.join(', ') : s.characters, 200),
    location: str(s.location, 120), action: str(s.action, 600), dialogue: str(s.dialogue, 600),
    duration: Math.max(0, Math.min(600, Number(s.duration) || 0)), refs: str(s.refs, 200), blocks: Array.isArray(s.blocks) ? s.blocks.slice(0, 40) : [],
    status: 'proposed', by, approvedBy: null,
  };
}

function finishJob(w, j, b) {
  const d = w.drafts[j.draft];
  const sc = d?.scenes[j.scene];
  if (b.skip) { j.status = 'failed'; j.note = 'skipped by the bot'; return 'skipped'; }
  if (j.type === 'skeleton') {
    const m = j.draft ? d : w.main(); // a new draft from an Idea gets its own skeleton; Main stays as it is
    if (!m) { j.status = 'failed'; j.note = 'no script'; return 'no script'; }
    if (b.logline && m.isMain && !w.p.info().logline) w.p.run('UPDATE project SET logline = ?', str(b.logline, 300)); // the team's own logline wins
    for (const c of b.characters || []) w.addCharacter(c);
    for (const s of (b.scenes || []).slice(0, 20)) {
      const scn = newScene(s.title, s.note ? [{ type: 'note', text: s.note }] : []);
      m.scenes[scn.id] = scn; m.order.push(scn.id);
    }
    j.result = { scenes: (b.scenes || []).length };
    track(w, m, 'bot', 'skeleton', `built the skeleton: ${plural((b.scenes || []).length, 'scene card')}, ${plural(w.characters().length, 'character')}`);
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
    track(w, d, 'bot', 'shots', `proposed ${plural(shots.length, 'shot')} for ${scLabel(d, sc)}`, { scene: sc.id });
    return `${shots.length} shots proposed`;
  }
  if (j.type === 'place') {
    const after = b.after && d.order.includes(b.after) ? b.after : null;
    sc.placeSuggestion = { after, reason: str(b.reason, 400), at: now() };
    j.result = true;
    return 'placement suggested';
  }
  if (j.type === 'judge_lock' || j.type === 'judge_edit') {
    const rank = { ok: 0, warn: 1, block: 2 };
    const notes = (b.notes || []).slice(0, 12).map((n) => ({ verdict: rank[n.verdict] !== undefined ? n.verdict : 'warn', note: str(n.note, 500), block: n.block || null, dismissed: false }));
    const worst = notes.some((n) => n.verdict === 'block') ? 'block' : notes.some((n) => n.verdict === 'warn') ? 'warn' : 'ok';
    const verdict = rank[b.verdict] !== undefined && rank[b.verdict] > rank[worst] ? b.verdict : worst;
    for (const f of (b.facts || []).slice(0, 12)) if (f) addFact(w, typeof f === 'string' ? f : f.fact, { scene: sc.id });
    for (const r of (b.retire || []).slice(0, 12)) { // facts that stopped being true: the Judge removes its own, and only flags the team's
      const f = w.facts().find((x) => x.id === (typeof r === 'string' ? r : r.id));
      if (!f) continue;
      const why = str(typeof r === 'string' ? '' : r.why, 200);
      if (f.source === 'judge' && !f.edited) { w.setFacts(w.facts().filter((x) => x !== f)); track(w, d, 'bot', 'fact', `retired a fact: “${f.fact}”${why ? ` (${why})` : ''}`, { scene: sc.id }); }
      else f.doubt = why || 'the Judge thinks this may no longer be true';
    }
    for (const f of w.facts()) if (f.scene === sc.id && !f.doubt) f.hash = sceneHash(sc); // the Judge just checked them against this version
    const rec = { state: 'done', hash: j.hash, verdict, notes, at: now(), by: j.by };
    if (j.type === 'judge_edit') { sc.editCheck = rec; j.result = true; return `edit check: ${verdict}`; }
    sc.check = rec; j.result = true;
    if (d.isMain && Array.isArray(b.changes) && b.changes.length) RF.lasting(w.p, { scene: sc.id, changes: b.changes, by: j.by }); // lasting changes become variants in References
    const said = { ok: 'consistent', warn: plural(notes.filter((n) => n.verdict === 'warn').length || 1, 'question'), block: 'a contradiction' }[verdict];
    track(w, d, 'bot', 'judge', `checked ${scLabel(d, sc)}: ${said}${notes.length && verdict !== 'ok' ? ` (${notes.filter((n) => n.verdict !== 'ok').map((n) => n.note).join(' · ').slice(0, 160)})` : ''}`, { scene: sc.id });
    if (checkOk(sc) && d.isMain) doLock(w, d, sc, j.by);
    return `judge: ${verdict}${sc.lock?.hash === sceneHash(sc) ? ' → locked' : ''}`;
  }
  return 'ok';
}

// No vote: the Judge passing (ok or a question) locks the scene for whoever asked. Questions stay on it, dismissable.
function doLock(w, d, sc, who) {
  const h = w.keepSnap(sc);
  const re = !!sc.lock;
  sc.lock = { hash: h, at: now(), n: num(d, sc.id), by: [who] };
  sc.editCheck = null;
  track(w, d, who, 'lock', `${re ? 're-locked' : 'locked'} ${scLabel(d, sc)}`, { scene: sc.id });
}

// a locked scene that is edited gets re-checked by the Judge a few seconds after the last edit
const judgeTimers = new Map();
function touched(w, d, sc, who, { quiet = false } = {}) {
  d.editedAt = now();
  if (sc && !quiet) trackEdit(w, d, who, sc);
  if (!d.isMain || !sc?.lock) return;
  const p = w.p, sid = sc.id, key = `${p.id}/${sid}`;
  clearTimeout(judgeTimers.get(key));
  judgeTimers.set(key, setTimeout(() => {
    judgeTimers.delete(key);
    try {
      run(p, (x) => {
        const cur = x.main()?.scenes[sid];
        if (!cur?.lock || sceneHash(cur) === cur.lock.hash) { if (cur) cur.editCheck = null; return; }
        const h = sceneHash(cur);
        if (cur.editCheck?.hash === h) return;
        const queued = x.jobs().find((j) => j.type === 'judge_edit' && j.scene === sid && j.status === 'pending');
        if (queued) queued.hash = h;
        else x.enqueue('judge_edit', who, { draft: x.mainId, scene: sid, hash: h });
        cur.editCheck = { state: 'checking', hash: h, notes: [], at: now() };
      });
    } catch (e) { if (!/closed|not open/i.test(e.message)) console.error('judge re-check:', e.message); }
  }, JUDGE_EDIT_DELAY));
}

// ---------------------------------------------------------------- the bot's side
export function pendingJob(projects) {
  let best = null;
  for (const p of projects) {
    const r = p.one("SELECT id, ts FROM jobs WHERE section = 'script' AND status = 'pending' ORDER BY ts LIMIT 1");
    if (r && (!best || r.ts < best.ts)) best = { p, id: r.id, ts: r.ts };
  }
  return best;
}
export function deliver(p, id) {
  return run(p, (w) => {
    const j = w.job(id);
    if (!j || j.status !== 'pending') return null;
    j.status = 'delivered'; j.deliveredAt = now();
    let ctx;
    try { ctx = jobContext(w, j); } catch (e) { ctx = { error: e.message }; }
    return { section: 'script', project: { id: p.id, name: p.info().name }, job: { id: j.id, type: j.type, by: j.by }, ...ctx,
      reply_with: `node bot/done.mjs <<'EOF'\n{ ...reply }\nEOF   (project and job default to ${p.id} / ${j.id})` };
  });
}
// the bot took a job and never answered (it died mid-job): hand it out again
export function requeueStale(p) {
  const r = p.db.prepare("UPDATE jobs SET status = 'pending' WHERE section = 'script' AND status = 'delivered' AND delivered_at < ?").run(now() - STALE_DELIVERY);
  if (r.changes) p.touch();
}
export function botDone(p, b) {
  return run(p, (w) => {
    const j = w.job(b.job);
    if (!j) throw err(`no such job: ${b.job}`, 404);
    if (j.status === 'done') throw err(`job ${j.id} is already done`);
    const note = finishJob(w, j, b);
    if (j.status !== 'failed') { j.status = 'done'; j.doneAt = now(); }
    setImmediate(() => changeHook(p, j.by));
    return { ok: true, project: p.id, job: j.id, note, next: 'node bot/wait.mjs' };
  });
}

// ---------------------------------------------------------------- the join: a promoted card lands where it belongs
// Promotion pushes. The card lands in the script or the Bible and waits for a person; it never rewrites a scene by itself.
// A session sent from a scene ("Brainstorm this scene") remembers it, so a Scene or Dialogue card goes straight back into
// that scene as an alternate (Use it / Remove), next to the lines it was sent with.
const itemsOf = (v) => (Array.isArray(v) ? v.map(fieldText) : fieldText(v).split(/\n+/)).map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
function sceneCardBlocks(card) {
  const f = card.fields || {};
  const out = [];
  if (f.location) out.push(parseHeading(fieldText(f.location)));
  const about = [['who_is_there', 'who is there'], ['purpose', 'purpose'], ['ending_hook', 'ending hook']].map(([k, l]) => (f[k] ? `${l}: ${fieldText(f[k])}` : '')).filter(Boolean).join('\n');
  if (about) out.push({ type: 'note', text: about });
  const beats = itemsOf(f.beats);
  for (const b of beats) out.push({ type: 'action', text: b });
  if (!beats.length && !about && card.note) out.push({ type: 'note', text: card.note });
  return out;
}
function arcFacts(card) {
  const f = card.fields || {};
  const out = [];
  const one = (label, v) => { const t = itemsOf(v).join(' '); if (t) out.push(`${label}: ${t.length > 280 ? `${t.slice(0, 279)}…` : t}`); };
  one('Spine', f.spine);
  for (const x of itemsOf(f.character_arcs)) out.push(x);
  for (const x of itemsOf(f.world_rules)) out.push(`Rule: ${x}`);
  one('Timeline', f.timeline);
  one('Themes', f.themes);
  for (const x of itemsOf(f.never_list)) out.push(`Never: ${x}`);
  if (!out.length && card.note) out.push(card.note);
  return out;
}
// the scene a session was sent from, in the draft it was sent from (or Main, if that draft lost it)
function originScene(w, origin) {
  if (!origin || origin.section !== 'script' || !origin.scene) return null;
  const d = w.drafts[origin.draft]?.scenes[origin.scene] ? w.drafts[origin.draft] : w.main()?.scenes[origin.scene] ? w.main() : null;
  return d ? { d, sc: d.scenes[origin.scene] } : null;
}
function addAlternate(w, d, sc, raw, of, card, who) {
  const span = (of || []).filter((id) => sc.blocks.some((x) => x.id === id && !x.alt));
  const fresh = raw.map((x) => makeBlock(x));
  const group = nid('g');
  for (const x of fresh) x.alt = { group, of: span, by: card.sparkedBy || 'Brainstorm', personality: '', twist: '', note: card.title, source: 'brainstorm', card: card.id, session: card.session };
  const idx = span.map((id) => sc.blocks.findIndex((x) => x.id === id));
  sc.blocks.splice(idx.length ? Math.max(...idx) + 1 : sc.blocks.length, 0, ...fresh);
  for (const x of fresh) if (x.type === 'dialogue') w.addCharacter(x.character);
  track(w, d, who, 'landed', `“${card.title}” came back from Brainstorm into ${scLabel(d, sc)} as an alternate`, { scene: sc.id, card: card.id });
  touched(w, d, sc, who, { quiet: true });
  return group;
}
function landCard(w, card, who, opts = {}) {
  const p = w.p;
  const where = (d, sc) => `${d.isMain ? '' : `${draftLabel(d)}, `}${scLabel(d, sc)}`;
  let landed = null;
  if (card.type === 'idea') {
    const f = card.fields || {};
    const logline = str(fieldText(f.logline), 300).trim();
    const notes = ['synopsis', 'tone', 'themes'].map((k) => (f[k] ? `${k}: ${fieldText(f[k])}` : '')).filter(Boolean).join('\n');
    const info = p.info();
    p.run('UPDATE project SET logline = ?, notes = ?, from_idea = ?', logline || info.logline, notes || info.notes, card.id);
    w.log(who, 'landed', `the Idea “${card.title}” set the logline${notes ? ' and notes' : ''}${info.logline && logline && info.logline !== logline ? ` (it was: “${info.logline}”)` : ''}`, { card: card.id });
    landed = { section: 'bible', what: 'logline', say: w.mainId ? 'Its logline and notes are in the Bible now.' : 'Its logline and notes are in the Bible; the script can start from it.' };
  } else if (card.type === 'arc') {
    const n = arcFacts(card).map((t) => addFact(w, t, { source: 'brainstorm', by: card.sparkedBy || 'Brainstorm', fromCard: card.id })).filter(Boolean).length;
    const text = `the Arc “${card.title}” added ${plural(n, 'fact')} to the Bible`;
    if (w.mainId) track(w, w.main(), who, 'landed', text, { card: card.id }); else w.log(who, 'landed', text, { card: card.id });
    landed = { section: 'bible', what: 'facts', n, say: `${plural(n, 'fact')} from it ${n === 1 ? 'is' : 'are'} in the Bible now; the Judge reads them.` };
  } else if (card.type === 'character') {
    const f = card.fields || {};
    const name = String(fieldText(f.name) || card.title).trim().toUpperCase().replace(/\s*\(.*\)$/, '').slice(0, 40);
    const v = (k) => str(fieldText(f[k]), 1000).trim() || null;
    p.run(`INSERT INTO characters(name, role, look, personality, arc, voice_notes, from_card, added_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET role = COALESCE(excluded.role, role), look = COALESCE(excluded.look, look), personality = COALESCE(excluded.personality, personality),
      arc = COALESCE(excluded.arc, arc), voice_notes = COALESCE(excluded.voice_notes, voice_notes), from_card = excluded.from_card`, name, v('role'), v('look'), v('personality'), v('arc'), v('voice_notes'), card.id, now());
    const ref = RF.fromCard(p, card, who);
    landed = { section: 'references', what: 'character', name, ref: ref.id, kind: 'characters', say: `${ref.name} is in References → Characters now.` };
  } else if (card.type === 'scene') {
    const o = originScene(w, card.origin);
    if (o) {
      const of = card.origin.blocks?.length ? card.origin.blocks : scriptBlocks(o.sc).map((x) => x.id);
      const group = addAlternate(w, o.d, o.sc, sceneCardBlocks(card), of, card, who);
      landed = { section: 'script', as: 'alternate', draft: o.d.id, scene: o.sc.id, group, place: where(o.d, o.sc), say: `It’s waiting in ${where(o.d, o.sc)} as an alternate.` };
    } else if (w.mainId) {
      const m = w.main();
      const sc = newScene(card.title, sceneCardBlocks(card)); sc.from = `from the brainstorm “${card.topic}”`; sc.fromCard = card.id;
      m.scenes[sc.id] = sc; m.floating.push(sc.id);
      sc.placeSuggestion = { pending: true, at: now() };
      w.enqueue('place', who, { draft: m.id, scene: sc.id });
      track(w, m, who, 'landed', `“${card.title}” came in from Brainstorm (not placed yet)`, { scene: sc.id, card: card.id });
      landed = { section: 'script', as: 'floating', draft: m.id, scene: sc.id, say: 'It’s in the script under “Not placed”; the Judge suggests where it fits.' };
    }
  } else if (card.type === 'dialogue') {
    const m = w.main();
    const o = originScene(w, card.origin) || (opts.scene && m?.scenes[opts.scene] ? { d: m, sc: m.scenes[opts.scene] } : null);
    const ls = parseLines(fieldText(card.fields?.exchange) || card.note);
    if (o && ls.length) {
      const group = addAlternate(w, o.d, o.sc, ls, (originScene(w, card.origin) ? card.origin.blocks : null) || [], card, who);
      landed = { section: 'script', as: 'alternate', draft: o.d.id, scene: o.sc.id, group, place: where(o.d, o.sc), say: `Its lines are waiting in ${where(o.d, o.sc)} as an alternate.` };
    }
  }
  if (landed) {
    p.run('UPDATE promotions SET landed_json = ? WHERE card = ?', J({ ...landed, at: now() }), card.id);
    w.markImported(card.id);
  }
  return landed;
}
// Brainstorm → Promoted → Send: the card lands where it belongs (it can be sent again after more cleaning)
export function land(p, cardId, who, opts = {}) {
  const card = promotedCards(p).find((c) => c.id === cardId);
  if (!card) throw err('that card isn’t promoted', 404);
  const landed = run(p, (w) => landCard(w, card, who, opts));
  changeHook(p, who);
  if (!landed) throw err(card.type === 'dialogue' ? 'pick the scene its lines go into' : 'start the script first (Script → start it), then send this');
  return landed;
}
// for the Send button: where a promoted card would go, in words
export function sendLabel(p, card) {
  const o = card.origin?.section === 'script' ? card.origin : null;
  const main = p.one('SELECT id, order_json FROM drafts WHERE is_main = 1');
  const sc = o && p.one('SELECT title FROM scenes WHERE id = ? AND (draft = ? OR draft = ?)', o.scene, o.draft, main?.id || '');
  const n = sc && main ? P(main.order_json, []).indexOf(o.scene) : -1;
  const back = sc ? `Send back to ${n >= 0 ? `sc. ${n + 1} ` : ''}${sc.title}` : null;
  if (card.type === 'scene') return back || (main ? 'Send to the script (Not placed)' : 'Send to the script');
  if (card.type === 'dialogue') return back || 'Send its lines to…';
  if (card.type === 'idea') return 'Send to the Bible (logline & notes)';
  if (card.type === 'arc') return 'Send to the Bible (facts)';
  if (card.type === 'character') return 'Send to References (characters)';
  return 'Send';
}
// a Brainstorm alternate was used or removed: its card's landing says so
function landingState(w, alt, state) {
  if (alt?.source !== 'brainstorm' || !alt.card) return;
  const l = P(w.p.one('SELECT landed_json FROM promotions WHERE card = ? ORDER BY ts DESC LIMIT 1', alt.card)?.landed_json);
  if (l) w.p.run('UPDATE promotions SET landed_json = ? WHERE card = ?', J({ ...l, state, stateAt: now() }), alt.card);
}

// ---------------------------------------------------------------- who is where (not stored)
const PRESENCE = new Map(); // project id → { name: { draft, scene, block, ts } }
const presenceOf = (pid) => { if (!PRESENCE.has(pid)) PRESENCE.set(pid, {}); return PRESENCE.get(pid); };
export function leave(pid, who) { const m = PRESENCE.get(pid); if (m && m[who]) { delete m[who]; return true; } return false; }

// ---------------------------------------------------------------- team actions
function ctxOf(w, b, who, { edit = true, needScene = true } = {}) {
  const d = w.drafts[b?.draft];
  if (!d) bad('no such draft');
  const sc = b.scene ? d.scenes[b.scene] : null;
  if (needScene && !sc) bad('no such scene');
  if (edit && !canEdit(d, who)) bad(`read-only: this is ${d.owner}’s draft. Make a draft of your own to change it.`);
  return { d, sc };
}
const findBlock = (sc, id) => { const i = sc.blocks.findIndex((x) => x.id === id); if (i < 0) bad('no such line'); return [sc.blocks[i], i]; };
const mainOnly = (d) => { if (!d.isMain) bad('only in Main: locks and shot lists come from Main'); };
const personalityLabel = (pk) => (pk.key === 'custom' ? pk.custom || 'Custom' : PERSONALITIES[pk.key]?.name || pk.key);

const A = {
  start(w, b, who) {
    if (w.mainId) bad('the script has already started');
    const m = newDraft({ name: 'Main', owner: 'team', isMain: true });
    w.drafts[m.id] = m; w.mainId = m.id;
    const mode = ['sample', 'idea', 'blank'].includes(b.mode) ? b.mode : 'blank';
    if (mode === 'sample') {
      for (const c of SAMPLE.characters) w.addCharacter(c);
      for (const s of SAMPLE.scenes) { const sc = newScene(s.title, s.blocks); m.scenes[sc.id] = sc; m.order.push(sc.id); }
      for (const s of SAMPLE.floating) { const sc = newScene(s.title, s.blocks); sc.from = 'the sample'; m.scenes[sc.id] = sc; m.floating.push(sc.id); }
    } else if (mode === 'idea') {
      const idea = promotedCards(w.p).find((c) => c.id === b.card && c.type === 'idea');
      if (!idea) bad('that Idea is not promoted in this project');
      const notes = ['synopsis', 'tone', 'themes'].map((k) => (idea.fields[k] ? `${k}: ${fieldText(idea.fields[k])}` : '')).filter(Boolean).join('\n');
      w.p.run('UPDATE project SET logline = ?, notes = ?, from_idea = ?', str(fieldText(idea.fields.logline), 300) || w.p.info().logline, notes, idea.id);
      w.markImported(idea.id);
      w.p.run("UPDATE promotions SET landed_json = ? WHERE card = ? AND landed_json IS NULL", J({ section: 'script', how: 'started the script' }), idea.id);
      w.enqueue('skeleton', who, { idea: { title: idea.title, note: idea.note, fields: idea.fields } });
    }
    w.saveVersion(m, { auto: true, reason: { sample: 'the sample', idea: 'skeleton from the Idea', blank: 'empty script' }[mode], who });
    w.log(who, 'start', mode === 'idea' ? 'started the script from the promoted Idea' : mode === 'sample' ? 'started the script on the sample' : 'started an empty script');
  },
  settings(w, b) {
    if (!['scene', 'shot'].includes(b.staleBy)) return;
    const s = w.p.info().settings || {};
    w.p.run('UPDATE project SET settings_json = ?', J({ ...s, script: { ...(s.script || {}), staleBy: b.staleBy } }));
  },
  project(w, b) { if (b.logline !== undefined) w.p.run('UPDATE project SET logline = ?', str(b.logline, 300)); }, // typing, so no history line
  'character/add'(w, b) { w.addCharacter(b.name); },

  // ---- scenes & order: everything applies at once and is logged in the sesh
  order(w, b, who) {
    const { d } = ctxOf(w, b, who, { needScene: false });
    const all = [...d.order, ...d.floating].sort().join();
    const order = (b.order || []).filter((id) => d.scenes[id]);
    const floating = (b.floating || d.floating).filter((id) => d.scenes[id] && !order.includes(id));
    if ([...order, ...floating].sort().join() !== all) bad('order does not match the scenes');
    d.order = order; d.floating = floating;
    track(w, d, who, 'move', 'reordered the scenes');
    touched(w, d, null, who);
  },
  'scene/add'(w, b, who) {
    const { d } = ctxOf(w, b, who, { needScene: false });
    const sc = newScene(b.title || 'New scene', [{ type: 'heading', intExt: 'INT.', location: '', time: '' }]);
    d.scenes[sc.id] = sc;
    const after = b.after === 'end' ? d.order.at(-1) || null : b.after || null;
    if (b.floating) d.floating.push(sc.id); else insertAfter(d.order, sc.id, after);
    track(w, d, who, 'scene', `added “${sc.title}” ${b.floating ? '(not placed yet)' : `as sc. ${num(d, sc.id)}`}`, { scene: sc.id });
    touched(w, d, null, who);
    return { id: sc.id };
  },
  'scene/title'(w, b, who) { const { d, sc } = ctxOf(w, b, who); sc.title = str(b.title, 120) || sc.title; touched(w, d, sc, who); },
  'scene/delete'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    if (sc.lock) bad('locked scenes cannot be deleted');
    const n = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); d.floating = d.floating.filter((x) => x !== sc.id); delete d.scenes[sc.id];
    track(w, d, who, 'scene', `deleted ${n ? `sc. ${n} ` : ''}“${sc.title}” (it’s still in the versions)`);
    touched(w, d, null, who);
  },
  'scene/move'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const after = b.after || null;
    if (after === sc.id) return { unchanged: true };
    if (d.floating.includes(sc.id)) return A['scene/place'](w, b, who);
    const from = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); insertAfter(d.order, sc.id, after);
    const to = num(d, sc.id);
    if (to === from) return { unchanged: true };
    track(w, d, who, 'move', `moved “${sc.title}” ${from} → ${to}`, { scene: sc.id });
    touched(w, d, null, who);
    return { applied: true };
  },
  'scene/place'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    if (!d.floating.includes(sc.id)) bad('not floating');
    const after = b.after === undefined ? sc.placeSuggestion?.after ?? null : b.after || null;
    d.floating = d.floating.filter((x) => x !== sc.id); insertAfter(d.order, sc.id, after); sc.placeSuggestion = null;
    track(w, d, who, 'move', `placed “${sc.title}” as sc. ${num(d, sc.id)}`, { scene: sc.id });
    touched(w, d, null, who);
    return { applied: true };
  },
  'scene/unplace'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    if (!d.order.includes(sc.id)) return { unchanged: true };
    const n = num(d, sc.id);
    d.order = d.order.filter((x) => x !== sc.id); d.floating.push(sc.id);
    track(w, d, who, 'move', `took sc. ${n} “${sc.title}” out of the order`, { scene: sc.id });
    touched(w, d, null, who);
  },
  'scene/suggest'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who, { edit: false });
    sc.placeSuggestion = { pending: true, at: now() };
    w.enqueue('place', who, { draft: d.id, scene: sc.id });
  },
  'scene/lock'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    mainOnly(d);
    if (d.floating.includes(sc.id)) bad('place the scene before locking it');
    if (sc.lock && sceneHash(sc) === sc.lock.hash) bad('already locked, and unchanged since');
    if (!hasContent(sc)) bad('nothing to lock yet: write the scene first');
    if (checkOk(sc)) { doLock(w, d, sc, who); return { locked: true }; }
    if (w.jobs().some((j) => j.type === 'judge_lock' && j.scene === sc.id && j.status !== 'done' && j.status !== 'failed' && j.hash === sceneHash(sc))) return { already: true };
    sc.check = { state: 'checking', hash: sceneHash(sc), notes: [], at: now(), by: who };
    w.enqueue('judge_lock', who, { draft: d.id, scene: sc.id, hash: sceneHash(sc) });
    track(w, d, who, 'judge', `asked the Judge to check ${scLabel(d, sc)} before locking`, { scene: sc.id });
  },
  'scene/judge-skip'(w, b, who) { // while the bot is off: lock without the Judge
    const { d, sc } = ctxOf(w, b, who);
    mainOnly(d);
    if (botOnline()) bad('the bot is on — let the Judge check it');
    for (const j of w.jobs()) if (j.type === 'judge_lock' && j.scene === sc.id && j.status === 'pending') { j.status = 'failed'; j.note = 'skipped by the team'; }
    sc.check = { state: 'done', hash: sceneHash(sc), verdict: 'ok', notes: [{ verdict: 'ok', note: 'Locked without the Judge (the bot was off)', dismissed: false }], at: now(), by: who, skipped: true };
    doLock(w, d, sc, who);
  },
  'scene/unlock'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    mainOnly(d);
    if (!sc.lock) bad('not locked');
    sc.lock = null; sc.editCheck = null;
    track(w, d, who, 'lock', `unlocked ${scLabel(d, sc)} (its shots stay)`, { scene: sc.id });
  },
  'scene/dismiss'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const target = b.edit ? sc.editCheck : sc.check;
    const n = target?.notes?.[b.idx];
    if (!n || n.verdict !== 'warn' || n.dismissed) bad('no open question there');
    n.dismissed = true; n.dismissedBy = who;
    w.p.run('INSERT INTO exceptions(id, section, ref_json, note, reason, who, ts) VALUES (?,?,?,?,?,?,?)', nid('ex'), 'script', J({ scene: sc.title, sceneId: sc.id }), n.note, str(b.reason || 'We know, it’s intentional', 300), who, now());
    track(w, d, who, 'judge', `marked a Judge note on ${scLabel(d, sc)} as intended: ${n.note.slice(0, 120)}`, { scene: sc.id });
  },
  'scene/breakdown'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    mainOnly(d);
    if (!sc.lock) bad('shots are made for locked scenes only');
    w.enqueue('breakdown', who, { draft: d.id, scene: sc.id });
  },
  'scene/pacing'(w, b, who) { const { d, sc } = ctxOf(w, b, who, { edit: false }); w.enqueue('pacing', who, { draft: d.id, scene: sc.id }); sc.pacing = { pending: true, by: who, at: now() }; },
  'scene/pacing-clear'(w, b, who) { const { sc } = ctxOf(w, b, who, { edit: false }); sc.pacing = null; },
  // a Brainstorm session in the same project, seeded with the scene; it remembers where it came from
  'scene/send-brainstorm'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who, { edit: false });
    const type = b.type === 'dialogue' ? 'dialogue' : 'scene';
    const ids = new Set(b.blocks || []);
    let seed = fountain(w.p, d, { title: false, scenes: [sc.id] });
    if (ids.size) seed = sc.blocks.filter((x) => ids.has(x.id)).map((x) => (x.type === 'dialogue' ? `${x.character}${x.paren ? ` (${x.paren})` : ''}: ${x.line}` : x.type === 'heading' ? headingText(x) : x.text)).join('\n');
    seed = `From the script, ${num(d, sc.id) ? `sc. ${num(d, sc.id)}` : 'a scene not placed yet'} “${sc.title}”:\n\n${seed}`;
    const s = createSession(w.p, { type, topic: `${num(d, sc.id) ? `Sc. ${num(d, sc.id)} ` : ''}${sc.title}${type === 'dialogue' ? ' · dialogue' : ''}`, seed, origin: { section: 'script', draft: d.id, scene: sc.id, blocks: [...ids] } }, who);
    w.log(who, 'brainstorm', `opened a ${type} brainstorm on ${scLabel(d, sc)}`, { draft: d.id, scene: sc.id, session: s.id });
    return { session: s.id };
  },

  // ---- lines
  'block/add'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const blk = makeBlock({ type: b.type || 'action', ...(b.fields || {}) });
    // the client may name the line (optimistic insert, so focus moves before the round trip)
    if (/^c[a-z0-9]{6,24}$/.test(b.id || '') && !Object.values(d.scenes).some((x) => x.blocks.some((y) => y.id === b.id))) blk.id = b.id;
    const i = b.after ? sc.blocks.findIndex((x) => x.id === b.after) : -1;
    sc.blocks.splice(b.after === 'end' || (b.after && i < 0) ? sc.blocks.length : i + 1, 0, blk);
    touched(w, d, sc, who);
    return { id: blk.id };
  },
  'block/update'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const [blk] = findBlock(sc, b.block);
    for (const [k, v] of Object.entries(b.patch || {})) if (FIELDS[blk.type].includes(k)) blk[k] = k === 'intExt' ? normIntExt(v) : str(v);
    if (blk.type === 'dialogue' && b.patch?.character) w.addCharacter(blk.character);
    touched(w, d, sc, who);
  },
  'block/type'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const [blk, i] = findBlock(sc, b.block);
    if (!FIELDS[b.type]) bad('unknown line type');
    const text = (blk.text || blk.line || blk.location || '').replace(/^\/$/, ''); // "/" was the type-menu trigger
    const nb = makeBlock({ type: b.type, text, line: text, location: b.type === 'heading' ? text.toUpperCase() : '', intExt: b.type === 'heading' ? 'INT.' : '' });
    nb.id = blk.id; if (blk.alt) nb.alt = blk.alt;
    sc.blocks[i] = nb;
    touched(w, d, sc, who);
  },
  'block/delete'(w, b, who) { const { d, sc } = ctxOf(w, b, who); const [, i] = findBlock(sc, b.block); sc.blocks.splice(i, 1); touched(w, d, sc, who); },
  'block/move'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const [blk, i] = findBlock(sc, b.block);
    const j = Math.max(0, Math.min(sc.blocks.length - 1, i + (b.dir < 0 ? -1 : 1)));
    sc.blocks.splice(i, 1); sc.blocks.splice(j, 0, blk); touched(w, d, sc, who);
  },
  // drag a line (or several picked lines) to a new spot: same scene, or another one
  'block/reorder'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const dst = b.toScene ? d.scenes[b.toScene] : sc;
    if (!dst) bad('no such scene');
    const ids = new Set((b.ids || []).filter((id) => sc.blocks.some((x) => x.id === id)));
    if (!ids.size) bad('nothing to move');
    if (b.after && ids.has(b.after)) return { unchanged: true };
    const moving = sc.blocks.filter((x) => ids.has(x.id));
    sc.blocks = sc.blocks.filter((x) => !ids.has(x.id));
    const i = b.after ? dst.blocks.findIndex((x) => x.id === b.after) : -1;
    if (b.after && i < 0) bad('that spot is gone');
    dst.blocks.splice(i + 1, 0, ...moving);
    touched(w, d, sc, who);
    if (dst !== sc) touched(w, d, dst, who);
    return { applied: true };
  },
  'alt/use'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const [blk] = findBlock(sc, b.block);
    if (!blk.alt) bad('not an alternate');
    const g = blk.alt;
    const of = new Set(g.of);
    sc.blocks = sc.blocks.filter((x) => !of.has(x.id));
    for (const x of sc.blocks) if (x.alt?.group === g.group) delete x.alt;
    landingState(w, g, 'used');
    if (g.source === 'brainstorm') track(w, d, who, 'landed', `used the Brainstorm version “${g.note}” in ${scLabel(d, sc)}`, { scene: sc.id, card: g.card });
    else track(w, d, who, 'generator', `used an alternate in ${scLabel(d, sc)}`, { scene: sc.id, personality: g.personality, twist: g.twist });
    touched(w, d, sc, who, { quiet: true });
  },
  'alt/remove'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who);
    const [blk] = findBlock(sc, b.block);
    if (!blk.alt) bad('not an alternate');
    sc.blocks = sc.blocks.filter((x) => x.alt?.group !== blk.alt.group);
    landingState(w, blk.alt, 'removed');
    if (blk.alt.source === 'brainstorm') track(w, d, who, 'landed', `set aside the Brainstorm version “${blk.alt.note}” in ${scLabel(d, sc)}`, { scene: sc.id, card: blk.alt.card });
    touched(w, d, sc, who, { quiet: blk.alt.source === 'brainstorm' });
  },

  // ---- the Generator (AI options)
  gen(w, b, who) {
    const { d, sc } = ctxOf(w, b, who, { edit: false });
    const prev = b.from ? w.jobs().find((x) => x.id === b.from && x.type === 'generate') : null;
    // refining an option that is already in the script works on what's there now, and keeps the true original
    const want = prev?.applied?.ids?.length ? prev.applied.ids : b.blocks || [];
    const ids = want.filter((id) => sc.blocks.some((x) => x.id === id));
    if (!ids.length) bad('pick one or more lines first');
    const personality = { key: PERSONALITIES[b.personality] ? b.personality : 'director', custom: str(b.custom, 300) };
    const twist = TWISTS[b.twist] ? b.twist : 'none';
    const twistPicked = twist === 'shuffle' ? ['flip', 'yesand', 'wildcard', 'worst'][Math.floor(Math.random() * 4)] : null;
    const refine = b.refine ? sanitizeBlocks(b.refine) : null;
    for (const j of w.jobs()) if (j.type === 'generate' && j.by === who && j.status === 'pending') { j.status = 'failed'; j.note = 'replaced by a newer request'; }
    for (const j of w.jobs()) if (j.type === 'generate' && j.by === who && !j.dismissed && j !== prev) j.dismissed = true;
    if (prev) prev.dismissed = true;
    const original = prev?.applied ? prev.original : null;
    const j = w.enqueue('generate', who, { draft: d.id, scene: sc.id, blocks: ids, personality, twist, twistPicked, ask: str(b.ask, 400), refine, original, applied: prev?.applied ? { ...prev.applied } : null });
    return { job: j.id };
  },
  // Try an option in place. The panel keeps every option; trying another swaps it in, 'original' puts the lines back.
  'gen/apply'(w, b, who) {
    const j = w.job(b.job);
    if (!j || j.type !== 'generate' || !j.result) bad('no such result');
    const back = b.option === 'original';
    const opt = back ? null : j.result.options[b.option];
    if (!back && !opt) bad('no such option');
    const { d, sc } = ctxOf(w, { draft: j.draft, scene: j.scene }, who);
    const span = (j.applied?.ids || j.blocks).filter((id) => sc.blocks.some((x) => x.id === id));
    if (!span.length) bad('those lines are gone from the script — pick them again');
    if (!j.original) j.original = clone(j.blocks.map((id) => sc.blocks.find((x) => x.id === id)).filter(Boolean));
    const pers = personalityLabel(j.personality);
    const t = TWISTS[j.twistPicked || j.twist] || TWISTS.none;
    const tw = j.twist === 'none' ? '' : `${t.name}${j.twistPicked ? ' (shuffled)' : ''}`;
    const idx = span.map((id) => sc.blocks.findIndex((x) => x.id === id));
    if (b.mode === 'alt') {
      if (back) bad('the original is already there');
      const fresh = opt.blocks.map((x) => makeBlock(x));
      const group = nid('g');
      for (const x of fresh) x.alt = { group, of: span, by: who, personality: pers, twist: tw, note: opt.note };
      sc.blocks.splice(Math.max(...idx) + 1, 0, ...fresh);
      track(w, d, who, 'generator', `kept an option as an alternate in ${scLabel(d, sc)}${opt.note ? ` — ${opt.note}` : ''}`, { scene: sc.id, personality: pers, twist: tw });
      touched(w, d, sc, who, { quiet: true });
      return {};
    }
    const fresh = back ? clone(j.original) : opt.blocks.map((x) => makeBlock(x));
    const ids = new Set(span);
    const at = Math.min(...idx);
    sc.blocks = [...sc.blocks.slice(0, at).filter((x) => !ids.has(x.id)), ...fresh, ...sc.blocks.slice(at).filter((x) => !ids.has(x.id))];
    for (const x of fresh) if (x.type === 'dialogue') w.addCharacter(x.character);
    j.applied = back ? null : { option: b.option, ids: fresh.map((x) => x.id), who, ts: now() };
    j.tried = [...new Set([...(j.tried || []), b.option])];
    // one history line per Generator run, rewritten as you try things
    const text = back ? `tried ${plural(j.tried.length - 1, 'option')} in ${scLabel(d, sc)}, back to the original`
      : `trying option ${b.option + 1} in ${scLabel(d, sc)}${opt.note ? ` — ${opt.note}` : ''}`;
    const e = w.logFind(j.logId);
    if (e) { e.text = text; e.ts = now(); w.logUpdate(e); }
    else j.logId = track(w, d, who, 'generator', text, { scene: sc.id, personality: pers, twist: tw }).id;
    touched(w, d, sc, who, { quiet: true });
    return { ids: j.applied?.ids || [] };
  },
  'gen/done'(w, b, who) {
    const j = w.job(b.job);
    if (!j || j.by !== who) return {};
    j.dismissed = true;
    const e = w.logFind(j.logId);
    if (!e) return {};
    if (!j.applied) { w.logDelete(e.id); return {}; } // back to the original: nothing changed
    const d = w.drafts[j.draft]; const sc = d?.scenes[j.scene]; const opt = j.result?.options[j.applied.option];
    e.text = `kept option ${j.applied.option + 1}${j.tried?.length > 1 ? ` of ${j.result.options.length}` : ''} in ${d && sc ? scLabel(d, sc) : 'a scene'}${opt?.note ? ` — ${opt.note}` : ''}`;
    w.logUpdate(e);
  },
  'gen/clear'(w, b, who) { for (const j of w.jobs()) if (j.type === 'generate' && j.by === who && (j.id === b.job || !b.job)) j.dismissed = true; },

  // ---- shots (Main, locked scenes)
  'shot/add'(w, b, who) { const { d, sc } = ctxOf(w, b, who); mainOnly(d); if (!sc.lock) bad('locked scenes only'); const s = newShot({}, who); const i = sc.shots.findIndex((x) => x.id === b.after); sc.shots.splice(i < 0 ? sc.shots.length : i + 1, 0, s); return { id: s.id }; },
  'shot/update'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who); mainOnly(d);
    const s = sc.shots.find((x) => x.id === b.shot); if (!s) bad('no such shot');
    const p = b.patch || {};
    for (const k of ['framing', 'camera', 'characters', 'location', 'action', 'dialogue', 'refs']) if (p[k] !== undefined) s[k] = str(p[k], 600);
    if (p.duration !== undefined) s.duration = Math.max(0, Math.min(600, Number(p.duration) || 0));
    if (Array.isArray(p.blocks)) s.blocks = p.blocks.filter((id) => sc.blocks.some((x) => x.id === id));
  },
  'shot/approve'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who); mainOnly(d);
    const list = b.all ? sc.shots : sc.shots.filter((x) => x.id === b.shot);
    if (!list.length) bad('no such shot');
    for (const s of list) { s.status = b.yes === false ? 'proposed' : 'approved'; s.approvedBy = who; }
    if (sc.shots.every((s) => s.status === 'approved')) track(w, d, who, 'shots', `finished the shots for ${scLabel(d, sc)} (${plural(sc.shots.length, 'shot')})`, { scene: sc.id });
  },
  'shot/delete'(w, b, who) { const { d, sc } = ctxOf(w, b, who); mainOnly(d); if (Object.values(w.assets()).some((a) => a.shot === b.shot)) bad('this shot has images or sound made from it'); sc.shots = sc.shots.filter((x) => x.id !== b.shot); },
  'shot/move'(w, b, who) {
    const { d, sc } = ctxOf(w, b, who); mainOnly(d);
    const i = sc.shots.findIndex((x) => x.id === b.shot); if (i < 0) bad('no such shot');
    const j = Math.max(0, Math.min(sc.shots.length - 1, i + (b.dir < 0 ? -1 : 1)));
    const [s] = sc.shots.splice(i, 1); sc.shots.splice(j, 0, s);
  },

  // ---- the Facts Ledger: anyone changes it, every change is logged
  'fact/add'(w, b, who) {
    const f = addFact(w, b.fact, { scene: b.scene || null, source: 'team', by: who });
    if (!f) bad('empty, or already in the ledger');
    track(w, w.main(), who, 'fact', `added a fact: “${f.fact}”`, { scene: f.scene });
    return { id: f.id };
  },
  'fact/edit'(w, b, who) {
    const f = w.facts().find((x) => x.id === b.id); if (!f) bad('no such fact');
    const t = cleanFact(b.fact);
    if (!t) bad('empty — remove it instead');
    if (t === f.fact && b.scene === undefined) return { unchanged: true };
    const was = f.fact;
    f.fact = t; f.edited = { by: who, at: now() }; f.doubt = null;
    if (b.scene !== undefined) { const sc = b.scene && w.main().scenes[b.scene]; f.scene = sc ? sc.id : null; f.sceneTitle = sc?.title || ''; }
    const sc = factScene(w, f); f.hash = sc ? sceneHash(sc) : null;
    if (t !== was) track(w, w.main(), who, 'fact', `changed a fact: “${was}” → “${t}”`, { scene: f.scene });
    else track(w, w.main(), who, 'fact', `moved a fact to ${sc ? sc.title : 'no scene'}`, { scene: f.scene });
  },
  'fact/delete'(w, b, who) {
    const f = w.facts().find((x) => x.id === b.id); if (!f) bad('no such fact');
    w.setFacts(w.facts().filter((x) => x !== f));
    track(w, w.main(), who, 'fact', `removed a fact: “${f.fact}”`, { scene: f.scene });
  },
  'fact/confirm'(w, b, who) { // "still true" after its scene changed
    const f = w.facts().find((x) => x.id === b.id); if (!f) bad('no such fact');
    const sc = factScene(w, f); f.hash = sc ? sceneHash(sc) : null; f.doubt = null;
    track(w, w.main(), who, 'fact', `confirmed a fact still holds: “${f.fact}”`, { scene: f.scene });
  },

  // ---- seshes
  'sesh/end'(w, b, who) {
    const { d } = ctxOf(w, b, who, { needScene: false });
    const x = endSesh(w, w.sesh(d.sesh), who, b.title);
    if (!x) bad('no open sesh on this draft');
    return { status: x.status, v: x.v };
  },
  'sesh/title'(w, b) {
    const x = w.sesh(b.sesh); if (!x) bad('no such sesh');
    x.title = str(b.title, 80) || x.title; x.titled = true;
    if (x.v) w.p.run('UPDATE versions SET name = ? WHERE draft = ? AND n = ?', x.title, x.draft, x.v);
  },
  'sesh/review'(w, b, who) {
    const x = w.sesh(b.sesh); if (!x) bad('no such sesh');
    if (x.status === 'open') bad('save the sesh first');
    if (!['approved', 'tagged', 'saved'].includes(b.status)) bad('approved / tagged');
    x.status = b.status; x.reviewedBy = b.status === 'saved' ? null : who; x.reviewedAt = now();
    if (b.status === 'tagged') { x.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t) => str(t, 30).trim()).filter(Boolean).slice(0, 8); x.note = str(b.note, 600); }
    w.log(who, 'review', `${{ approved: 'approved', tagged: 'tagged', saved: 're-opened the review of' }[b.status]} the sesh “${x.title}”${b.status === 'tagged' && x.tags.length ? ` [${x.tags.join(', ')}]` : ''}`, { draft: x.draft, sesh: x.id });
  },
  'sesh/followup'(w, b, who) {
    const x = w.sesh(b.sesh); if (!x) bad('no such sesh');
    const d = w.drafts[x.draft]; if (!d) bad('that draft is gone');
    if (!canEdit(d, who)) bad(`read-only: ${d.name} is ${d.owner}’s`);
    endSesh(w, w.sesh(d.sesh), who);
    const n = openSesh(w, d, who);
    n.title = `Re: ${x.title}`; n.titled = true; n.followsUp = x.id;
    return { id: n.id, draft: d.id };
  },
  'sesh/revert'(w, b, who) { // put the draft back to how it was before a sesh
    const x = w.sesh(b.sesh); if (!x) bad('no such sesh');
    const d = w.drafts[x.draft]; if (!d) bad('that draft is gone');
    if (!canEdit(d, who)) bad(`read-only: ${d.name} is ${d.owner}’s`);
    endSesh(w, w.sesh(d.sesh), who);
    const n = openSesh(w, d, who); n.title = `Undo: ${x.title}`; n.titled = true;
    if (d.isMain) adoptContent(d, x.base, d); else { const c = clone(x.base); d.order = c.order; d.floating = c.floating; d.scenes = c.scenes; }
    track(w, d, who, 'version', `put ${draftLabel(d)} back to before “${x.title}”`);
    for (const sc of Object.values(d.scenes)) touched(w, d, sc, who, { quiet: true });
  },

  // ---- drafts & versions
  'draft/fork'(w, b, who) {
    const src = w.drafts[b.from]; if (!src) bad('no such draft');
    const v = b.v ? w.version(src.id, b.v) : null;
    if (b.v && !v) bad('no such version');
    const d = newDraft({ name: str(b.name, 60) || `${who}’s draft`, owner: who });
    const snap = v ? clone(v.snap) : snapDraft(src);
    d.order = snap.order; d.floating = snap.floating; d.scenes = snap.scenes;
    stripPipeline(d);
    const after = w.lastV(src);
    d.forkedFrom = { draft: src.id, name: src.name, v: v?.n ?? null, after };
    w.drafts[d.id] = d;
    w.saveVersion(d, { auto: true, reason: `made from ${src.name} ${v ? `v${v.n}` : `(now, after v${after})`}`, who });
    w.log(who, 'draft', `made the draft “${d.name}” from ${src.name} ${v ? `v${v.n}` : 'as it is now'}`, { draft: d.id });
    return { id: d.id };
  },
  'draft/new'(w, b, who) { // a fresh draft of your own: an empty page, or a new skeleton from a promoted Idea
    if (!w.mainId) bad('start the script first');
    const idea = b.mode === 'idea' ? promotedCards(w.p).find((c) => c.id === b.card && c.type === 'idea') : null;
    if (b.mode === 'idea' && !idea) bad('that Idea is not promoted in this project');
    const d = newDraft({ name: str(b.name, 60) || `${who}’s draft`, owner: who });
    w.drafts[d.id] = d;
    if (idea) w.enqueue('skeleton', who, { draft: d.id, idea: { title: idea.title, note: idea.note, fields: idea.fields } });
    w.saveVersion(d, { auto: true, reason: idea ? `skeleton from the Idea “${idea.title}”` : 'empty draft', who });
    w.log(who, 'draft', idea ? `made the draft “${d.name}” from the Idea “${idea.title}”` : `made the empty draft “${d.name}”`, { draft: d.id });
    return { id: d.id };
  },
  'draft/rename'(w, b, who) { const { d } = ctxOf(w, b, who, { needScene: false }); if (d.isMain) bad('Main is Main'); d.name = str(b.name, 60) || d.name; },
  'draft/restore'(w, b, who) {
    const { d } = ctxOf(w, b, who, { needScene: false });
    const v = w.version(d.id, b.v); if (!v) bad('no such version');
    endSesh(w, w.sesh(d.sesh), who); // what was there is saved first, so nothing is overwritten
    const n = openSesh(w, d, who); n.title = `Restored v${v.n}`; n.titled = true;
    if (d.isMain) adoptContent(d, v.snap, d); else { const c = clone(v.snap); d.order = c.order; d.floating = c.floating; d.scenes = c.scenes; }
    track(w, d, who, 'version', `restored ${draftLabel(d)} v${v.n}${v.name ? ` “${v.name}”` : ''}`);
    for (const sc of Object.values(d.scenes)) touched(w, d, sc, who, { quiet: true });
  },
  'draft/make-main'(w, b, who) {
    const d = w.drafts[b.draft]; if (!d) bad('no such draft');
    if (d.isMain) bad('already Main');
    promoteToMain(w, d, who);
  },
  'draft/pull'(w, b, who) { // one scene from another draft (or one of its versions) into yours
    const src = w.drafts[b.from]; const dst = w.drafts[b.into];
    if (!src || !dst) bad('no such draft');
    if (!canEdit(dst, who)) bad(`read-only: ${dst.name} is ${dst.owner}’s`);
    const ver = b.v ? w.version(src.id, b.v) : null;
    const sc = (ver ? ver.snap.scenes : src.scenes)[b.scene]; if (!sc) bad('no such scene');
    const cur = dst.scenes[sc.id];
    const from = `${draftLabel(src)}${ver ? ` v${ver.n}` : ''}`;
    if (cur) { cur.title = sc.title; cur.blocks = clone(sc.blocks); track(w, dst, who, 'pull', `pulled “${sc.title}” from ${from} (replaced this draft’s version)`, { scene: sc.id }); touched(w, dst, cur, who, { quiet: true }); }
    else {
      const copy = clone(sc); copy.lock = null; copy.check = null; copy.editCheck = null; copy.shots = [];
      dst.scenes[copy.id] = copy; dst.order.push(copy.id);
      track(w, dst, who, 'pull', `pulled “${sc.title}” from ${from} as sc. ${num(dst, copy.id)}`, { scene: copy.id });
      touched(w, dst, null, who);
    }
  },

  // ---- from Brainstorm (the same project): promoted cards come in by hand for now; step 5 pushes them
  import(w, b, who) {
    const card = promotedCards(w.p).find((c) => c.id === b.card);
    if (!card) bad('that card is not promoted in this project');
    if (w.imported().includes(card.id) && !b.again) bad('already brought in');
    const m = w.main(); if (!m && card.type !== 'character' && card.type !== 'arc') bad('start the script first');
    let landed = null;
    if (card.type === 'scene') {
      const sc = newScene(card.title, sceneCardBlocks(card)); sc.from = `from the brainstorm “${card.topic}”`; sc.fromCard = card.id;
      m.scenes[sc.id] = sc; m.floating.push(sc.id);
      sc.placeSuggestion = { pending: true, at: now() };
      w.enqueue('place', who, { draft: m.id, scene: sc.id });
      track(w, m, who, 'import', `brought “${card.title}” in from Brainstorm (not placed yet)`, { scene: sc.id });
      landed = { section: 'script', as: 'floating', draft: m.id, scene: sc.id, say: 'It’s in the script under “Not placed”.' };
    } else if (card.type === 'dialogue') {
      const target = m.scenes[b.scene]; if (!target) bad('pick the scene the lines go into');
      const lines = parseLines(fieldText(card.fields.exchange) || card.note);
      if (!lines.length) bad('no lines found on that card');
      for (const l of lines) { target.blocks.push(makeBlock(l)); if (l.character) w.addCharacter(l.character); }
      track(w, m, who, 'import', `added ${plural(lines.length, 'line')} from “${card.title}” to ${scLabel(m, target)}`, { scene: target.id });
      touched(w, m, target, who, { quiet: true });
      landed = { section: 'script', as: 'lines', draft: m.id, scene: target.id, say: `Its lines are in ${scLabel(m, target)}.` };
    } else if (card.type === 'character' || card.type === 'arc') {
      return void landCard(w, card, who); // the same landing as a fresh promotion: the character card, or the Arc's facts
    } else if (card.type === 'idea') {
      if (!b.logline) bad('an Idea starts a script, or lends its logline');
      w.p.run('UPDATE project SET logline = ?', str(fieldText(card.fields.logline), 300) || w.p.info().logline);
      landed = { section: 'bible', what: 'logline', say: 'Its logline is the project’s logline.' };
    }
    w.markImported(card.id);
    if (landed) w.p.run('UPDATE promotions SET landed_json = ? WHERE card = ?', J({ ...landed, at: now(), by: who }), card.id);
  },
};

// mock downstream assets: no screen makes them now (images, video and sound get their own sections); the server keeps
// the guard on shot/delete and the count in promo so nothing made later goes silently stale.
A['asset/add'] = (w, b, who) => {
  const m = w.main();
  const sc = m.scenes[b.scene]; const shot = sc?.shots.find((x) => x.id === b.shot);
  if (!shot) bad('no such shot in Main');
  if (shot.status !== 'approved') bad('mark the shot final first');
  const kind = ['image', 'video', 'audio'].includes(b.kind) ? b.kind : 'image';
  const assets = w.assets();
  const v = 1 + Object.values(assets).filter((a) => a.shot === shot.id && a.kind === kind).length;
  const a = { id: nid('a'), kind, scene: sc.id, shot: shot.id, v, madeFromScene: w.keepSnap(sc), madeFromShot: shotHash(sc, shot), madeAs: shotNum(m, sc, shot), createdAt: now(), by: who, status: 'ok', history: [] };
  assets[a.id] = a;
  return { id: a.id };
};

export function action(p, name, b, who) {
  if (name === 'presence') { // where you are: not stored, just pushed
    const m = presenceOf(p.id);
    if (b.scene || b.block) m[who] = { draft: b.draft, scene: b.scene, block: b.block, ts: now() }; else delete m[who];
    p.touch();
    return { ok: true };
  }
  const fn = A[name];
  if (!fn) throw err('nothing here', 404);
  const out = { ok: true, ...(run(p, (w) => fn(w, b, who)) || {}) };
  changeHook(p, who);
  return out;
}

// ---------------------------------------------------------------- reads
export function version(p, draftId, v) {
  const w = new Work(p);
  const d = w.drafts[draftId];
  if (!d) throw err('no such draft', 404);
  const x = v ? w.version(d.id, v) : null;
  if (!x) return { draft: d.id, name: draftLabel(d), v: null, snap: snapDraft(d) }; // "now"
  return { draft: d.id, name: draftLabel(d), v: x.n, label: x.name || x.reason, snap: x.snap };
}
export const snap = (p, h) => ({ blocks: P(p.one('SELECT blocks_json FROM snaps WHERE hash = ?', h)?.blocks_json) });
export function seshDetail(p, id) {
  const w = new Work(p);
  const x = w.sesh(id);
  if (!x) throw err('no such sesh', 404);
  const d = w.drafts[x.draft];
  const after = x.v ? w.version(x.draft, x.v)?.snap : x.status === 'open' && d ? snapDraft(d) : null;
  const events = p.all("SELECT * FROM events WHERE section = 'script' AND json_extract(ref_json, '$.sesh') = ? ORDER BY ts", id).map(eventObj);
  const { base, ...meta } = x;
  return { sesh: meta, events, before: base, after, draftName: d ? draftLabel(d) : '?' };
}
export function promo(p, draftId) {
  const w = new Work(p);
  const d = w.drafts[draftId];
  if (!d) throw err('no such draft', 404);
  return promoSummary(w, d);
}

// ---------------------------------------------------------------- what a tab sees
function decorate(d, versions) {
  const scenes = {};
  for (const [id, sc] of Object.entries(d.scenes)) {
    scenes[id] = { ...sc, _hash: sceneHash(sc), _status: statusOf(d, sc), _num: num(d, id), shots: sc.shots.map((s) => ({ ...s, _hash: shotHash(sc, s), _num: shotNum(d, sc, s) })) };
  }
  return { ...d, scenes, versions };
}
export function publicState(p, { online = [] } = {}) {
  const w = new Work(p);
  const info = p.info();
  const versions = {};
  for (const r of p.all('SELECT draft, n, name, auto, reason, by, ts, sesh FROM versions ORDER BY draft, n')) (versions[r.draft] ||= []).push({ n: r.n, name: r.name || '', auto: !!r.auto, reason: r.reason || '', by: r.by, ts: r.ts, sesh: r.sesh });
  const drafts = {};
  for (const [id, d] of Object.entries(w.drafts)) drafts[id] = decorate(d, versions[id] || []);
  const imported = w.imported();
  return {
    started: !!w.mainId,
    project: { title: info.name, logline: info.logline, notes: info.notes, characters: w.characters(), members: p.people().map((x) => x.name) },
    settings: { staleBy: w.staleBy() }, mainId: w.mainId, drafts,
    seshes: Object.fromEntries(p.all("SELECT * FROM seshes WHERE status != 'empty'").map((r) => [r.id, seshObj(r, false)])),
    characterCards: p.all('SELECT name, role, look, personality, arc, voice_notes, from_card FROM characters ORDER BY added_at, rowid'),
    sessions: p.all('SELECT id, type, topic, status, created_at, origin_json FROM sessions WHERE origin_json IS NOT NULL ORDER BY created_at').map((r) => ({ id: r.id, type: r.type, topic: r.topic, status: r.status, createdAt: r.created_at, origin: P(r.origin_json) })).filter((x) => x.origin?.section === 'script'),
    facts: w.facts(), exceptions: scriptExceptions(p),
    log: p.all("SELECT * FROM events WHERE section = 'script' ORDER BY ts DESC LIMIT 200").reverse().map(eventObj),
    jobs: p.all("SELECT * FROM jobs WHERE section = 'script' ORDER BY ts DESC, rowid DESC LIMIT 80").reverse().map(jobObj).map(({ result, ...j }) => ({ ...j, result: j.type === 'generate' ? result : result ? true : null })),
    brainstorm: promotedCards(p).map((c) => ({ ...c, imported: imported.includes(c.id), send: sendLabel(p, c) })),
    presence: presenceOf(p.id), online,
    pendingJobs: p.one("SELECT count(*) AS n FROM jobs WHERE section = 'script' AND status = 'pending'").n,
    botOnline: botOnline(),
  };
}
