// π · Projects — the store.
//
// A project is a folder. Inside it, one SQLite file (pi.db) holds everything the sections share:
// people, the brainstorm (sessions, messages, cards, promotions), the script (drafts, scenes, blocks,
// shots, versions, seshes), the Bible (facts, characters, exceptions), the bot queue (jobs) and the
// history (events). Nothing crosses between projects: to work in one you open its file.
//
//   data/projects/<id>/pi.db        the database (think: one spreadsheet file, one tab per table)
//   data/projects/<id>/files/       what isn't a row: reference images, voice samples, clips (files/refs/<ref>/…)
//
// SQLite is built into Node 22 (node:sqlite), so there is nothing to install or run.
// Rows that are naturally nested (a card's fields, a message's picks, a version's snapshot) are kept
// as JSON text in one column; everything that gets looked up or joined is a real column.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export let PROJECTS_DIR = process.env.PI_PROJECTS_DIR || path.join(ROOT, 'data', 'projects');
export const setProjectsDir = (dir) => { PROJECTS_DIR = path.resolve(dir); };
export const DB_FILE = 'pi.db';
const SCHEMA_VERSION = 5;

// references (v5): characters, props and locations that must look and sound the same across shots
const REFS_SCHEMA = `
CREATE TABLE IF NOT EXISTS refs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, keys_json TEXT NOT NULL DEFAULT '[]',
  owner TEXT, source TEXT NOT NULL DEFAULT 'hand', source_info_json TEXT, line TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL DEFAULT '{}', ai_json TEXT NOT NULL DEFAULT '[]',
  voice_json TEXT NOT NULL DEFAULT '{}', voice_ai_json TEXT NOT NULL DEFAULT '[]', motion TEXT NOT NULL DEFAULT '',
  voice_only INTEGER NOT NULL DEFAULT 0, regulars_json TEXT NOT NULL DEFAULT '[]', check_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER, deleted_at INTEGER);
-- the named things inside a reference: expressions, outfits, states, a location's areas, elements, textures, lights
CREATE TABLE IF NOT EXISTS ref_parts (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL REFERENCES refs(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
  by TEXT, pos INTEGER NOT NULL DEFAULT 0, main INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ref_parts_ref ON ref_parts(ref, kind, pos);
-- lasting changes; every reference has a Default variant (start_scene NULL)
CREATE TABLE IF NOT EXISTS ref_variants (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL REFERENCES refs(id) ON DELETE CASCADE, name TEXT NOT NULL,
  start_scene TEXT, delta TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 0,
  origin_json TEXT, approved_by TEXT, approved_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ref_versions (
  variant TEXT NOT NULL REFERENCES ref_variants(id) ON DELETE CASCADE, n INTEGER NOT NULL, ref TEXT NOT NULL,
  snap_json TEXT NOT NULL, by TEXT, ts INTEGER NOT NULL, note TEXT, PRIMARY KEY (variant, n));
CREATE TABLE IF NOT EXISTS ref_images (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL REFERENCES refs(id) ON DELETE CASCADE, variant TEXT NOT NULL,
  slot TEXT NOT NULL, file TEXT NOT NULL, prompt TEXT, provider TEXT, batch TEXT, opt INTEGER, picked INTEGER NOT NULL DEFAULT 0,
  by TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ref_images_slot ON ref_images(ref, variant, slot, ts);
-- a character's voice sample and motion clip (current = the one shown)
CREATE TABLE IF NOT EXISTS ref_media (
  id TEXT PRIMARY KEY, ref TEXT NOT NULL REFERENCES refs(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  file TEXT NOT NULL, dur REAL, peaks_json TEXT, made_from TEXT, provider TEXT, by TEXT, ts INTEGER NOT NULL);
-- a shot's link to a reference: props added by hand, a variant picked by hand, the version a shot was made with
CREATE TABLE IF NOT EXISTS shot_refs (
  draft TEXT NOT NULL, scene TEXT NOT NULL, shot TEXT NOT NULL, ref TEXT NOT NULL, how TEXT NOT NULL DEFAULT 'auto',
  variant TEXT, made_version INTEGER, pinned_version INTEGER, by TEXT, ts INTEGER NOT NULL,
  PRIMARY KEY (draft, shot, ref));
`;

