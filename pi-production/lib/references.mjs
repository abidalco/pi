// References — the section (Abdallah's spec, production-system/03-references.md; plan: REFERENCES-PLAN.md).
// The source of truth for how things look and sound: characters, props and locations that must stay the same
// across shots. Characters and locations come from the script on their own (speakers, scene headings); props are
// added by hand. Each card has a Default variant plus lasting changes (a scar from sc. 5 on), images made front
// first (the rest from the picked one), versions, and links to the shots that use it.
//
// Everything lives in the project's file (refs, ref_parts, ref_variants, ref_versions, ref_images, ref_media,
// shot_refs) and its folder (files/refs/<ref>/…). Nothing here waits for approval: generating, picking, editing
// apply at once and are logged. The owner's Approve only locks a version; shots can use a card before that.
import fs from 'node:fs';
import path from 'node:path';
import { Project, J, P, now, nid, openProject, listProjects } from './projects.mjs';
import * as ART from './refart.mjs';
import * as MEDIA from './media.mjs';

export const FIELDS = {
  character: [['age', 'Age'], ['build', 'Build'], ['face', 'Face'], ['hair', 'Hair'], ['marks', 'Marks'], ['more', 'Anything else']],
  prop: [['what', 'What it is'], ['material', 'Material'], ['color', 'Colour'], ['details', 'Details']],
  location: [['what', 'What it is'], ['mood', 'Mood'], ['era', 'Era'], ['details', 'Key details']],
};
export const VOICE = [['age', 'Age / gender feel'], ['pitch', 'Pitch / tone'], ['accent', 'Accent'], ['pace', 'Pace / rhythm'], ['range', 'Emotional range'], ['sample', 'Sample line']];
const FIRST = { character: 'front', prop: 'front', location: 'layout' };
const SHEET = { character: ['side', 'back'], prop: ['side', 'back', 'top', 'scale'], location: [] };
const PARTS = { character: ['expression', 'outfit'], prop: ['state'], location: ['area', 'element', 'texture', 'light'] };
const DRAWN = new Set(['light']); // drawn in the browser from their colour; no image to make
const DEFAULT_EXPRESSIONS = ['Neutral', 'Happy', 'Angry', 'Sad', 'Scared', 'Surprised'];
export const CONFIG = { fields: FIELDS, voice: VOICE, first: FIRST, sheet: SHEET, parts: PARTS };

const err = (msg, code = 400) => Object.assign(new Error(msg), { code });
const bad = (m) => { throw err(m); };
const str = (v, n = 2000) => String(v ?? '').slice(0, n);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const row = Project.row;

let deliverHook = () => {};
export const onEnqueue = (fn) => { deliverHook = fn; };