// ---------------------------------------------------------------- schema
// One statement per table. `*_json` columns hold JSON text; everything else is a plain value.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT,
  from_idea TEXT, logline TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  color TEXT, settings_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS people (
  name TEXT PRIMARY KEY, seat TEXT, light TEXT, joined_at INTEGER);

-- brainstorm
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, topic TEXT NOT NULL, seed TEXT,
  status TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'play',
  voice_json TEXT NOT NULL DEFAULT '{}', participants_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, closed_at INTEGER,
  origin_json TEXT, recap TEXT, flow_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL, author TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  picks_json TEXT NOT NULL DEFAULT '[]', round TEXT, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session, ts);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent TEXT, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', fields_json TEXT NOT NULL DEFAULT '{}',
  author TEXT NOT NULL, sparked_by TEXT, status TEXT NOT NULL DEFAULT 'active',
  alternate INTEGER NOT NULL DEFAULT 0, reactions_json TEXT NOT NULL DEFAULT '{}',
  ts INTEGER NOT NULL, promoted_to TEXT, promoted_at INTEGER);
CREATE INDEX IF NOT EXISTS cards_session ON cards(session);
CREATE INDEX IF NOT EXISTS cards_status ON cards(status);
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY, card TEXT NOT NULL REFERENCES cards(id), session TEXT NOT NULL,
  target TEXT NOT NULL, approved_by_json TEXT NOT NULL DEFAULT '[]', ts INTEGER NOT NULL,
  landed_json TEXT);

-- script
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, is_main INTEGER NOT NULL DEFAULT 0,
  forked_from_json TEXT, created_at INTEGER NOT NULL, edited_at INTEGER, sesh TEXT,
  order_json TEXT NOT NULL DEFAULT '[]', floating_json TEXT NOT NULL DEFAULT '[]', former_name TEXT);
-- a forked draft keeps its scenes' ids (so a scene can be pulled across drafts), so scenes, blocks
-- and shots are keyed by draft as well as by id
CREATE TABLE IF NOT EXISTS scenes (
  draft TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE, id TEXT NOT NULL,
  title TEXT NOT NULL, from_card TEXT, from_label TEXT,
  lock_json TEXT, check_json TEXT, edit_check_json TEXT, pacing_json TEXT, place_json TEXT,
  PRIMARY KEY (draft, id));
CREATE TABLE IF NOT EXISTS blocks (
  draft TEXT NOT NULL, scene TEXT NOT NULL, id TEXT NOT NULL,
  pos INTEGER NOT NULL, type TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (draft, scene, id),
  FOREIGN KEY (draft, scene) REFERENCES scenes(draft, id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS blocks_scene ON blocks(draft, scene, pos);
CREATE TABLE IF NOT EXISTS shots (
  draft TEXT NOT NULL, scene TEXT NOT NULL, id TEXT NOT NULL, pos INTEGER NOT NULL,
  framing TEXT, camera TEXT, characters TEXT, location TEXT, action TEXT, dialogue TEXT,
  duration REAL, refs TEXT, blocks_json TEXT NOT NULL DEFAULT '[]', status TEXT, by TEXT, approved_by TEXT,
  PRIMARY KEY (draft, scene, id),
  FOREIGN KEY (draft, scene) REFERENCES scenes(draft, id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS versions (
  draft TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE, n INTEGER NOT NULL,
  name TEXT, auto INTEGER NOT NULL DEFAULT 0, reason TEXT, by TEXT, ts INTEGER NOT NULL,
  snap_json TEXT NOT NULL, sesh TEXT, PRIMARY KEY (draft, n));
CREATE TABLE IF NOT EXISTS snaps (hash TEXT PRIMARY KEY, blocks_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seshes (
  id TEXT PRIMARY KEY, draft TEXT NOT NULL, title TEXT NOT NULL, titled INTEGER NOT NULL DEFAULT 0,
  by TEXT, people_json TEXT NOT NULL DEFAULT '[]', started_at INTEGER NOT NULL, last_at INTEGER,
  ended_at INTEGER, status TEXT NOT NULL, changes INTEGER NOT NULL DEFAULT 0,
  base_json TEXT, base_v INTEGER, v INTEGER, tags_json TEXT NOT NULL DEFAULT '[]', note TEXT,
  reviewed_by TEXT, reviewed_at INTEGER, follows_up TEXT, ended_by TEXT);

-- the Bible
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, fact TEXT NOT NULL, scene TEXT, scene_title TEXT, source TEXT, by TEXT,
  at INTEGER NOT NULL, hash TEXT, edited_json TEXT, doubt TEXT, from_card TEXT);
CREATE TABLE IF NOT EXISTS characters (
  name TEXT PRIMARY KEY, role TEXT, look TEXT, personality TEXT, arc TEXT, voice_notes TEXT,
  from_card TEXT, added_at INTEGER);
CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY, section TEXT NOT NULL, ref_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL, reason TEXT NOT NULL, who TEXT, ts INTEGER NOT NULL);

-- shared
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, section TEXT NOT NULL, type TEXT NOT NULL, by TEXT, ts INTEGER NOT NULL,
  status TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', result_json TEXT,
  delivered_at INTEGER, done_at INTEGER);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, ts);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, who TEXT, section TEXT NOT NULL, kind TEXT NOT NULL,
  text TEXT NOT NULL, ref_json TEXT);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