// ---------------------------------------------------------------- names in the script
const TIME = /^(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|SUNSET|SUNRISE|LATER|CONTINUOUS|MOMENTS LATER|SAME TIME|NOON|MIDNIGHT|LATE NIGHT|EARLY MORNING|THE NEXT DAY|NEXT DAY)$/;
const HEARD = /\b(V\.?\s?O|O\.?\s?S|O\.?\s?C|RADIO|PHONE|INTERCOM|OFF|VOICE|FILTERED|ON SPEAKER)\b/i;
const NOT_PEOPLE = new Set(['ALL', 'BOTH', 'EVERYONE', 'TOGETHER', 'CROWD', 'VOICES']);
export const charKey = (n) => {
  const k = String(n || '').toUpperCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[^\p{L}\p{N}'’ .-]/gu, '').replace(/\s+/g, ' ').trim();
  return k && k.length <= 40 && !NOT_PEOPLE.has(k) ? k : '';
};
export const display = (key) => String(key).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/['’]S\b/g, '’s').replace(/'/g, '’');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parseHeading(d) {
  const parts = String(d.location || '').toUpperCase().split(/\s+[-–—]\s+|\s*\/\s*/).map((x) => x.trim()).filter(Boolean);
  while (parts.length > 1 && TIME.test(parts.at(-1))) parts.pop();
  if (!parts.length || TIME.test(parts[0])) return null;
  return { place: parts[0].slice(0, 60), area: parts[1] ? parts.slice(1).join(' – ').slice(0, 60) : null, intExt: d.intExt || '' };
}
const splitNames = (s) => String(s || '').split(/[,;&/+]|\band\b/i).map(charKey).filter(Boolean);

// Main as the references see it: scenes in order, who speaks where, which places and areas the headings name
function scriptMap(p) {
  const main = p.one('SELECT id, order_json FROM drafts WHERE is_main = 1');
  const out = { mainId: main?.id || null, order: main ? P(main.order_json, []) : [], scenes: {}, chars: new Map(), places: new Map() };
  const note = (map, key, init) => { if (!map.has(key)) map.set(key, init()); return map.get(key); };
  for (const r of p.all('SELECT name FROM characters')) { const k = charKey(r.name); if (k) note(out.chars, k, () => ({ display: display(k), scenes: new Set(), heard: 0, seen: 0 })); }
  if (!main) return out;
  const titles = Object.fromEntries(p.all('SELECT id, title FROM scenes WHERE draft = ?', main.id).map((r) => [r.id, r.title]));
  for (const b of p.all('SELECT scene, type, data_json FROM blocks WHERE draft = ? ORDER BY scene, pos', main.id)) {
    const d = P(b.data_json, {});
    if (d.alt) continue;
    const i = out.order.indexOf(b.scene);
    const sc = (out.scenes[b.scene] ||= { id: b.scene, num: i >= 0 ? i + 1 : null, title: titles[b.scene] || '', place: null, area: null, intExt: '', text: [], speakers: new Set() });
    if (b.type === 'heading' && !sc.place) {
      const h = parseHeading(d);
      if (h) {
        Object.assign(sc, { place: h.place, area: h.area, intExt: h.intExt });
        const pl = note(out.places, h.place, () => ({ display: display(h.place), scenes: new Set(), areas: new Map(), intExt: h.intExt }));
        pl.scenes.add(b.scene);
        if (h.area) note(pl.areas, h.area, () => ({ display: display(h.area), scenes: new Set() })).scenes.add(b.scene);
      }
    }
    if (b.type === 'dialogue' && d.character) {
      const k = charKey(d.character);
      if (k) { const c = note(out.chars, k, () => ({ display: display(k), scenes: new Set(), heard: 0, seen: 0 })); c.scenes.add(b.scene); sc.speakers.add(k); if (HEARD.test(`${d.character} ${d.paren || ''}`)) c.heard++; else c.seen++; }
    }
    if (b.type === 'action' && d.text) sc.text.push(String(d.text));
  }
  // a character named in an action line is in that scene (and seen, even if they only speak off screen)
  for (const [k, c] of out.chars) {
    const re = new RegExp(`(^|[^\\p{L}])${reEsc(k)}([^\\p{L}]|$)`, 'u');
    for (const sc of Object.values(out.scenes)) if (sc.text.some((t) => re.test(t.toUpperCase()))) { c.seen++; c.scenes.add(sc.id); sc.speakers.add(k); }
  }
  return out;
}
const placedNums = (m, ids) => [...ids].map((id) => m.scenes[id]?.num).filter((n) => n != null).sort((a, b) => a - b);
const scList = (nums) => (nums.length ? `sc. ${nums.join(', ')}` : '');

// ---------------------------------------------------------------- rows
const refById = (p, id) => row(p.one('SELECT * FROM refs WHERE id = ?', id));
const variantsOf = (p, rid) => p.all('SELECT * FROM ref_variants WHERE ref = ? ORDER BY start_scene IS NOT NULL, created_at, rowid', rid).map(row);
const defaultOf = (p, rid) => row(p.one('SELECT * FROM ref_variants WHERE ref = ? AND start_scene IS NULL', rid));
const partsOf = (p, rid) => p.all('SELECT * FROM ref_parts WHERE ref = ? ORDER BY kind, pos, created_at', rid).map(row);
const variantById = (p, id) => row(p.one('SELECT * FROM ref_variants WHERE id = ?', id));
const partById = (p, id) => row(p.one('SELECT * FROM ref_parts WHERE id = ?', id));
const dirOf = (p, rid) => path.join(p.dir, 'files', 'refs', rid);
const urlOf = (p, rid, file) => `/files/${encodeURIComponent(p.id)}/refs/${rid}/${file}`;
const touchRef = (p, rid) => p.run('UPDATE refs SET updated_at = ? WHERE id = ?', now(), rid);
const firstPerson = (p) => p.people()[0]?.name || null;
const humans = (who) => who && who !== 'bot' && who !== 'system';
const pickedOf = (p, vid, slot) => row(p.one('SELECT * FROM ref_images WHERE variant = ? AND slot = ? AND picked = 1 ORDER BY ts DESC LIMIT 1', vid, slot));

function createRef(p, { kind, name, keys = [], owner = null, source = 'hand', sourceInfo = null, fields = {}, voice = {}, voiceOnly = false, line = '', who = null }) {
  if (!FIELDS[kind]) bad('a character, a prop or a location');
  const id = nid('r');
  p.run('INSERT INTO refs(id, kind, name, keys_json, owner, source, source_info_json, line, fields_json, voice_json, voice_only, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, kind, str(name, 80).trim() || 'Untitled', J(keys), owner, source, sourceInfo ? J(sourceInfo) : null, str(line, 120), J(fields), J(voice), voiceOnly ? 1 : 0, now(), now());
  p.run('INSERT INTO ref_variants(id, ref, name, start_scene, status, created_at) VALUES (?,?,?,?,?,?)', nid('v'), id, 'Default', null, 'draft', now());
  if (kind === 'character') DEFAULT_EXPRESSIONS.forEach((n, i) => addPartRow(p, id, 'expression', n, '', {}, who || owner, i));
  return id;
}
function addPartRow(p, rid, kind, name, note = '', data = {}, by = null, pos = null) {
  const id = nid('pt');
  const at = pos ?? (p.one('SELECT max(pos) AS n FROM ref_parts WHERE ref = ? AND kind = ?', rid, kind)?.n ?? -1) + 1;
  p.run('INSERT INTO ref_parts(id, ref, kind, name, note, data_json, by, pos, created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, rid, kind, str(name, 60).trim(), str(note, 300), J(data), by, at, now());
  return id;
}
const log = (p, who, text, ref = null) => p.log('references', 'refs', text, who, ref);
function enqueue(p, type, by, payload) {
  if (p.one("SELECT 1 FROM jobs WHERE section = 'references' AND type = ? AND status IN ('pending','delivered') AND json_extract(payload_json, '$.ref') = ?", type, payload.ref)) return null;
  const id = nid('j');
  p.run('INSERT INTO jobs(id, section, type, by, ts, status, payload_json) VALUES (?,?,?,?,?,?,?)', id, 'references', type, by || null, now(), 'pending', J(payload));
  setImmediate(deliverHook);
  return id;
}
const blanks = (r) => FIELDS[r.kind].filter(([k]) => !String(r.fields?.[k] || '').trim()).map(([k]) => k);
const voiceBlanks = (r) => (r.kind === 'character' ? VOICE.filter(([k]) => !String(r.voice?.[k] || '').trim()).map(([k]) => k) : []);

// ---------------------------------------------------------------- the script makes characters and locations on its own
const scanTimers = new Map();
const lastWho = new Map();
export function scheduleScan(p, who) {
  if (humans(who)) lastWho.set(p.id, who);
  clearTimeout(scanTimers.get(p.id));
  scanTimers.set(p.id, setTimeout(() => { scanTimers.delete(p.id); try { scan(p, lastWho.get(p.id) || firstPerson(p)); } catch (e) { if (!/closed|not open/i.test(e.message)) console.error('references scan:', e.message); } }, 900));
}
const scanned = new Set();
const ensure = (p) => { if (scanned.has(p.id)) return; scanned.add(p.id); try { scan(p, firstPerson(p)); } catch (e) { console.error('references scan:', e.message); } };

export function scan(p, who = null) {
  const m = scriptMap(p);
  const existing = p.all('SELECT id, kind, keys_json FROM refs').map((r) => ({ id: r.id, kind: r.kind, keys: P(r.keys_json, []) }));
  const find = (kind, key) => existing.find((r) => r.kind === kind && r.keys.includes(key)); // deleted ones too, so they don't come back
  const made = [];
  p.tx(() => {
    for (const [key, c] of m.chars) {
      if (find('character', key)) continue;
      const heardOnly = c.heard > 0 && c.seen === 0;
      const id = createRef(p, { kind: 'character', name: c.display, keys: [key], owner: who, source: 'script', voiceOnly: heardOnly, who });
      existing.push({ id, kind: 'character', keys: [key] });
      made.push(['character', id, c.display]);
    }
    for (const [key, pl] of m.places) {
      let r = find('location', key);
      if (!r) {
        const id = createRef(p, { kind: 'location', name: pl.display, keys: [key], owner: who, source: 'script', sourceInfo: { intExt: pl.intExt }, who });
        r = { id, kind: 'location', keys: [key] }; existing.push(r);
        made.push(['location', id, pl.display]);
      }
      const have = partsOf(p, r.id).filter((x) => x.kind === 'area');
      let i = have.length;
      for (const [akey, a] of pl.areas) if (!have.some((x) => x.data?.key === akey)) addPartRow(p, r.id, 'area', a.display, '', { key: akey, crop: ART.autoCrop(i++) }, who);
    }
    for (const [kind, id, name] of made) log(p, who, `${name} came into References from the script`, { ref: id, kind });
  });
  for (const [, id] of made) enqueue(p, 'ref_describe', who, { ref: id }); // the AI fills the gaps, marked AI-suggested
  return made.length;
}

// ---------------------------------------------------------------- what a tab sees
function shotList(p, m) {
  if (!m.mainId) return [];
  const count = {};
  return p.all('SELECT * FROM shots WHERE draft = ? ORDER BY scene, pos', m.mainId)
    .filter((r) => m.order.includes(r.scene))
    .map((r) => { const sc = m.scenes[r.scene] || {}; const n = m.order.indexOf(r.scene) + 1; count[r.scene] = (count[r.scene] || 0) + 1; return { id: r.id, scene: r.scene, sceneNum: n, num: `${n}.${count[r.scene]}`, pos: r.pos, framing: r.framing || '', action: r.action || '', dialogue: r.dialogue || '', chars: splitNames(r.characters), place: sc.place, area: sc.area, status: r.status || 'proposed' }; })
    .sort((a, b) => a.sceneNum - b.sceneNum || a.pos - b.pos);
}
function variantFor(r, sceneId, m, override) {
  if (override) { const v = r.variants.find((x) => x.id === override); if (v) return v; }
  const i = m.order.indexOf(sceneId);
  let best = r.variants.find((v) => !v.start_scene), bi = -1;
  for (const v of r.variants) {
    if (!v.start_scene) continue;
    const j = m.order.indexOf(v.start_scene);
    if (j >= 0 && i >= 0 && j <= i && j > bi) { best = v; bi = j; }
  }
  return best;
}
// a shot's references: who's in frame (the right variant for its scene), the place and area from the heading, the props added by hand
function resolve(refs, m, links, shot) {
  const L = links.filter((l) => l.shot === shot.id);
  const link = (r) => L.find((l) => l.ref === r.id) || null;
  const use = (r) => ({ r, v: variantFor(r, shot.scene, m, link(r)?.variant), link: link(r) });
  const chars = refs.filter((r) => r.kind === 'character' && r.keys.some((k) => shot.chars.includes(k))).map(use);
  const loc = shot.place ? refs.find((r) => r.kind === 'location' && r.keys.includes(shot.place)) : null;
  const area = loc && shot.area ? loc.parts.find((x) => x.kind === 'area' && x.data?.key === shot.area) : null;
  const props = L.filter((l) => l.how === 'hand').map((l) => refs.find((r) => r.id === l.ref && r.kind === 'prop')).filter(Boolean).map(use);
  return { chars, loc: loc ? { ...use(loc), area } : null, props, all: [...chars, ...(loc ? [use(loc)] : []), ...props] };
}
const staleOf = (u) => u.link && u.link.made_version != null && u.link.pinned_version == null && u.link.made_version < u.v.version;

function snapOf(p, r, v) {
  const imgs = {};
  for (const x of p.all('SELECT slot, id FROM ref_images WHERE variant = ? AND picked = 1', v.id)) imgs[x.slot] = x.id;
  return v.start_scene ? { delta: v.delta, images: imgs } : { fields: r.fields || {}, images: imgs };
}
const lastSnap = (p, vid) => P(p.one('SELECT snap_json FROM ref_versions WHERE variant = ? ORDER BY n DESC LIMIT 1', vid)?.snap_json);
const changedSince = (p, r, v) => v.version > 0 && J(snapOf(p, r, v)) !== J(lastSnap(p, v.id));

const BUSY = new Map(); // `${project}/${variant}/${slot}` or `${project}/voice/${ref}` → { who, at }
const busyKey = (p, a, b) => `${p.id}/${a}/${b}`;
const busyIn = (p) => [...BUSY.keys()].filter((k) => k.startsWith(`${p.id}/`)).map((k) => k.slice(p.id.length + 1));

function decorate(p, r, m, ctx) {
  const parts = partsOf(p, r.id);
  const variants = variantsOf(p, r.id);
  const first = FIRST[r.kind];
  const imgs = p.all('SELECT id, variant, slot, file, batch, opt, picked, provider, ts FROM ref_images WHERE ref = ? ORDER BY ts, rowid', r.id);
  const startIdx = (v) => (v.start_scene ? m.order.indexOf(v.start_scene) : -1);
  const firstStart = variants.filter((v) => v.start_scene && startIdx(v) >= 0).map(startIdx).sort((a, b) => a - b)[0];
  const out = { ...r, keys: r.keys || [], parts, variants: [] };
  for (const v of variants) {
    const mine = imgs.filter((x) => x.variant === v.id);
    const images = {}, batches = {};
    for (const x of mine) if (x.picked) images[x.slot] = { id: x.id, url: urlOf(p, r.id, x.file), opt: x.opt, provider: x.provider };
    const bySlot = {};
    for (const x of mine) (bySlot[x.slot] ||= []).push(x);
    for (const [slot, list] of Object.entries(bySlot)) {
      const lastPick = Math.max(0, ...list.filter((x) => x.picked).map((x) => x.ts));
      const last = list.filter((x) => x.batch && !x.picked && x.ts > lastPick).at(-1);
      if (last) { const b = list.filter((x) => x.batch === last.batch); if (b.length > 1 && !b.some((x) => x.picked)) batches[slot] = { id: last.batch, images: b.map((x) => ({ id: x.id, url: urlOf(p, r.id, x.file), opt: x.opt })) }; }
    }
    const busy = ctx.busy.filter((k) => k.startsWith(`${v.id}/`)).map((k) => k.slice(v.id.length + 1));
    const status = busy.includes(first) ? 'generating' : v.status === 'approved' ? 'approved' : images[first] ? 'review' : v.start_scene ? 'awaiting' : 'draft';
    const i = startIdx(v);
    const range = v.start_scene ? (i >= 0 ? `from sc. ${i + 1}` : 'from a scene not placed') : firstStart != null ? (firstStart > 1 ? `sc. 1–${firstStart}` : firstStart === 1 ? 'sc. 1' : 'before its changes') : 'everywhere';
    out.variants.push({ id: v.id, name: v.name, start_scene: v.start_scene, startScene: v.start_scene, startNum: i >= 0 ? i + 1 : null, delta: v.delta, origin: v.origin, status, version: v.version, approvedBy: v.approved_by, approvedAt: v.approved_at, range, images, batches, busy, changed: changedSince(p, r, v), usedIn: [], stale: 0, versions: p.all('SELECT n, by, ts, note FROM ref_versions WHERE variant = ? ORDER BY n', v.id) });
  }
  // where it shows up in the script, and whether it still does
  const sc = r.kind === 'character' ? [...r.keys].flatMap((k) => [...(m.chars.get(k)?.scenes || [])]) : r.kind === 'location' ? r.keys.flatMap((k) => [...(m.places.get(k)?.scenes || [])]) : [];
  const nums = placedNums(m, new Set(sc));
  const c = r.kind === 'character' ? m.chars.get(r.keys[0]) : null;
  out.scenes = nums;
  out.notUsed = r.source === 'script' && !nums.length;
  out.sourceText = r.source === 'script'
    ? (r.kind === 'character' ? (nums.length ? `From the script · ${c && c.seen === 0 && c.heard ? 'heard in' : 'in'} ${scList(nums)}${c && c.seen === 0 && c.heard ? ' (V.O.)' : ''}` : 'From the script · not in any placed scene now') : nums.length ? `From the script · ${scList(nums)}` : 'From the script · not in any placed scene now')
    : r.source === 'brainstorm' ? `From Brainstorm${r.source_info?.title ? ` · “${r.source_info.title}”` : ''}` : r.source === 'copy' ? `Copied from ${r.source_info?.fromName || 'another project'}` : `Added by ${r.owner || 'someone'}`;
  if (r.kind === 'location') { // who's here: the characters in its scenes, most often first
    const here = {};
    for (const id of sc) for (const k of m.scenes[id]?.speakers || []) here[k] = (here[k] || 0) + 1;
    out.regulars = Object.entries(here).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    out.intExt = r.source_info?.intExt || [...(m.places.get(r.keys[0])?.intExt ? [m.places.get(r.keys[0]).intExt] : [])][0] || '';
    out.heading = r.keys[0] ? `${out.intExt ? `${out.intExt} ` : ''}${r.keys[0]}` : '';
  }
  const voice = row(p.one("SELECT * FROM ref_media WHERE ref = ? AND kind = 'voice' ORDER BY ts DESC LIMIT 1", r.id));
  const motion = row(p.one("SELECT * FROM ref_media WHERE ref = ? AND kind = 'motion' ORDER BY ts DESC LIMIT 1", r.id));
  out.media = {
    voice: voice ? { url: urlOf(p, r.id, voice.file), dur: voice.dur, peaks: voice.peaks || [], provider: voice.provider, by: voice.by, ts: voice.ts, stale: voice.made_from !== MEDIA.hashOf(r.voice || {}) } : null,
    motion: motion ? { url: urlOf(p, r.id, motion.file), dur: motion.dur, provider: motion.provider, by: motion.by, ts: motion.ts, stale: motion.made_from !== MEDIA.hashOf(r.motion || '') } : null,
  };
  out.voiceBusy = ctx.busy.includes(`voice/${r.id}`);
  out.describing = !!p.one("SELECT 1 FROM jobs WHERE section = 'references' AND type = 'ref_describe' AND status IN ('pending','delivered') AND json_extract(payload_json, '$.ref') = ?", r.id);
  out.checking = !!p.one("SELECT 1 FROM jobs WHERE section = 'references' AND type = 'ref_check' AND status IN ('pending','delivered') AND json_extract(payload_json, '$.ref') = ?", r.id);
  return out;
}

export function publicState(p, { projects = [], botOnline = false } = {}) {
  ensure(p);
  const m = scriptMap(p);
  const ctx = { busy: busyIn(p) };
  const refs = p.all('SELECT * FROM refs WHERE deleted_at IS NULL ORDER BY created_at, rowid').map(row).map((r) => decorate(p, r, m, ctx))
    .sort((a, b) => (a.scenes[0] ?? 1e4) - (b.scenes[0] ?? 1e4) || b.scenes.length - a.scenes.length || a.created_at - b.created_at); // in the order the script meets them
  const links = m.mainId ? p.all('SELECT * FROM shot_refs WHERE draft = ?', m.mainId) : [];
  const shots = shotList(p, m);
  // Used in, per variant, and the shots that were made with an older version
  for (const s of shots) {
    for (const u of resolve(refs, m, links, s).all) {
      const v = u.r.variants.find((x) => x.id === u.v.id);
      if (!v) continue;
      v.usedIn.push(s.num);
      if (staleOf(u)) v.stale++;
    }
  }
  const prov = MEDIA.providers();
  return {
    refs, people: p.people().map((x) => x.name), started: !!m.mainId,
    scenes: m.order.map((id, i) => ({ id, num: i + 1, title: m.scenes[id]?.title || '' })),
    providers: { image: prov.image, imageWorkers: prov.imageWorkers, voice: prov.voice, video: prov.video },
    projects: projects.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, name: x.name })),
    config: CONFIG, botOnline,
  };
}

// Production → Frames: every shot of Main with the references it uses
export function productionState(p) {
  ensure(p);
  const m = scriptMap(p);
  const ctx = { busy: busyIn(p) };
  const refs = p.all('SELECT * FROM refs WHERE deleted_at IS NULL ORDER BY created_at, rowid').map(row).map((r) => decorate(p, r, m, ctx));
  const links = m.mainId ? p.all('SELECT * FROM shot_refs WHERE draft = ?', m.mainId) : [];
  const chip = (u, extra = {}) => {
    const v = u.r.variants.find((x) => x.id === u.v.id) || u.r.variants[0];
    const first = v.images[FIRST[u.r.kind]] || u.r.variants[0].images[FIRST[u.r.kind]];
    return { ref: u.r.id, kind: u.r.kind, name: u.r.name, variant: v.id, variantName: v.startScene ? v.name : null, variants: u.r.variants.map((x) => ({ id: x.id, name: x.name, range: x.range })), override: u.link?.variant || null, status: v.status, version: v.version, thumb: first?.url || null, stale: staleOf(u) ? { was: u.link.made_version, now: v.version } : null, pinned: u.link?.pinned_version ?? null, how: u.link?.how || 'auto', ...extra };
  };
  const scenes = [];
  for (const s of shotList(p, m)) {
    let sc = scenes.find((x) => x.id === s.scene);
    if (!sc) { const ms = m.scenes[s.scene] || {}; sc = { id: s.scene, num: s.sceneNum, title: ms.title || '', heading: ms.place ? `${ms.intExt ? `${ms.intExt} ` : ''}${ms.place}${ms.area ? ` – ${ms.area}` : ''}` : '', shots: [] }; scenes.push(sc); }
    const R = resolve(refs, m, links, s);
    sc.shots.push({ id: s.id, scene: s.scene, num: s.num, framing: s.framing, action: s.action, dialogue: s.dialogue, status: s.status, draft: m.mainId,
      chips: [...R.chars.map((u) => chip(u)), ...(R.loc ? [chip(R.loc, { area: R.loc.area ? { id: R.loc.area.id, name: R.loc.area.name } : null })] : []), ...R.props.map((u) => chip(u))],
      unknown: s.chars.filter((k) => !refs.some((r) => r.kind === 'character' && r.keys.includes(k))) });
  }
  return { scenes, started: !!m.mainId, props: refs.filter((r) => r.kind === 'prop').map((r) => ({ id: r.id, name: r.name })) };
}