` + REFS_SCHEMA;

// ---------------------------------------------------------------- helpers
export const J = (v) => JSON.stringify(v ?? null);
export const P = (s, fallback = null) => { if (s == null) return fallback; try { return JSON.parse(s); } catch { return fallback; } };
export const now = () => Date.now();
export const nid = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const slug = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

const dirOf = (id) => path.join(PROJECTS_DIR, id);
const fileOf = (id) => path.join(dirOf(id), DB_FILE);
const safeId = (id) => /^[a-z0-9؀-ۿ][a-z0-9؀-ۿ-]{0,60}$/.test(id);

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v < 1) db.exec(SCHEMA);
  if (v >= 1 && v < 2) { try { db.exec('ALTER TABLE project ADD COLUMN color TEXT'); } catch {} } // v2: a colour on the project
  if (v >= 1 && v < 3) for (const sql of ['ALTER TABLE drafts ADD COLUMN former_name TEXT', 'ALTER TABLE versions ADD COLUMN sesh TEXT']) { try { db.exec(sql); } catch {} } // v3: Script moved in
  if (v >= 1 && v < 4) { try { db.exec('ALTER TABLE facts ADD COLUMN from_card TEXT'); } catch {} } // v4: an Arc's facts remember their card
  if (v >= 1 && v < 5) db.exec(REFS_SCHEMA); // v5: References
  if (v < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

// one open handle per project per process
const open = new Map();

export class Project {
  constructor(id, db) { this.id = id; this.db = db; this.dir = dirOf(id); this.listeners = new Set(); this.touchTimer = null; this.rev = 0; }

  // --- tiny query helpers: one(sql, ...params) → row | undefined; all(...) → rows; run(...) → info (and a touch)
  one(sql, ...p) { return this.db.prepare(sql).get(...p); }
  all(sql, ...p) { return this.db.prepare(sql).all(...p); }
  run(sql, ...p) { const r = this.db.prepare(sql).run(...p); this.touch(); return r; }
  tx(fn) { this.db.exec('BEGIN'); try { const r = fn(); this.db.exec('COMMIT'); this.touch(); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }

  // --- whoever is looking at this project hears about every change (debounced to one tick)
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  touch() {
    this.rev++;
    clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => { for (const fn of this.listeners) { try { fn(this); } catch {} } }, 40);
  }

  // --- a row's JSON columns, parsed: row({ fields_json: '{}' }) → { fields: {} }
  static row(r) {
    if (!r) return r;
    const out = {};
    for (const [k, v] of Object.entries(r)) { if (k.endsWith('_json')) out[k.slice(0, -5)] = P(v); else out[k] = v; }
    return out;
  }

  info() { return Project.row(this.one('SELECT * FROM project')); }
  update({ name, logline, color } = {}, who = null) {
    const cur = this.info();
    const next = {
      name: name !== undefined ? String(name).trim().slice(0, 80) || cur.name : cur.name,
      logline: logline !== undefined ? String(logline).trim().slice(0, 300) : cur.logline,
      color: color !== undefined ? (/^#[0-9a-f]{6}$/i.test(String(color)) ? String(color).toLowerCase() : null) : cur.color,
    };
    this.run('UPDATE project SET name = ?, logline = ?, color = ?', next.name, next.logline, next.color);
    const what = [name !== undefined && next.name !== cur.name && `renamed it “${next.name}”`, logline !== undefined && next.logline !== cur.logline && 'changed the logline', color !== undefined && next.color !== cur.color && 'changed the colour'].filter(Boolean);
    if (what.length) this.log('project', 'edited', what.join(', '), who);
    return next;
  }

  // how far each section of the pipeline has come, 0..1 (the pie on the project's mark)
  progress() {
    const sessions = this.one('SELECT count(*) AS n FROM sessions').n;
    const cards = this.one("SELECT count(*) AS n FROM cards WHERE status != 'discarded'").n;
    const promoted = this.one("SELECT count(*) AS n FROM cards WHERE status = 'promoted'").n;
    const brainstorm = promoted ? 1 : cards >= 8 ? 0.6 : sessions ? 0.3 : 0;
    const main = this.one('SELECT id, order_json FROM drafts WHERE is_main = 1');
    let script = 0;
    if (main) {
      const order = P(main.order_json, []);
      if (order.length) {
        const locked = this.all('SELECT id, lock_json FROM scenes WHERE draft = ?', main.id).filter((x) => x.lock_json && order.includes(x.id)).length;
        script = 0.4 + 0.6 * (locked / order.length);
      }
    }
    const refs = this.all("SELECT r.id, r.source, (SELECT status FROM ref_variants v WHERE v.ref = r.id AND v.start_scene IS NULL) AS status FROM refs r WHERE r.deleted_at IS NULL");
    const references = refs.length ? 0.2 + 0.8 * (refs.filter((r) => r.status === 'approved').length / refs.length) : 0;
    const voices = this.one("SELECT count(DISTINCT ref) AS n FROM ref_media WHERE kind = 'voice'").n;
    const chars = refs.length ? this.one("SELECT count(*) AS n FROM refs WHERE kind = 'character' AND deleted_at IS NULL").n : 0;
    const production = chars ? 0.15 * Math.min(1, voices / chars) : 0; // frames, video and the cut come later
    return { brainstorm: +brainstorm.toFixed(2), references: +references.toFixed(2), script: +script.toFixed(2), production: +production.toFixed(2) };
  }
  people() { return this.all('SELECT * FROM people ORDER BY joined_at'); }
  addPerson(name, seat = null, light = null) {
    this.run('INSERT INTO people(name, seat, light, joined_at) VALUES (?,?,?,?) ON CONFLICT(name) DO UPDATE SET seat = COALESCE(excluded.seat, seat), light = COALESCE(excluded.light, light)', name, seat, light, now());
  }
  log(section, kind, text, who = null, ref = null) {
    this.run('INSERT INTO events(id, ts, who, section, kind, text, ref_json) VALUES (?,?,?,?,?,?,?)', nid('ev'), now(), who, section, kind, text, ref ? J(ref) : null);
  }
  kvGet(key, fallback = null) { const r = this.one('SELECT value_json FROM kv WHERE key = ?', key); return r ? P(r.value_json, fallback) : fallback; }
  kvSet(key, value) { this.run('INSERT INTO kv(key, value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json', key, J(value)); }

  counts() {
    const out = {};
    for (const t of TABLES) out[t] = this.one(`SELECT count(*) AS n FROM ${t}`).n;
    return out;
  }

  // what the Projects page shows for this project
  pulse() {
    const live = this.all("SELECT id, type, topic, stage, phase, participants_json, flow_json FROM sessions WHERE status = 'live'");
    const lobbies = this.one("SELECT count(*) AS n FROM sessions WHERE status = 'lobby'").n;
    const openSeshes = this.all("SELECT id, draft, title, people_json, changes FROM seshes WHERE status = 'open'");
    const pending = this.one("SELECT count(*) AS n FROM jobs WHERE status IN ('pending','delivered')").n;
    const last = this.one('SELECT ts, who, section, text FROM events ORDER BY ts DESC LIMIT 1');
    return {
      progress: this.progress(),
      liveSessions: live.map(Project.row).map((s) => ({ id: s.id, type: s.type, topic: s.topic, stage: s.stage, phase: s.phase, participants: s.participants, roundOpen: !!s.flow?.round })),
      lobbies,
      openSeshes: openSeshes.map(Project.row),
      pendingJobs: pending,
      lastEvent: last || null,
    };
  }

  // the landing page of a project: what's live, the script's shape, what's promoted, the Bible, the last events
  overview() {
    const info = this.info();
    const sessions = this.all("SELECT s.*, (SELECT count(*) FROM cards c WHERE c.session = s.id AND c.status != 'discarded') AS n_cards FROM sessions s WHERE s.status != 'closed' ORDER BY s.created_at DESC").map(Project.row);
    const closed = this.one("SELECT count(*) AS n FROM sessions WHERE status = 'closed'").n;
    const main = Project.row(this.one('SELECT * FROM drafts WHERE is_main = 1'));
    const scenes = main ? this.all('SELECT id, title, lock_json, (SELECT count(*) FROM blocks b WHERE b.draft = sc.draft AND b.scene = sc.id) AS n_blocks, (SELECT count(*) FROM shots sh WHERE sh.draft = sc.draft AND sh.scene = sc.id) AS n_shots FROM scenes sc WHERE draft = ?', main.id).map(Project.row) : [];
    const order = main ? [...main.order, ...main.floating] : [];
    scenes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const promoted = this.all("SELECT c.id, c.title, c.note, c.promoted_to, c.promoted_at, c.sparked_by, c.session, s.topic, s.type, (SELECT landed_json FROM promotions pr WHERE pr.card = c.id ORDER BY pr.ts DESC LIMIT 1) AS landed_json FROM cards c JOIN sessions s ON s.id = c.session WHERE c.status = 'promoted' ORDER BY c.promoted_at DESC").map(Project.row);
    return {
      project: info,
      people: this.people(),
      pulse: this.pulse(),
      sessions: sessions.map((s) => ({ id: s.id, type: s.type, topic: s.topic, status: s.status, stage: s.stage, phase: s.phase, participants: s.participants, cards: s.n_cards, roundOpen: !!s.flow?.round, createdAt: s.created_at })),
      closedSessions: closed,
      script: main ? { draft: main.id, drafts: this.one('SELECT count(*) AS n FROM drafts').n, versions: this.one('SELECT count(*) AS n FROM versions WHERE draft = ?', main.id).n, openSeshes: this.all("SELECT id, title, people_json, changes, started_at FROM seshes WHERE status = 'open'").map(Project.row), scenes: scenes.map((sc) => ({ id: sc.id, title: sc.title, locked: !!sc.lock, blocks: sc.n_blocks, shots: sc.n_shots, placed: main.order.includes(sc.id) })) } : null,
      promoted,
      references: Object.fromEntries(['character', 'prop', 'location'].map((k) => [k, this.all("SELECT r.id, r.name, (SELECT status FROM ref_variants v WHERE v.ref = r.id AND v.start_scene IS NULL) AS status FROM refs r WHERE r.kind = ? AND r.deleted_at IS NULL ORDER BY r.created_at", k)])),
      bible: { facts: this.one('SELECT count(*) AS n FROM facts').n, characters: this.all('SELECT name FROM characters ORDER BY name').map((c) => c.name), exceptions: this.one('SELECT count(*) AS n FROM exceptions').n },
      events: this.all('SELECT ts, who, section, kind, text FROM events ORDER BY ts DESC LIMIT 12'),
      rev: this.rev,
    };
  }

  // everything, as one JSON object (backups, Abdallah's repo, moving a project by hand)
  export() {
    const out = { exportedAt: now(), project: this.info() };
    for (const t of TABLES) if (t !== 'project') out[t] = this.all(`SELECT * FROM ${t}`).map(Project.row);
    return out;
  }

  close() { this.db.close(); open.delete(this.id); }
}

export const TABLES = ['project', 'people', 'sessions', 'messages', 'cards', 'promotions', 'drafts', 'scenes', 'blocks', 'shots', 'versions', 'snaps', 'seshes', 'facts', 'characters', 'exceptions', 'jobs', 'events', 'kv', 'refs', 'ref_parts', 'ref_variants', 'ref_versions', 'ref_images', 'ref_media', 'shot_refs'];

// ---------------------------------------------------------------- the folder of projects
export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d.name, DB_FILE)))
    .map((d) => { const p = openProject(d.name); const info = p.info(); return { ...info, people: p.people().map((x) => x.name), pulse: p.pulse() }; })
    .sort((a, b) => (b.pulse.lastEvent?.ts || b.created_at) - (a.pulse.lastEvent?.ts || a.created_at));
}

export function openProject(id) {
  if (!safeId(id)) throw new Error(`bad project id: ${id}`);
  if (open.has(id)) return open.get(id);
  const file = fileOf(id);
  if (!fs.existsSync(file)) throw new Error(`no project "${id}" in ${PROJECTS_DIR}`);
  const p = new Project(id, openDb(file));
  open.set(id, p);
  return p;
}

export function createProject({ name, by = null, fromIdea = null, id = null } = {}) {
  if (!name || !String(name).trim()) throw new Error('a project needs a name');
  let pid = id || slug(name);
  if (fs.existsSync(dirOf(pid))) { let n = 2; while (fs.existsSync(dirOf(`${pid}-${n}`))) n++; pid = `${pid}-${n}`; }
  fs.mkdirSync(path.join(dirOf(pid), 'files'), { recursive: true });
  const p = new Project(pid, openDb(fileOf(pid)));
  open.set(pid, p);
  p.run('INSERT INTO project(id, name, created_at, created_by, from_idea) VALUES (?,?,?,?,?)', pid, String(name).trim(), now(), by, fromIdea);
  if (by) p.addPerson(by);
  p.log('project', 'created', 'created the project', by);
  return p;
}

// the app deletes by moving the folder to data/trash/<id>-<time>; `forever` removes it for good (the CLI)
export function deleteProject(id, { forever = false } = {}) {
  if (!safeId(id)) throw new Error(`bad project id: ${id}`);
  const p = open.get(id);
  if (p) { clearTimeout(p.touchTimer); p.listeners.clear(); p.close(); }
  if (!fs.existsSync(dirOf(id))) return null;
  if (forever) { fs.rmSync(dirOf(id), { recursive: true, force: true }); return null; }
  const trash = path.join(path.dirname(PROJECTS_DIR), 'trash');
  fs.mkdirSync(trash, { recursive: true });
  const to = path.join(trash, `${id}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  fs.renameSync(dirOf(id), to);
  return to;
}