// what the Judge reads: the approved looks (the Bible's Visual Continuity part)
export function canon(p) {
  return p.all("SELECT * FROM refs WHERE deleted_at IS NULL ORDER BY kind, created_at").map(row).map((r) => {
    const vs = variantsOf(p, r.id);
    const d = vs.find((v) => !v.start_scene);
    if (!d || d.status !== 'approved') return null;
    const desc = FIELDS[r.kind].map(([k, l]) => (r.fields?.[k] ? `${l}: ${r.fields[k]}` : '')).filter(Boolean).join(' · ');
    return { kind: r.kind, name: r.name, look: desc, changes: vs.filter((v) => v.start_scene).map((v) => ({ name: v.name, what: v.delta })) };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- images: make 4, pick one, the rest follow
const slotParts = (slot) => (slot.startsWith('part:') ? slot.slice(5) : null);
const shapeOf = (kind, slot, part) => (kind === 'location' && (slot === 'layout' || ['area', 'element'].includes(part?.kind)) ? 'wide' : kind === 'character' && (['front', 'side', 'back'].includes(slot) || part?.kind === 'outfit') ? 'portrait' : 'square');
function promptFor(r, v, slot, part, fix) {
  const desc = FIELDS[r.kind].map(([k, l]) => (r.fields?.[k] ? `${l}: ${r.fields[k]}` : '')).filter(Boolean).join('. ');
  const what = { character: 'Character reference image for a film', prop: 'Prop reference image for a film', location: 'Location reference image for a film' }[r.kind];
  const view = part ? {
    expression: `Close-up of the same face, expression: ${part.name}${part.note ? ` (${part.note})` : ''}`,
    outfit: `Full body, the same person wearing: ${part.name}${part.note ? `, ${part.note}` : ''}`,
    state: `The same object, state: ${part.name}${part.note ? ` (${part.note})` : ''}`,
    area: `The area “${part.name}” of this same place, closer`,
    element: `Close view of the ${part.name} in this same place${part.note ? ` (${part.note})` : ''}`,
    texture: `Flat, evenly lit close-up swatch of the surface: ${part.name}${part.note ? `, ${part.note}` : ''}`,
  }[part.kind] : { front: 'Front view, head and shoulders, neutral expression, looking at the camera', side: 'Side profile of the same person, same clothes', back: 'Back view of the same person', top: 'Top-down view of the same object', scale: 'The same object next to an average adult, for scale', layout: 'One wide establishing view of the whole place at eye level' }[slot];
  const ground = r.kind === 'location' ? 'Neutral even light, no time of day, no weather, no people.' : 'Plain light grey studio background, soft even light, no text.';
  return [`${what}: ${r.name}.`, desc ? `${desc}.` : '', v.delta ? `Lasting change: ${v.delta}.` : '', `${view}.`, ground, fix ? `Change: ${fix}.` : ''].filter(Boolean).join(' ');
}
const artData = (p, r) => ({ name: r.name, fields: r.fields || {}, source: r.source_info || {}, parts: partsOf(p, r.id) });
function artFor(r, v, slot, part, opt, explore) {
  const data = artData(r.__p, r);
  const delta = v.delta || '';
  if (r.kind === 'character') {
    const front = pickedOf(r.__p, defaultOf(r.__p, r.id).id, 'front');
    const look = explore ? opt : front?.opt ?? null; // the hairstyle the Default front settled on (stored as its opt)
    if (!part) return ART.portrait(data, slot, { opt, delta, look });
    if (part.kind === 'expression') return ART.face(data, part.name, { delta, opt, look });
    return ART.figure(data, part, { opt });
  }
  if (r.kind === 'prop') return part ? ART.propArt(data, 'front', { opt, state: `${part.name} ${part.note}` }) : ART.propArt(data, slot, { opt });
  if (!part) return ART.placeArt(data, { opt });
  if (part.kind === 'texture') return ART.texture(part.name, part.note, { opt });
  const layoutOpt = pickedOf(r.__p, v.id, 'layout')?.opt ?? pickedOf(r.__p, defaultOf(r.__p, r.id).id, 'layout')?.opt ?? 0;
  return ART.placeArt(data, { opt: layoutOpt, crop: part.data?.crop || ART.autoCrop(part.pos || 0) });
}
function spend(p, n) { // the monthly cap on paid images
  const month = new Date().toISOString().slice(0, 7);
  const cur = p.kvGet('refs.images', {}) || {};
  const used = cur.month === month ? cur.n : 0;
  const cap = MEDIA.providers().imageCap;
  if (used + n > cap) bad(`this project has made ${used} images this month; the cap is ${cap} (PI_IMAGE_CAP)`);
  p.kvSet('refs.images', { month, n: used + n });
}
// make n images for one slot of one variant; returns the rows (not picked yet unless pick is set)
async function render(p, r, v, slot, { n = 4, fix = '', opt = null, who = null, pick = false } = {}) {
  const part = slotParts(slot) ? partById(p, slotParts(slot)) : null;
  if (slotParts(slot) && !part) bad('that part is gone');
  if (part && DRAWN.has(part.kind)) return [];
  const prov = MEDIA.providers();
  const batch = nid('b');
  const dir = dirOf(p, r.id);
  fs.mkdirSync(dir, { recursive: true });
  const fileBase = `${v.id}-${slot.replace(/[^a-z0-9]/gi, '_')}-${batch}`;
  const isFirst = slot === FIRST[r.kind];
  const explore = isFirst && !v.start_scene && opt == null;
  const prompt = promptFor(r, v, slot, part, fix);
  let files = [];
  if (prov.image === 'openai' || prov.image === 'codex') {
    // from the picked first image (or the Default's, for a variant), so the face or the object stays the same
    const fromRow = !explore ? (pickedOf(p, v.id, FIRST[r.kind]) || pickedOf(p, defaultOf(p, r.id).id, FIRST[r.kind])) : null;
    const from = fromRow && !isFirst ? path.join(dir, fromRow.file) : fromRow && v.start_scene ? path.join(dir, fromRow.file) : null;
    if (prov.image === 'openai') spend(p, n); // codex runs on a subscription: no per-image bill to cap
    const bufs = await (prov.image === 'codex' ? MEDIA.codexImages : MEDIA.openaiImages)({ prompt, n, shape: shapeOf(r.kind, slot, part), from });
    files = bufs.map((b, i) => { const f = `${fileBase}-${i}.png`; fs.writeFileSync(path.join(dir, f), b); return { file: f, opt: i }; });
  } else {
    const seed = fix ? [...fix].reduce((a, c) => a + c.charCodeAt(0), 0) % 4 : 0;
    r.__p = p;
    for (let i = 0; i < n; i++) {
      const o = opt != null ? opt : explore && r.kind === 'character' ? ART.exploreLook(artData(p, r), i + seed) : (i + seed) % 4;
      const f = `${fileBase}-${i}.svg`;
      fs.writeFileSync(path.join(dir, f), artFor(r, v, slot, part, o, explore));
      files.push({ file: f, opt: o });
    }
  }
  const t = now();
  const rows = files.map((x, i) => ({ id: nid('im'), ...x, ts: t + i }));
  p.tx(() => {
    if (pick) p.run('UPDATE ref_images SET picked = 0 WHERE variant = ? AND slot = ?', v.id, slot);
    for (const x of rows) p.run('INSERT INTO ref_images(id, ref, variant, slot, file, prompt, provider, batch, opt, picked, by, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', x.id, r.id, v.id, slot, x.file, prompt, prov.image, n > 1 ? batch : null, x.opt, pick ? 1 : 0, who, x.ts);
    touchRef(p, r.id);
  });
  return rows;
}
// every slot that's made from the first one, for this kind of reference
const restSlots = (p, r) => [...SHEET[r.kind], ...partsOf(p, r.id).filter((x) => !DRAWN.has(x.kind)).map((x) => `part:${x.id}`)];
async function guarded(p, keys, fn) {
  for (const k of keys) if (BUSY.has(k)) bad('already making those');
  for (const k of keys) BUSY.set(k, { at: now() });
  p.touch();
  try { return await fn(); } finally { for (const k of keys) BUSY.delete(k); p.touch(); }
}
async function makeRest(p, r, v, opt, who, slots = null) {
  const list = slots || restSlots(p, r);
  if (!list.length) return;
  await guarded(p, list.map((s) => busyKey(p, v.id, s)), async () => {
    for (const slot of list) await render(p, r, v, slot, { n: 1, opt, who, pick: true });
  });
}

// ---------------------------------------------------------------- team actions
const A = {
  new(p, b, who) {
    const kind = b.kind;
    const name = str(b.name, 80).trim(); if (!name) bad('it needs a name');
    const key = kind === 'prop' ? '' : kind === 'character' ? charKey(name) : name.toUpperCase();
    const id = createRef(p, { kind, name, keys: key ? [key] : [], owner: who, source: 'hand', who });
    log(p, who, `added the ${kind} ${name}`, { ref: id, kind });
    return { id };
  },
  rename(p, b, who) { const r = mustRef(p, b.ref); const name = str(b.name, 80).trim(); if (!name) bad('it needs a name'); p.run('UPDATE refs SET name = ?, updated_at = ? WHERE id = ?', name, now(), r.id); log(p, who, `renamed ${r.name} “${name}”`, { ref: r.id }); },
  line(p, b) { const r = mustRef(p, b.ref); p.run('UPDATE refs SET line = ?, updated_at = ? WHERE id = ?', str(b.line, 120), now(), r.id); },
  field(p, b) { // a description field; typing over an AI suggestion makes it yours
    const r = mustRef(p, b.ref);
    const list = b.list === 'voice' ? VOICE : FIELDS[r.kind];
    if (!list.some(([k]) => k === b.field)) bad('no such field');
    const col = b.list === 'voice' ? 'voice' : 'fields', aicol = b.list === 'voice' ? 'voice_ai' : 'ai';
    const obj = { ...(r[col] || {}), [b.field]: str(b.value, 1000) };
    const ai = (r[aicol] || []).filter((k) => k !== b.field);
    p.run(`UPDATE refs SET ${col}_json = ?, ${aicol}_json = ?, updated_at = ? WHERE id = ?`, J(obj), J(ai), now(), r.id);
  },
  motion(p, b) { const r = mustRef(p, b.ref); p.run('UPDATE refs SET motion = ?, updated_at = ? WHERE id = ?', str(b.text, 2000), now(), r.id); },
  face(p, b, who) { const r = mustRef(p, b.ref); p.run('UPDATE refs SET voice_only = ?, updated_at = ? WHERE id = ?', b.off ? 1 : 0, now(), r.id); log(p, who, b.off ? `made ${r.name} a voice only` : `gave ${r.name} a face`, { ref: r.id }); },
  owner(p, b, who) { const r = mustRef(p, b.ref); const o = str(b.owner, 40).trim(); if (!o) bad('who?'); p.run('UPDATE refs SET owner = ? WHERE id = ?', o, r.id); log(p, who, `made ${o} the owner of ${r.name}`, { ref: r.id }); },
  delete(p, b, who) { const r = mustRef(p, b.ref); p.run('UPDATE refs SET deleted_at = ? WHERE id = ?', now(), r.id); log(p, who, `deleted ${r.name} from References (the script won’t bring it back)`, { ref: r.id }); },
  merge(p, b, who) { // the script renamed someone: two cards are one
    const r = mustRef(p, b.ref), into = mustRef(p, b.into);
    if (r.kind !== into.kind || r.id === into.id) bad('same kind, different card');
    p.tx(() => { p.run('UPDATE refs SET keys_json = ? WHERE id = ?', J([...new Set([...(into.keys || []), ...(r.keys || [])])]), into.id); p.run('UPDATE refs SET deleted_at = ?, keys_json = ? WHERE id = ?', now(), '[]', r.id); });
    log(p, who, `merged ${r.name} into ${into.name}`, { ref: into.id });
    return { id: into.id };
  },
  'part/add'(p, b, who) {
    const r = mustRef(p, b.ref);
    if (!PARTS[r.kind].includes(b.kind)) bad('not a part of this kind of reference');
    const name = str(b.name, 60).trim(); if (!name) bad('it needs a name');
    const data = b.kind === 'light' ? { ...ART.lightOf(name, b.note || ''), quality: str(b.note, 200) } : ['area', 'element'].includes(b.kind) ? { crop: ART.autoCrop(partsOf(p, r.id).filter((x) => x.kind === b.kind).length) } : {};
    const id = addPartRow(p, r.id, b.kind, name, b.kind === 'light' ? '' : str(b.note, 300), data, who);
    log(p, who, `added ${b.kind === 'expression' ? 'the expression' : `the ${b.kind}`} “${name}” to ${r.name}`, { ref: r.id });
    // made right away, from the first image, in every variant that has one
    for (const v of variantsOf(p, r.id)) { const f = pickedOf(p, v.id, FIRST[r.kind]); if (f && !DRAWN.has(b.kind)) makeRest(p, r, v, f.opt ?? 0, who, [`part:${id}`]).catch((e) => console.error('part image:', e.message)); }
    return { id };
  },
  'part/edit'(p, b, who) {
    const x = partById(p, b.part); if (!x) bad('no such part');
    const name = b.name !== undefined ? str(b.name, 60).trim() || x.name : x.name;
    const note = b.note !== undefined ? str(b.note, 300) : x.note;
    const data = x.kind === 'light' ? { ...x.data, ...ART.lightOf(name, b.note ?? x.data?.quality ?? ''), quality: b.note !== undefined ? str(b.note, 200) : x.data?.quality || '' } : x.data;
    p.run('UPDATE ref_parts SET name = ?, note = ?, data_json = ? WHERE id = ?', name, x.kind === 'light' ? '' : note, J(data), x.id);
    touchRef(p, x.ref);
  },
  'part/remove'(p, b, who) { const x = partById(p, b.part); if (!x) bad('no such part'); p.tx(() => { p.run('DELETE FROM ref_images WHERE slot = ?', `part:${x.id}`); p.run('DELETE FROM ref_parts WHERE id = ?', x.id); }); log(p, who, `removed “${x.name}”`, { ref: x.ref }); },
  'variant/add'(p, b, who) { // a lasting change by hand
    const r = mustRef(p, b.ref);
    const name = str(b.name, 60).trim(); if (!name) bad('name the change');
    const id = nid('v');
    p.run('INSERT INTO ref_variants(id, ref, name, start_scene, delta, status, origin_json, created_at) VALUES (?,?,?,?,?,?,?,?)', id, r.id, name, str(b.scene, 40) || 'unplaced', str(b.delta, 600), 'awaiting', J({ by: who }), now());
    log(p, who, `added the lasting change “${name}” to ${r.name}`, { ref: r.id });
    return { id };
  },
  'variant/edit'(p, b) {
    const v = variantById(p, b.variant); if (!v || !v.start_scene) bad('no such change');
    p.run('UPDATE ref_variants SET name = ?, delta = ?, start_scene = ? WHERE id = ?', b.name !== undefined ? str(b.name, 60).trim() || v.name : v.name, b.delta !== undefined ? str(b.delta, 600) : v.delta, b.scene !== undefined ? str(b.scene, 40) || v.start_scene : v.start_scene, v.id);
    touchRef(p, v.ref);
  },
  'variant/remove'(p, b, who) { const v = variantById(p, b.variant); if (!v || !v.start_scene) bad('the Default stays'); p.tx(() => { p.run('DELETE FROM ref_images WHERE variant = ?', v.id); p.run('DELETE FROM ref_variants WHERE id = ?', v.id); p.run('UPDATE shot_refs SET variant = NULL WHERE variant = ?', v.id); }); log(p, who, `removed the change “${v.name}”`, { ref: v.ref }); },
  approve(p, b, who) { // the owner's lock on a version; shots never waited for it
    const v = variantById(p, b.variant); if (!v) bad('no such variant');
    const r = mustRef(p, v.ref);
    if (r.owner && r.owner !== who) bad(`${r.owner} approves this one`);
    if (!pickedOf(p, v.id, FIRST[r.kind])) bad(`pick a ${FIRST[r.kind] === 'layout' ? 'layout view' : 'front view'} first`);
    if (v.status === 'approved' && !changedSince(p, r, v)) return { unchanged: true };
    const n = saveVersion(p, r, v, who);
    p.run('UPDATE ref_variants SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?', 'approved', who, now(), v.id);
    if (!r.owner) p.run('UPDATE refs SET owner = ? WHERE id = ?', who, r.id);
    log(p, who, `approved ${r.name}${v.start_scene ? ` · ${v.name}` : ''} (v${n})`, { ref: r.id });
    enqueue(p, 'ref_check', who, { ref: r.id });
    return { version: n };
  },
  'version/save'(p, b, who) { // an approved card changed: keep the old version, mark the shots made with it
    const v = variantById(p, b.variant); if (!v) bad('no such variant');
    const r = mustRef(p, v.ref);
    if (!changedSince(p, r, v)) return { unchanged: true };
    const n = saveVersion(p, r, v, who);
    log(p, who, `saved ${r.name}${v.start_scene ? ` · ${v.name}` : ''} as v${n}; v${n - 1} is kept`, { ref: r.id });
    enqueue(p, 'ref_check', who, { ref: r.id });
    return { version: n };
  },
  'version/undo'(p, b, who) { // back to the last version
    const v = variantById(p, b.variant); if (!v) bad('no such variant');
    const r = mustRef(p, v.ref);
    const snap = lastSnap(p, v.id); if (!snap) bad('nothing to go back to');
    p.tx(() => {
      if (snap.fields) p.run('UPDATE refs SET fields_json = ? WHERE id = ?', J(snap.fields), r.id);
      if (snap.delta !== undefined) p.run('UPDATE ref_variants SET delta = ? WHERE id = ?', snap.delta, v.id);
      p.run('UPDATE ref_images SET picked = 0 WHERE variant = ?', v.id);
      for (const id of Object.values(snap.images || {})) p.run('UPDATE ref_images SET picked = 1 WHERE id = ?', id);
    });
    log(p, who, `put ${r.name} back to v${v.version}`, { ref: r.id });
  },
  'shot/prop'(p, b, who) { // props are added to a shot by hand
    const r = mustRef(p, b.ref);
    if (b.remove) p.run('DELETE FROM shot_refs WHERE draft = ? AND shot = ? AND ref = ?', b.draft, b.shot, r.id);
    else p.run("INSERT INTO shot_refs(draft, scene, shot, ref, how, by, ts) VALUES (?,?,?,?,'hand',?,?) ON CONFLICT(draft, shot, ref) DO UPDATE SET how = 'hand'", b.draft, b.scene, b.shot, r.id, who, now());
    p.touch();
  },
  'shot/variant'(p, b, who) { // a shot picks its own variant
    const r = mustRef(p, b.ref);
    upsertLink(p, b.draft, b.scene, b.shot, r.id, who);
    p.run('UPDATE shot_refs SET variant = ? WHERE draft = ? AND shot = ? AND ref = ?', b.variant || null, b.draft, b.shot, r.id);
  },
  'shot/keep'(p, b, who) { // stays with the version it was made with (a flashback, say)
    p.run('UPDATE shot_refs SET pinned_version = made_version, by = ?, ts = ? WHERE draft = ? AND shot = ? AND ref = ?', who, now(), b.draft, b.shot, b.ref);
    log(p, who, `kept shot ${b.num || ''} on the older ${refById(p, b.ref)?.name || 'reference'}`.replace('  ', ' '), { ref: b.ref });
  },
  'shot/update'(p, b, who) { // moves to the current version
    const r = mustRef(p, b.ref);
    const v = variantById(p, b.variant) || defaultOf(p, r.id);
    p.run('UPDATE shot_refs SET made_version = ?, pinned_version = NULL, by = ?, ts = ? WHERE draft = ? AND shot = ? AND ref = ?', v.version, who, now(), b.draft, b.shot, r.id);
    log(p, who, `moved shot ${b.num || ''} to ${r.name} v${v.version}`.replace('  ', ' '), { ref: r.id });
  },
  describe(p, b, who) { const r = mustRef(p, b.ref); if (!enqueue(p, 'ref_describe', who, { ref: r.id, all: !!b.all })) return { already: true }; },
  check(p, b, who) { const r = mustRef(p, b.ref); if (!enqueue(p, 'ref_check', who, { ref: r.id })) return { already: true }; },
  'check/clear'(p, b) { const r = mustRef(p, b.ref); p.run('UPDATE refs SET check_json = NULL WHERE id = ?', r.id); },
};
const mustRef = (p, id) => { const r = refById(p, id); if (!r || r.deleted_at) bad('no such reference'); return r; };
function upsertLink(p, draft, scene, shot, ref, who) {
  p.run("INSERT INTO shot_refs(draft, scene, shot, ref, how, by, ts) VALUES (?,?,?,?,'auto',?,?) ON CONFLICT(draft, shot, ref) DO NOTHING", draft, scene, shot, ref, who, now());
}
function saveVersion(p, r, v, who) {
  const n = v.version + 1;
  p.tx(() => {
    p.run('INSERT INTO ref_versions(variant, n, ref, snap_json, by, ts) VALUES (?,?,?,?,?,?)', v.id, n, r.id, J(snapOf(p, r, v)), who, now());
    p.run('UPDATE ref_variants SET version = ? WHERE id = ?', n, v.id);
    if (v.version >= 1) { // the shots using it were made with the old one: they get a Stale line (keep / move on)
      const m = scriptMap(p);
      if (m.mainId) {
        const refs = p.all('SELECT * FROM refs WHERE deleted_at IS NULL').map(row).map((x) => ({ ...x, keys: x.keys || [], parts: partsOf(p, x.id), variants: variantsOf(p, x.id) }));
        const links = p.all('SELECT * FROM shot_refs WHERE draft = ?', m.mainId);
        for (const s of shotList(p, m)) {
          for (const u of resolve(refs, m, links, s).all) {
            if (u.r.id !== r.id || u.v.id !== v.id) continue;
            upsertLink(p, m.mainId, s.scene, s.id, r.id, who);
            p.run('UPDATE shot_refs SET made_version = COALESCE(made_version, ?) WHERE draft = ? AND shot = ? AND ref = ?', v.version, m.mainId, s.id, r.id);
          }
        }
      }
    }
  });
  return n;
}

// the ones that take a while (images, voices): they answer at once, the work finishes in the background and pushes
const ASYNC = {
  async generate(p, b, who) {
    const v = variantById(p, b.variant); if (!v) bad('no such variant');
    const r = mustRef(p, v.ref);
    const slot = str(b.slot, 60);
    const isFirst = slot === FIRST[r.kind];
    if (!isFirst && !slotParts(slot) && !SHEET[r.kind].includes(slot)) bad('no such view');
    if (!isFirst && !pickedOf(p, v.id, FIRST[r.kind]) && !(v.start_scene && pickedOf(p, defaultOf(p, r.id).id, FIRST[r.kind]))) bad(`pick the ${FIRST[r.kind] === 'layout' ? 'layout view' : 'front'} first: the rest are made from it`);
    const fix = str(b.fix, 300).trim();
    await guarded(p, [busyKey(p, v.id, slot)], () => render(p, r, v, slot, { n: 4, fix, who }));
    log(p, who, `made 4 options for ${r.name}${v.start_scene ? ` · ${v.name}` : ''} (${slotLabel(slot, p)})${fix ? `: “${fix}”` : ''}`, { ref: r.id });
  },
  async pick(p, b, who) {
    const x = row(p.one('SELECT * FROM ref_images WHERE id = ?', b.image)); if (!x) bad('no such image');
    const r = mustRef(p, x.ref);
    const v = variantById(p, x.variant);
    p.tx(() => { p.run('UPDATE ref_images SET picked = 0 WHERE variant = ? AND slot = ?', v.id, x.slot); p.run('UPDATE ref_images SET picked = 1 WHERE id = ?', x.id); touchRef(p, r.id); });
    if (x.slot === FIRST[r.kind]) {
      if (v.status !== 'approved') p.run("UPDATE ref_variants SET status = 'review' WHERE id = ?", v.id);
      log(p, who, `picked the ${x.slot === 'layout' ? 'layout view' : 'front'} for ${r.name}${v.start_scene ? ` · ${v.name}` : ''}; the rest are made from it`, { ref: r.id });
      await makeRest(p, r, v, x.opt ?? 0, who);
    }
  },
  async voice(p, b, who) {
    const r = mustRef(p, b.ref);
    if (r.kind !== 'character') bad('voices are for characters');
    if (!MEDIA.providers().voice) bad('no voice model here yet');
    await guarded(p, [busyKey(p, 'voice', r.id)], async () => {
      const file = `voice-${Date.now().toString(36)}.mp3`;
      const out = path.join(dirOf(p, r.id), file);
      const res = await MEDIA.voiceSample(r.voice || {}, { name: r.name, heard: !!r.voice_only, out });
      p.run('INSERT INTO ref_media(id, ref, kind, file, dur, peaks_json, made_from, provider, by, ts) VALUES (?,?,?,?,?,?,?,?,?,?)', nid('md'), r.id, 'voice', file, res.dur, J(res.peaks), MEDIA.hashOf(r.voice || {}), `say:${res.plan.voice}`, who, now());
      log(p, who, `made a voice sample for ${r.name}`, { ref: r.id });
    });
  },
  async clip(p, b) { mustRef(p, b.ref); bad('No video model is connected yet. Upload a clip instead.'); },
};
const slotLabel = (slot, p) => { const part = slotParts(slot) && partById(p, slotParts(slot)); return part ? part.name : { front: 'front', side: 'side', back: 'back', top: 'top', scale: 'scale', layout: 'layout view' }[slot] || slot; };

export async function action(p, name, b, who) {
  if (ASYNC[name]) {
    const job = ASYNC[name](p, b, who);
    // answer quickly; anything slow carries on and pushes when it's done
    const out = await Promise.race([job.then(() => ({ ok: true })), new Promise((res) => setTimeout(() => res({ ok: true, working: true }), 400))]);
    job.catch((e) => { if (out.working) console.error(`references ${name}:`, e.message); });
    return out;
  }
  const fn = A[name];
  if (!fn) throw err('nothing here', 404);
  return { ok: true, ...(fn(p, b, who) || {}) };
}

// ---------------------------------------------------------------- your own files: images on any slot, a clip, a voice
const TYPES = { 'image/png': ['image', 'png'], 'image/jpeg': ['image', 'jpg'], 'image/webp': ['image', 'webp'], 'image/gif': ['image', 'gif'], 'image/svg+xml': ['image', 'svg'], 'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'], 'video/quicktime': ['video', 'mov'], 'audio/mpeg': ['audio', 'mp3'], 'audio/wav': ['audio', 'wav'], 'audio/x-wav': ['audio', 'wav'], 'audio/mp4': ['audio', 'm4a'], 'audio/x-m4a': ['audio', 'm4a'] };
export async function upload(p, q, buf, type, who) {
  const r = mustRef(p, q.ref);
  const t = TYPES[String(type || '').split(';')[0].trim().toLowerCase()];
  if (!t) bad('that kind of file can’t go here (images: png, jpg, webp, gif · clips: mp4, webm · voices: mp3, wav, m4a)');
  if (!buf?.length) bad('the file is empty');
  const dir = dirOf(p, r.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = `up-${Date.now().toString(36)}.${t[1]}`;
  fs.writeFileSync(path.join(dir, file), buf);
  if (q.kind === 'motion' || q.kind === 'voice') {
    if (q.kind === 'motion' && !(t[0] === 'video' || t[1] === 'gif')) bad('a clip is a video (mp4, webm) or a gif');
    if (q.kind === 'voice' && t[0] !== 'audio') bad('a voice sample is an audio file');
    const id = nid('md');
    const made = q.kind === 'voice' ? MEDIA.hashOf(r.voice || {}) : MEDIA.hashOf(r.motion || '');
    p.run('INSERT INTO ref_media(id, ref, kind, file, made_from, provider, by, ts) VALUES (?,?,?,?,?,?,?,?)', id, r.id, q.kind, file, made, 'upload', who, now());
    log(p, who, `uploaded ${q.kind === 'voice' ? 'a voice sample' : 'a motion clip'} for ${r.name}`, { ref: r.id });
    (q.kind === 'voice' ? MEDIA.peaksOf(path.join(dir, file)) : MEDIA.durationOf(path.join(dir, file)).then((dur) => ({ dur, peaks: null })))
      .then((x) => { p.run('UPDATE ref_media SET dur = ?, peaks_json = ? WHERE id = ?', x.dur, x.peaks ? J(x.peaks) : null, id); }).catch(() => {});
    return { ok: true };
  }
  if (t[0] !== 'image') bad('an image goes here');
  const v = variantById(p, q.variant) || defaultOf(p, r.id);
  const slot = str(q.slot, 60);
  p.tx(() => {
    p.run('UPDATE ref_images SET picked = 0 WHERE variant = ? AND slot = ?', v.id, slot);
    p.run('INSERT INTO ref_images(id, ref, variant, slot, file, provider, picked, by, ts) VALUES (?,?,?,?,?,?,?,?,?)', nid('im'), r.id, v.id, slot, file, 'upload', 1, who, now());
    if (slot === FIRST[r.kind] && v.status !== 'approved') p.run("UPDATE ref_variants SET status = 'review' WHERE id = ?", v.id);
  });
  log(p, who, `uploaded the ${slotLabel(slot, p)} for ${r.name}`, { ref: r.id });
  return { ok: true };
}

// ---------------------------------------------------------------- across projects: a copy, which then changes on its own
export function copyTo(p, rid, toId, who) {
  const r = mustRef(p, rid);
  if (toId === p.id) bad('pick another project');
  const q = openProject(toId);
  const id = nid('r');
  const vmap = {}, pmap = {};
  q.tx(() => {
    q.run('INSERT INTO refs(id, kind, name, keys_json, owner, source, source_info_json, line, fields_json, ai_json, voice_json, voice_ai_json, motion, voice_only, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, r.kind, r.name, J(r.keys || []), who, 'copy', J({ from: p.id, fromName: p.info().name, ref: r.id }), r.line || '', J(r.fields || {}), J(r.ai || []), J(r.voice || {}), J(r.voice_ai || []), r.motion || '', r.voice_only || 0, now(), now());
    for (const x of partsOf(p, r.id)) { pmap[x.id] = nid('pt'); q.run('INSERT INTO ref_parts(id, ref, kind, name, note, data_json, by, pos, main, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', pmap[x.id], id, x.kind, x.name, x.note, J(x.data || {}), x.by, x.pos, x.main, now()); }
    for (const v of variantsOf(p, r.id)) { vmap[v.id] = nid('v'); q.run('INSERT INTO ref_variants(id, ref, name, start_scene, delta, status, version, origin_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)', vmap[v.id], id, v.name, v.start_scene ? 'unplaced' : null, v.delta, v.status === 'approved' ? 'review' : v.status, 0, J({ copiedFrom: p.id }), now()); }
    const to = path.join(q.dir, 'files', 'refs', id);
    fs.mkdirSync(to, { recursive: true });
    for (const x of p.all('SELECT * FROM ref_images WHERE ref = ? AND picked = 1', r.id)) {
      const slot = x.slot.startsWith('part:') ? (pmap[x.slot.slice(5)] ? `part:${pmap[x.slot.slice(5)]}` : null) : x.slot;
      if (!slot || !vmap[x.variant]) continue;
      try { fs.copyFileSync(path.join(dirOf(p, r.id), x.file), path.join(to, x.file)); } catch { continue; }
      q.run('INSERT INTO ref_images(id, ref, variant, slot, file, prompt, provider, opt, picked, by, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)', nid('im'), id, vmap[x.variant], slot, x.file, x.prompt, x.provider, x.opt, 1, who, now());
    }
    for (const x of p.all('SELECT * FROM ref_media WHERE ref = ? ORDER BY ts DESC', r.id).filter((x, i, l) => l.findIndex((y) => y.kind === x.kind) === i)) {
      try { fs.copyFileSync(path.join(dirOf(p, r.id), x.file), path.join(to, x.file)); } catch { continue; }
      q.run('INSERT INTO ref_media(id, ref, kind, file, dur, peaks_json, made_from, provider, by, ts) VALUES (?,?,?,?,?,?,?,?,?,?)', nid('md'), id, x.kind, x.file, x.dur, x.peaks_json, x.made_from, x.provider, who, now());
    }
  });
  q.log('references', 'refs', `copied ${r.name} in from “${p.info().name}”`, who, { ref: id });
  log(p, who, `copied ${r.name} into “${q.info().name}”`, { ref: r.id });
  return { ok: true, project: toId, id };
}

// ---------------------------------------------------------------- from the other sections
// Brainstorm → Promoted → Send, for a Character card: it lands here (and the Judge's list of names keeps it)
export function fromCard(p, card, who) {
  const f = card.fields || {};
  const text = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')).trim();
  const key = charKey(text(f.name) || card.title);
  if (!key) bad('the card has no name');
  let r = p.all("SELECT * FROM refs WHERE kind = 'character'").map(row).find((x) => (x.keys || []).includes(key));
  if (r && r.deleted_at) p.run('UPDATE refs SET deleted_at = NULL WHERE id = ?', r.id);
  if (!r) {
    const id = createRef(p, { kind: 'character', name: display(key), keys: [key], owner: who, source: 'brainstorm', sourceInfo: { card: card.id, session: card.session, title: card.title }, line: text(f.role).slice(0, 120), fields: { more: text(f.look) }, voice: text(f.voice_notes) ? { pitch: text(f.voice_notes) } : {}, who });
    r = refById(p, id);
    log(p, who, `${r.name} came into References from Brainstorm (“${card.title}”)`, { ref: id, card: card.id });
  } else {
    const fields = { ...(r.fields || {}) };
    if (text(f.look) && !fields.more) fields.more = text(f.look);
    p.run('UPDATE refs SET fields_json = ?, line = CASE WHEN line = \'\' THEN ? ELSE line END, updated_at = ? WHERE id = ?', J(fields), text(f.role).slice(0, 120), now(), r.id);
    log(p, who, `${r.name}’s card in References took in “${card.title}” from Brainstorm`, { ref: r.id, card: card.id });
  }
  enqueue(p, 'ref_describe', who, { ref: r.id, card: { title: card.title, note: card.note, fields: card.fields } });
  return { id: r.id, name: r.name };
}
// the Judge, locking a scene, saw a lasting change (a scar, a haircut, the burned café): it becomes a variant from that scene
export function lasting(p, { scene, changes = [], by = null }) {
  const refs = p.all('SELECT * FROM refs WHERE deleted_at IS NULL').map(row);
  let n = 0;
  for (const c of (Array.isArray(changes) ? changes : []).slice(0, 8)) {
    const who = String(c?.who || c?.ref || '').trim();
    const what = str(c?.what || c?.change, 600).trim();
    if (!who || !what) continue;
    const k = charKey(who), K = who.toUpperCase();
    const r = refs.find((x) => (x.keys || []).includes(k) || (x.keys || []).includes(K) || x.name.toLowerCase() === who.toLowerCase());
    if (!r) continue;
    if (p.one('SELECT 1 FROM ref_variants WHERE ref = ? AND start_scene = ? AND delta = ?', r.id, scene, what)) continue;
    const name = str(c.name, 40).trim() || what.split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:]+$/, '').replace(/^./, (x) => x.toUpperCase());
    p.run('INSERT INTO ref_variants(id, ref, name, start_scene, delta, status, origin_json, created_at) VALUES (?,?,?,?,?,?,?,?)', nid('v'), r.id, name, scene, what, 'awaiting', J({ by: 'judge', lockedBy: by, scene }), now());
    p.log('references', 'refs', `the Judge saw a lasting change for ${r.name}: “${name}”, from the scene just locked`, 'bot', { ref: r.id });
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- the bot's side (one queue with the Script; same reply route)
function scriptLines(p, m, r) {
  const out = [];
  if (!m.mainId) return out;
  const rows = p.all('SELECT scene, type, data_json FROM blocks WHERE draft = ? ORDER BY scene, pos', m.mainId);
  const nameRe = r.keys?.length ? new RegExp(r.keys.map(reEsc).join('|'), 'i') : new RegExp(reEsc(r.name), 'i');
  for (const b of rows) {
    const d = P(b.data_json, {}); if (d.alt) continue;
    const sc = m.scenes[b.scene]; const tag = sc?.num ? `sc. ${sc.num}` : 'not placed';
    if (r.kind === 'character') {
      if (b.type === 'dialogue' && r.keys?.includes(charKey(d.character))) out.push(`${tag} · ${d.character}${d.paren ? ` (${d.paren})` : ''}: ${d.line}`);
      else if (b.type === 'action' && nameRe.test(d.text || '')) out.push(`${tag} · ${d.text}`);
    } else if (r.kind === 'location') {
      if (sc?.place && r.keys?.includes(sc.place) && (b.type === 'heading' || (b.type === 'action' && out.filter((x) => x.startsWith(tag)).length < 3))) out.push(`${tag} · ${b.type === 'heading' ? `${d.intExt || ''} ${d.location || ''} ${d.time ? `- ${d.time}` : ''}`.trim() : d.text}`);
    } else if (b.type === 'action' && nameRe.test(d.text || '')) out.push(`${tag} · ${d.text}`);
    if (out.length >= 30) break;
  }
  return out;
}
function jobContext(p, j) {
  const r = refById(p, j.ref);
  if (!r || r.deleted_at) return { error: 'that reference is gone — reply {"skip":true}' };
  const m = scriptMap(p);
  const info = p.info();
  const card = { kind: r.kind, name: r.name, line: r.line, fields: Object.fromEntries(FIELDS[r.kind].map(([k, l]) => [k, { label: l, value: r.fields?.[k] || '' }])), ...(r.kind === 'character' ? { voice: Object.fromEntries(VOICE.map(([k, l]) => [k, { label: l, value: r.voice?.[k] || '' }])), motion: r.motion || '', voiceOnly: !!r.voice_only } : {}), parts: partsOf(p, r.id).map((x) => ({ kind: x.kind, name: x.name, note: x.note || x.data?.quality || '' })) };
  const story = { title: info.name, logline: info.logline, facts: p.all('SELECT fact FROM facts ORDER BY at').map((f) => f.fact).slice(0, 60) };
  if (j.type === 'ref_describe') {
    const hasParts = (k) => card.parts.some((x) => x.kind === k);
    return {
      task: `Fill in the blanks of this ${r.kind} reference, so the image step can draw it the same in every shot. Only the fields listed in "blanks" (the team may have typed the rest). Concrete and visual, a few words to a sentence each, true to the script and the facts. No time of day, weather or temporary states (wet, crying, muddy): the script decides those.${r.kind === 'location' ? ' If it has no elements, textures or lights yet, suggest a few: the fixed things in the place, its surfaces, its own light sources (not the time of day).' : ''}${r.kind === 'character' ? ' Also the voice (how they sound) and motion (how they move) when blank; the sample line is one short line in their voice, from the script if one fits.' : ''}`,
      reference: card, blanks: blanks(r), voiceBlanks: voiceBlanks(r), motionBlank: r.kind === 'character' && !r.motion, script: scriptLines(p, m, r), story, card: j.card || null,
      reply: r.kind === 'character' ? { line: '40s · the caller', fields: { build: 'Tall, heavy-set, moves carefully' }, voice: { pitch: 'Soft, low, never raised', sample: '“Have you read it?”' }, motion: 'Slow and deliberate…' }
        : r.kind === 'location' ? { line: 'Exterior · the roof of her building', fields: { mood: 'High, open, nowhere to hide' }, ...(hasParts('element') ? {} : { elements: [{ name: 'Water tanks', note: 'Two, on legs, on the left' }] }), ...(hasParts('texture') ? {} : { textures: [{ name: 'Roof concrete', note: 'tar patches' }] }), ...(hasParts('light') ? {} : { lights: [{ name: 'Caged bulb', quality: 'Cold · hard · over the stairwell door' }] }) }
          : { line: 'Hand-sized · paper', fields: { material: 'Heavy brown paper, red wax' } },
    };
  }
  if (j.type === 'ref_check') return {
    task: 'Continuity Judge, a text check on a reference: compare its description (and its lasting changes) with the Story Bible facts and the script. Report contradictions only ("the Bible says blue eyes, the card says brown"). An empty list means it is consistent.',
    reference: { ...card, changes: variantsOf(p, r.id).filter((v) => v.start_scene).map((v) => ({ name: v.name, what: v.delta, from: m.order.indexOf(v.start_scene) >= 0 ? `sc. ${m.order.indexOf(v.start_scene) + 1}` : 'not placed' })) },
    script: scriptLines(p, m, r), story,
    reply: { notes: ['The Bible says … but the card says …'] },
  };
  return { error: 'unknown job — reply {"skip":true}' };
}
export function pendingJob(projects) {
  let best = null;
  for (const p of projects) {
    const r = p.one("SELECT id, ts FROM jobs WHERE section = 'references' AND status = 'pending' ORDER BY ts LIMIT 1");
    if (r && (!best || r.ts < best.ts)) best = { p, id: r.id, ts: r.ts };
  }
  return best;
}
export function deliver(p, id) {
  const j = row(p.one('SELECT * FROM jobs WHERE id = ?', id));
  if (!j || j.status !== 'pending') return null;
  p.run("UPDATE jobs SET status = 'delivered', delivered_at = ? WHERE id = ?", now(), id);
  const payload = j.payload || {};
  let ctx;
  try { ctx = jobContext(p, { ...payload, type: j.type }); } catch (e) { ctx = { error: e.message }; }
  return { section: 'references', project: { id: p.id, name: p.info().name }, job: { id: j.id, type: j.type, by: j.by }, ...ctx, reply_with: `node bot/done.mjs <<'EOF'\n{ ...reply }\nEOF   (project and job default to ${p.id} / ${j.id})` };
}
export function requeueStale(p) {
  const r = p.db.prepare("UPDATE jobs SET status = 'pending' WHERE section = 'references' AND status = 'delivered' AND delivered_at < ?").run(now() - 5 * 60 * 1000);
  if (r.changes) p.touch();
}
export const ownsJob = (p, id) => p.one('SELECT section FROM jobs WHERE id = ?', id)?.section === 'references';
export function botDone(p, b) {
  const j = row(p.one('SELECT * FROM jobs WHERE id = ?', b.job));
  if (!j) throw err(`no such job: ${b.job}`, 404);
  if (j.status === 'done') throw err(`job ${j.id} is already done`);
  const finish = (status, note) => { p.run('UPDATE jobs SET status = ?, done_at = ?, result_json = ? WHERE id = ?', status, now(), J({ note }), j.id); return { ok: true, project: p.id, job: j.id, note, next: 'node bot/wait.mjs' }; };
  if (b.skip) return finish('failed', 'skipped by the bot');
  const r = refById(p, j.payload?.ref);
  if (!r || r.deleted_at) return finish('failed', 'reference gone');
  if (j.type === 'ref_describe') {
    const fields = { ...(r.fields || {}) }, ai = new Set(r.ai || []);
    const voice = { ...(r.voice || {}) }, vai = new Set(r.voice_ai || []);
    let n = 0;
    for (const [k] of FIELDS[r.kind]) { const val = str(b.fields?.[k], 600).trim(); if (val && !String(fields[k] || '').trim()) { fields[k] = val; ai.add(k); n++; } }
    if (r.kind === 'character') for (const [k] of VOICE) { const val = str(b.voice?.[k], 400).trim(); if (val && !String(voice[k] || '').trim()) { voice[k] = val; vai.add(k); n++; } }
    const line = !r.line && str(b.line, 120).trim();
    const motion = r.kind === 'character' && !r.motion && str(b.motion, 800).trim();
    p.tx(() => {
      p.run('UPDATE refs SET fields_json = ?, ai_json = ?, voice_json = ?, voice_ai_json = ?, line = CASE WHEN line = \'\' THEN ? ELSE line END, motion = CASE WHEN motion = \'\' THEN ? ELSE motion END, updated_at = ? WHERE id = ?',
        J(fields), J([...ai]), J(voice), J([...vai]), line || '', motion || '', now(), r.id);
      if (r.kind === 'location') {
        const have = partsOf(p, r.id);
        for (const [kind, list] of [['element', b.elements], ['texture', b.textures], ['light', b.lights]]) {
          if (have.some((x) => x.kind === kind) || !Array.isArray(list)) continue;
          list.slice(0, 6).forEach((x, i) => {
            const name = str(x?.name, 60).trim(); if (!name) return;
            const data = kind === 'light' ? { ...ART.lightOf(name, x.quality || ''), quality: str(x.quality, 200), ai: true } : kind === 'element' ? { crop: ART.autoCrop(i), ai: true } : { ai: true };
            addPartRow(p, r.id, kind, name, kind === 'light' ? '' : str(x.note, 300), data, 'bot', i);
            n++;
          });
        }
      }
    });
    if (n || line || motion) p.log('references', 'refs', `filled in ${r.name}’s blanks (AI-suggested)`, 'bot', { ref: r.id });
    // a location that already has its layout gets its new parts drawn right away
    if (r.kind === 'location') for (const v of variantsOf(p, r.id)) { const f = pickedOf(p, v.id, 'layout'); if (f) { const missing = partsOf(p, r.id).filter((x) => !DRAWN.has(x.kind) && !pickedOf(p, v.id, `part:${x.id}`)).map((x) => `part:${x.id}`); if (missing.length) makeRest(p, r, v, f.opt ?? 0, 'bot', missing).catch(() => {}); } }
    return finish('done', `${n} blanks filled`);
  }
  if (j.type === 'ref_check') {
    const notes = (Array.isArray(b.notes) ? b.notes : []).map((x) => str(typeof x === 'string' ? x : x?.note, 400).trim()).filter(Boolean).slice(0, 8);
    p.run('UPDATE refs SET check_json = ? WHERE id = ?', J({ notes, at: now(), version: defaultOf(p, r.id)?.version || 0 }), r.id);
    if (notes.length) p.log('references', 'refs', `the Judge has ${plural(notes.length, 'note')} on ${r.name}: ${notes[0].slice(0, 120)}`, 'bot', { ref: r.id });
    return finish('done', notes.length ? `${notes.length} notes` : 'consistent');
  }
  return finish('failed', 'unknown job');
}

// file paths for the server's /files/<project>/… route
export const fileOf = (p, rel) => { const base = path.join(p.dir, 'files'); const f = path.normalize(path.join(base, rel)); return f.startsWith(base + path.sep) ? f : null; };
export { listProjects };
