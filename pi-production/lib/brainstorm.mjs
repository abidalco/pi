// Brainstorm — Section 1, on the project file. Same game as the old demo (rounds, blind rounds, cards,
// mini-rounds, candidates → Judge → vote → tie → approval → promoted, wrap), every change a row in pi.db.
// The bot is not in here: it long-polls /api/bot/next (one queue across projects) and answers /api/bot/say.
import { TEMPLATES, PERSONALITIES, MINI_ROUNDS } from './templates.mjs';
import { J, P, nid, now, Project } from './projects.mjs';

export const CONFIG = { templates: TEMPLATES, personalities: PERSONALITIES, miniRounds: MINI_ROUNDS };
const majorityOf = (s) => Math.floor(s.participants.length / 2) + 1;
const tpl = (s) => TEMPLATES[s.type];
const stageOf = (s) => tpl(s).stages[s.stage];
const live = (s) => s.status === 'live';
const err = (msg, code = 400) => Object.assign(new Error(msg), { code });

// the sessions the bot is thinking about right now (a delivery went out, no answer yet); not persisted
const busy = new Set();
const busyKey = (p, sid) => `${p.id}/${sid}`;
export const isBusy = (p, sid) => busy.has(busyKey(p, sid));
export const setBusy = (p, sid, on) => { if (on) busy.add(busyKey(p, sid)); else busy.delete(busyKey(p, sid)); };

// ---------------------------------------------------------------- rows ↔ the objects the game logic works on
const FLOW = ['candidates', 'verdicts', 'thumbs', 'winner', 'tied', 'round'];
const OLD_PHASES = ['judging', 'vote', 'tiebreak', 'approval']; // the ceremony before the one-gesture vote
function sessionObj(row) {
  if (!row) return null;
  const r = Project.row(row);
  const flow = r.flow || {};
  const thumbs = flow.thumbs || {};
  if (!flow.thumbs) { // a session from before: its votes and approvals become thumbs
    const add = (card, who) => { if (!card) return; (thumbs[card] ||= []); if (!thumbs[card].includes(who)) thumbs[card].push(who); };
    for (const [who, card] of Object.entries(flow.votes || {})) add(card, who);
    for (const [who, yes] of Object.entries(flow.approvals || {})) if (yes) add(flow.winner, who);
  }
  return {
    id: r.id, type: r.type, topic: r.topic, seed: r.seed, status: r.status, stage: r.stage, phase: OLD_PHASES.includes(r.phase) ? 'play' : r.phase,
    personality: r.voice || { key: 'director', custom: '' }, participants: r.participants || [],
    createdBy: r.created_by, createdAt: r.created_at, startedAt: r.started_at, closedAt: r.closed_at, origin: r.origin || null, recap: r.recap,
    candidates: flow.candidates || [], verdicts: flow.verdicts || {}, thumbs,
    winner: flow.winner || null, tied: flow.tied || [], round: flow.round || null,
  };
}
export const loadSession = (p, sid) => sessionObj(p.one('SELECT * FROM sessions WHERE id = ?', sid));
export function saveSession(p, s) {
  const flow = {}; for (const k of FLOW) flow[k] = s[k];
  p.run('UPDATE sessions SET status=?, stage=?, phase=?, voice_json=?, participants_json=?, started_at=?, closed_at=?, recap=?, flow_json=? WHERE id=?',
    s.status, s.stage, s.phase, J(s.personality), J(s.participants), s.startedAt || null, s.closedAt || null, s.recap || null, J(flow), s.id);
}
export const listSessions = (p) => p.all('SELECT * FROM sessions ORDER BY created_at DESC').map(sessionObj);
const cardObj = (row) => { if (!row) return null; const r = Project.row(row); return { id: r.id, session: r.session, parent: r.parent, title: r.title, note: r.note, fields: r.fields || {}, author: r.author, sparkedBy: r.sparked_by, status: r.status, alternate: !!r.alternate, reactions: r.reactions || {}, ts: r.ts, promotedTo: r.promoted_to, promotedAt: r.promoted_at }; };
export const loadCard = (p, cid) => cardObj(p.one('SELECT * FROM cards WHERE id = ?', cid));
export const cardsOf = (p, sid) => p.all('SELECT * FROM cards WHERE session = ? ORDER BY ts DESC', sid).map(cardObj);
function saveCard(p, c) {
  p.run('UPDATE cards SET title=?, note=?, fields_json=?, sparked_by=?, status=?, alternate=?, reactions_json=?, promoted_to=?, promoted_at=? WHERE id=?',
    c.title, c.note, J(c.fields), c.sparkedBy, c.status, c.alternate ? 1 : 0, J(c.reactions), c.promotedTo || null, c.promotedAt || null, c.id);
}
const msgObj = (row) => { const r = Project.row(row); return { id: r.id, session: r.session, ts: r.ts, author: r.author, kind: r.kind, text: r.text, picks: r.picks || [], round: r.round || undefined, hidden: !!r.hidden }; };
export const messagesOf = (p, sid) => p.all('SELECT * FROM messages WHERE session = ? ORDER BY ts, rowid', sid).map(msgObj);
const title = (p, id) => p.one('SELECT title FROM cards WHERE id = ?', id)?.title || id;

function addMessage(p, s, m) {
  const msg = { id: nid('m'), session: s.id, ts: now(), kind: 'user', picks: [], hidden: false, ...m };
  p.run('INSERT INTO messages(id, session, ts, author, kind, text, picks_json, round, hidden) VALUES (?,?,?,?,?,?,?,?,?)', msg.id, s.id, msg.ts, msg.author, msg.kind, msg.text, J(msg.picks), msg.round || null, msg.hidden ? 1 : 0);
  return msg;
}
const sys = (p, s, text) => addMessage(p, s, { kind: 'system', author: 'system', text });

function addCard(p, s, c) {
  const card = {
    id: nid('c'), session: s.id, ts: now(),
    title: String(c.title || 'Untitled').slice(0, 120), note: String(c.note || '').slice(0, 2000),
    fields: c.fields && typeof c.fields === 'object' ? c.fields : {},
    author: c.author || 'bot', sparkedBy: c.sparkedBy || null,
    parent: c.parent && p.one('SELECT id FROM cards WHERE id = ? AND session = ?', c.parent, s.id) ? c.parent : null,
    reactions: {}, status: 'active', alternate: false, promotedTo: null, promotedAt: null,
  };
  p.run('INSERT INTO cards(id, session, parent, title, note, fields_json, author, sparked_by, status, alternate, reactions_json, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    card.id, s.id, card.parent, card.title, card.note, J(card.fields), card.author, card.sparkedBy, card.status, 0, '{}', card.ts);
  return card;
}

function join(p, s, who) {
  if (!who) return;
  if (!s.participants.includes(who)) s.participants.push(who);
  p.addPerson(who);
}

// the bot's inbox: one row per thing that happened; the server hands pending rows out in batches
let deliver = () => {};
export const onEnqueue = (fn) => { deliver = fn; };
// the join: a promoted card waits in Brainstorm → Promoted to be cleaned; Send lands it in the Script or the Bible
// (lib/script.mjs land(), wired by the server; returns { say, … })
let landHook = () => null;
let sendLabelHook = () => 'Send';
export const onLand = (land, label) => { landHook = land; sendLabelHook = label; };

// where a session came from, as it stands now: the scene's title and number (or that it's gone)
export function originInfo(p, o) {
  if (!o || o.section !== 'script' || !o.scene) return o || null;
  const draft = (id) => p.one('SELECT id, name, is_main, order_json FROM drafts WHERE id = ?', id);
  let d = draft(o.draft);
  let sc = d && p.one('SELECT title FROM scenes WHERE draft = ? AND id = ?', d.id, o.scene);
  if (!sc) { d = p.one('SELECT id, name, is_main, order_json FROM drafts WHERE is_main = 1'); sc = d && p.one('SELECT title FROM scenes WHERE draft = ? AND id = ?', d.id, o.scene); }
  const n = d ? P(d.order_json, []).indexOf(o.scene) : -1;
  return { ...o, draft: sc ? d.id : o.draft, title: sc?.title || null, num: n < 0 ? null : n + 1, draftName: d ? (d.is_main ? 'Main' : d.name) : null, gone: !sc };
}
function enqueue(p, s, type, payload = {}) {
  p.run('INSERT INTO jobs(id, section, type, by, ts, status, payload_json) VALUES (?,?,?,?,?,?,?)', nid('e'), 'brainstorm', type, payload.who || null, now(), 'pending', J({ session: s.id, ...payload }));
  setImmediate(deliver);
}

// ---------------------------------------------------------------- rounds
function closeRound(p, s, reason, by) {
  const r = s.round;
  if (!r) return;
  s.round = null;
  p.run('UPDATE messages SET hidden = 0 WHERE session = ? AND round = ?', s.id, r.id); // reveal
  const msgs = messagesOf(p, s.id);
  const textOf = (id) => msgs.find((m) => m.id === id)?.text || '';
  const answers = Object.entries(r.answers).map(([who, id]) => ({ who, text: textOf(id) }));
  const extra = r.extra.map((id) => { const m = msgs.find((x) => x.id === id); return m ? { who: m.author, text: m.text } : null; }).filter(Boolean);
  const missing = s.participants.filter((x) => !r.answers[x]);
  if (reason === 'all in') { if (r.blind) sys(p, s, 'Everyone answered.'); }
  else if (!answers.length) sys(p, s, `${by || 'The room'} moved on${reason ? ` (${reason})` : ''} before anyone answered.`);
  else if (missing.length) sys(p, s, `${by || 'The room'} went ahead without ${missing.join(', ')}${reason ? ` (${reason})` : ''}.`);
  enqueue(p, s, 'round_complete', { question: textOf(r.questionMsg), blind: r.blind, answers, extra, missing, reason });
}

// ---------------------------------------------------------------- what the bot sees
export function botContext(p, sid) {
  const s = loadSession(p, sid);
  const t = tpl(s);
  const pers = s.personality.key === 'custom' ? { key: 'custom', name: 'Custom', prompt: s.personality.custom || 'Be yourself.' } : PERSONALITIES[s.personality.key];
  const stage = stageOf(s);
  return {
    project: { id: p.id, name: p.info().name },
    session: { ...s, origin: originInfo(p, s.origin), majority: majorityOf(s) },
    stage: { index: s.stage, of: t.stages.length, ...stage, isLast: s.stage === t.stages.length - 1 },
    template: { key: t.key, name: t.name, promotesTo: t.promotesTo, fields: t.fields, stages: t.stages.map((x) => x.name) },
    personality: pers,
    round: s.round ? { blind: s.round.blind, answered: Object.keys(s.round.answers), waitingOn: s.participants.filter((n) => !s.round.answers[n]) } : null,
    messages: messagesOf(p, sid).slice(-40).map(({ author, kind, text, picks }) => ({ author, kind, text, ...(picks?.length ? { picks } : {}) })),
    cards: cardsOf(p, sid).map(({ id, title, note, fields, author, sparkedBy, status, alternate, reactions, parent }) => ({ id, title, note, fields, author, sparkedBy, status, alternate, parent, reactions: Object.values(reactions).reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {}) })),
    canon: p.all("SELECT c.id, c.title, c.note, c.fields_json, c.promoted_to, s.topic FROM cards c JOIN sessions s ON s.id = c.session WHERE c.status = 'promoted'").map((r) => ({ id: r.id, title: r.title, note: r.note, fields: P(r.fields_json, {}), promotedTo: r.promoted_to, fromSession: r.topic })),
    facts: p.all('SELECT fact, scene_title FROM facts ORDER BY at').map((f) => ({ fact: f.fact, scene: f.scene_title })),
    exceptions: p.all("SELECT ref_json, note, reason FROM exceptions WHERE section = 'brainstorm'").map((x) => ({ card: title(p, P(x.ref_json, {}).card), flag: x.note, reason: x.reason })),
  };
}

// the oldest pending job decides which project and session the bot hears from; the batch is everything pending there
export function pendingBatch(projects) {
  let best = null;
  for (const p of projects) {
    const j = p.one("SELECT ts, payload_json FROM jobs WHERE section = 'brainstorm' AND status = 'pending' ORDER BY ts LIMIT 1");
    if (j && (!best || j.ts < best.ts)) best = { p, ts: j.ts, session: P(j.payload_json, {}).session };
  }
  if (!best) return null;
  const rows = best.p.all("SELECT * FROM jobs WHERE section = 'brainstorm' AND status = 'pending' ORDER BY ts").map(Project.row).filter((j) => j.payload?.session === best.session);
  return { p: best.p, session: best.session, jobs: rows };
}
export function markDelivered(p, jobs) {
  const t = now();
  for (const j of jobs) p.run("UPDATE jobs SET status = 'delivered', delivered_at = ? WHERE id = ?", t, j.id);
}
export const jobEvent = (j) => ({ id: j.id, type: j.type, ts: j.ts, ...(j.payload || {}) });

// ---------------------------------------------------------------- the one-gesture vote
// ☆ nominates a card; 👍 on a nominated card is vote and approval in one. Promote is a plain count, decided at
// once: a majority of 👍 lights it up, nothing else (the AI never decides who may promote). The Judge checks the
// card against canon in the background and its note sits on the card when it lands: advice, never a gate; a card
// promoted over an open question or a contradiction is logged as intentional. Everyone in and nothing at a
// majority → the bot asks its one tiebreak question and names a pick, which lights up Promote too.
const thumbsOf = (s, id) => s.thumbs[id] || [];
export function readiness(s, id) {
  const n = thumbsOf(s, id).length, need = majorityOf(s);
  if (n >= need) return { state: 'ready', n, need };
  if (s.winner === id) return { state: 'ready', n, need, picked: true };
  return { state: 'open', n, need };
}
function dropCandidate(s, id) {
  s.candidates = s.candidates.filter((x) => x !== id);
  delete s.thumbs[id]; delete s.verdicts[id];
  if (s.winner === id) s.winner = null;
  s.tied = s.tied.filter((x) => x !== id);
}
// everyone has thumbed something and nothing has a majority: one tiebreak question
function checkTie(p, s) {
  const judged = s.candidates;
  if (judged.some((id) => thumbsOf(s, id).length >= majorityOf(s))) { s.tied = []; return; }
  const allIn = s.participants.length >= 2 && s.participants.every((who) => judged.some((id) => thumbsOf(s, id).includes(who)));
  if (!allIn || judged.length < 2 || s.winner) return;
  const max = Math.max(...judged.map((id) => thumbsOf(s, id).length));
  const top = judged.filter((id) => thumbsOf(s, id).length === max);
  const tied = top.length > 1 ? top : [...judged].sort((a, b) => thumbsOf(s, b).length - thumbsOf(s, a).length);
  if (s.tied.length === tied.length && tied.every((id) => s.tied.includes(id))) return;
  s.tied = tied;
  sys(p, s, `Everyone voted and nothing has ${majorityOf(s)} of ${s.participants.length}. The bot asks one question to break it.`);
  enqueue(p, s, 'tie', { cards: tied, thumbs: Object.fromEntries(tied.map((id) => [id, thumbsOf(s, id)])) });
}
function promote(p, s, who, id) {
  const card = loadCard(p, id);
  const target = tpl(s).promotesTo;
  card.status = 'promoted'; card.promotedTo = target; card.promotedAt = now();
  saveCard(p, card);
  const by = [...new Set([...thumbsOf(s, id), who])];
  p.run('INSERT INTO promotions(id, card, session, target, approved_by_json, ts) VALUES (?,?,?,?,?,?)', nid('pr'), card.id, s.id, target, J(by), now());
  const v = s.verdicts[id];
  if ((v?.verdict === 'warn' || v?.verdict === 'block') && !v.dismissed) // the Judge's open note goes on record, so it is never raised again
    p.run('INSERT INTO exceptions(id, section, ref_json, note, reason, who, ts) VALUES (?,?,?,?,?,?,?)', nid('ex'), 'brainstorm', J({ card: card.id, session: s.id }), v.note, v.verdict === 'block' ? 'promoted over the Judge’s contradiction' : 'promoted with the Judge’s question open', who, now());
  p.log('brainstorm', 'promoted', `promoted “${card.title}” to ${target}`, who, { session: s.id, card: card.id });
  const waits = 'It waits in Promoted: clean it there, then send it on.';
  sys(p, s, `“${card.title}” promoted to ${target} · ${by.join(', ')}. ${waits}`);
  dropCandidate(s, id);
  enqueue(p, s, 'promoted', { card: card.id, target, by, landed: waits });
}

// ---------------------------------------------------------------- team actions
export function createSession(p, b, who) {
  const t = TEMPLATES[b?.type];
  if (!t) throw err('need a valid type');
  const topic = String(b.topic || '').trim().slice(0, 120) || `${t.name} session`;
  const s = {
    id: nid('s'), type: t.key, topic, seed: String(b.seed || '').trim().slice(0, 8000) || null,
    personality: { key: t.defaultPersonality, custom: '' }, participants: [], createdBy: who, createdAt: now(),
    status: 'lobby', stage: 0, phase: 'play', candidates: [], verdicts: {}, thumbs: {}, winner: null, tied: [], recap: null, round: null,
    origin: b.origin && typeof b.origin === 'object' ? b.origin : null,
  };
  join(p, s, who);
  p.run('INSERT INTO sessions(id, type, topic, seed, status, stage, phase, voice_json, participants_json, created_by, created_at, origin_json, flow_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    s.id, s.type, s.topic, s.seed, s.status, 0, 'play', J(s.personality), J(s.participants), who, s.createdAt, s.origin ? J(s.origin) : null, '{}');
  p.log('brainstorm', 'session', `opened the ${t.name} session “${topic}”`, who, { session: s.id });
  return s;
}

export function sessionAction(p, sid, act, b, who) {
  const s = loadSession(p, sid);
  if (!s) throw err('no such session', 404);
  const done = (extra = {}) => { saveSession(p, s); return { ok: true, ...extra }; };

  if (act === 'join') { if (s.status === 'closed') throw err('closed'); join(p, s, who); return done(); }
  if (act === 'personality') {
    if (s.status === 'closed') throw err('closed');
    const key = PERSONALITIES[b.key] ? b.key : 'director';
    const custom = key === 'custom' ? String(b.custom || '').trim().slice(0, 300) : '';
    join(p, s, who);
    s.personality = { key, custom };
    if (live(s)) {
      if (s.round) closeRound(p, s, 'personality switch', who);
      sys(p, s, `${who} switched the bot to ${key === 'custom' ? custom || 'Custom' : PERSONALITIES[key].name}`);
      enqueue(p, s, 'personality_changed', { who });
    }
    return done();
  }
  if (act === 'start') {
    if (s.status !== 'lobby') throw err('already started');
    join(p, s, who);
    s.status = 'live'; s.startedAt = now();
    sys(p, s, `${tpl(s).name} session started by ${who} · ${s.topic}`);
    p.log('brainstorm', 'started', `started “${s.topic}”`, who, { session: s.id });
    enqueue(p, s, 'session_started', { who, seed: s.seed });
    return done();
  }
  if (s.status !== 'live') throw err(s.status === 'lobby' ? 'not started yet' : 'session is closed');
  join(p, s, who);

  if (act === 'message') {
    const text = String(b.text || '').trim().slice(0, 4000);
    if (!text) throw err('empty');
    if (s.round) {
      const r = s.round;
      const first = !r.answers[who];
      const msg = addMessage(p, s, { author: who, text, round: r.id, hidden: r.blind });
      if (first) r.answers[who] = msg.id; else r.extra.push(msg.id);
      const missing = s.participants.filter((x) => !r.answers[x]);
      if (!missing.length) closeRound(p, s, 'all in');
      return done({ round: true, missing });
    }
    addMessage(p, s, { author: who, text });
    enqueue(p, s, 'message', { who, text });
    return done();
  }
  if (act === 'round-close') { if (!s.round) throw err('no round open'); closeRound(p, s, '', who); return done(); }
  if (act === 'stage') {
    const to = Math.max(0, Math.min(tpl(s).stages.length - 1, s.stage + (Number(b.dir) < 0 ? -1 : 1)));
    if (to === s.stage) return done({ unchanged: true });
    if (s.round) closeRound(p, s, 'stage move', who);
    const from = s.stage; s.stage = to; const st = stageOf(s);
    sys(p, s, `${who} ${to < from ? 'back to' : '→'} ${st.name}`);
    enqueue(p, s, 'stage_changed', { who, from, to, direction: to < from ? 'back' : 'forward' });
    return done();
  }
  if (act === 'mini') {
    const r = MINI_ROUNDS[b.round];
    if (!r) throw err('unknown round');
    const card = b.card ? loadCard(p, b.card) : null;
    if (b.card && (!card || card.session !== s.id)) throw err('no such card here');
    if (r.target === 'card' && !card) throw err(`${r.name} is called on a card`);
    if (s.round) closeRound(p, s, 'mini-round', who);
    sys(p, s, `${who} called ${r.name}${card ? ` on “${card.title}”` : ''}`);
    enqueue(p, s, 'mini_round', { who, round: r.key, card: card ? { id: card.id, title: card.title, note: card.note, fields: card.fields } : null });
    return done();
  }
  if (act === 'promote') {
    const id = String(b.card || '');
    if (!s.candidates.includes(id)) throw err('nominate it first (☆)');
    const r = readiness(s, id);
    if (r.state !== 'ready') throw err(`it needs ${r.need} of ${s.participants.length} 👍 (it has ${r.n})`);
    promote(p, s, who, id);
    return done();
  }
  if (act === 'wrap') {
    if (s.phase === 'wrapping') return done();
    if (s.round) closeRound(p, s, 'wrap', who);
    s.phase = 'wrapping';
    sys(p, s, `${who} is wrapping up. The bot writes the recap…`);
    enqueue(p, s, 'wrap', { who });
    return done();
  }
  throw err('unknown action', 404);
}

export function createCard(p, b, who) {
  const s = loadSession(p, b?.session);
  if (!s) throw err('need a session');
  if (!live(s)) throw err('session not live');
  if (!String(b.title || '').trim()) throw err('title?');
  join(p, s, who); saveSession(p, s);
  return addCard(p, s, { title: b.title, note: b.note, author: who, sparkedBy: who });
}

export function cardAction(p, cid, act, b, who) {
  const card = loadCard(p, cid);
  if (!card) throw err('no such card', 404);
  const s = loadSession(p, card.session);
  if (!live(s)) throw err('session not live');
  join(p, s, who);
  if (act === 'status') {
    const st = b.status;
    if (!['active', 'candidate', 'parked', 'discarded'].includes(st)) throw err('bad status');
    if (card.status === 'promoted') throw err('promoted cards are canon; amend by vote');
    const was = card.status;
    card.status = st;
    if (st === 'candidate') {
      card.alternate = false; saveCard(p, card);
      if (!s.candidates.includes(card.id)) s.candidates.push(card.id);
      sys(p, s, `${who} nominated “${card.title}” · vote 👍`);
      if (!s.verdicts[card.id]) enqueue(p, s, 'judge', { who, cards: [card.id] });
    } else {
      saveCard(p, card);
      if (was === 'candidate') { dropCandidate(s, card.id); sys(p, s, `${who} pulled “${card.title}” back (${st})`); checkTie(p, s); }
    }
    saveSession(p, s); return { ok: true };
  }
  if (act === 'thumb') { // vote and approval in one; a second tap takes it back
    if (!s.candidates.includes(card.id)) throw err('nominate it first (☆)');
    const list = (s.thumbs[card.id] ||= []);
    if (list.includes(who)) s.thumbs[card.id] = list.filter((x) => x !== who); else list.push(who);
    checkTie(p, s);
    saveSession(p, s); return { ok: true, thumbs: s.thumbs[card.id] };
  }
  if (act === 'dismiss-flag') {
    const v = s.verdicts[card.id];
    if (!v || v.verdict !== 'warn' || v.dismissed) throw err('no open warning on this card');
    v.dismissed = true; v.dismissedBy = who;
    p.run('INSERT INTO exceptions(id, section, ref_json, note, reason, who, ts) VALUES (?,?,?,?,?,?,?)', nid('ex'), 'brainstorm', J({ card: card.id, session: s.id }), v.note, String(b.reason || 'We know, it’s intentional').slice(0, 300), who, now());
    sys(p, s, `${who}: “We know, it’s intentional” on “${card.title}” — logged, never re-flagged.`);
    saveSession(p, s); return { ok: true };
  }
  if (act === 'edit') {
    if (card.status === 'promoted') throw err('promoted cards are canon');
    if (b.title) card.title = String(b.title).slice(0, 120);
    if (b.note !== undefined) card.note = String(b.note).slice(0, 2000);
    if (b.fields && typeof b.fields === 'object') card.fields = { ...card.fields, ...b.fields };
    saveCard(p, card); return { ok: true };
  }
  throw err('unknown action', 404);
}

// ---------------------------------------------------------------- the bot's reply
export function botSay(p, b) {
  const s = loadSession(p, b.session);
  if (!s) throw err(`no such session: ${b.session}`, 404);
  setBusy(p, s.id, false);
  p.run("UPDATE jobs SET status = 'done', done_at = ? WHERE section = 'brainstorm' AND status = 'delivered' AND json_extract(payload_json, '$.session') = ?", now(), s.id);
  const notes = [];
  const created = [];
  if (Array.isArray(b.cards)) {
    for (const c of b.cards) { if (!c || !c.title) continue; const card = addCard(p, s, { title: c.title, note: c.note, fields: c.fields, author: 'bot', sparkedBy: c.sparkedBy, parent: c.parent }); created.push({ id: card.id, title: card.title }); }
    if (created.length) notes.push(`created ${created.length} card(s)`);
  }
  if (Array.isArray(b.update)) {
    for (const u of b.update) {
      const card = u && loadCard(p, u.id);
      if (!card || card.session !== s.id) { notes.push(`update skipped: unknown card ${u?.id}`); continue; }
      if (card.status === 'promoted') { notes.push(`update skipped: ${card.id} is promoted (canon is amended by vote, not edits)`); continue; }
      if (u.title) card.title = String(u.title).slice(0, 120);
      if (u.note !== undefined) card.note = String(u.note).slice(0, 2000);
      if (u.fields && typeof u.fields === 'object') card.fields = { ...card.fields, ...u.fields };
      if (u.sparkedBy) card.sparkedBy = u.sparkedBy;
      saveCard(p, card); notes.push(`updated ${card.id}`);
    }
  }
  if (typeof b.stage === 'number' && live(s)) {
    const to = Math.max(0, Math.min(tpl(s).stages.length - 1, Math.floor(b.stage)));
    if (to !== s.stage) { s.stage = to; const st = stageOf(s); sys(p, s, `The bot moved to ${st.name}`); notes.push(`stage → ${st.name}`); }
  }
  if (b.text && String(b.text).trim()) {
    const text = String(b.text).trim().slice(0, 4000);
    const picks = Array.isArray(b.picks) ? b.picks.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6).map((x) => x.slice(0, 80)) : [];
    const msg = addMessage(p, s, { kind: 'bot', author: 'bot', text, picks });
    const wantsRound = b.round === 'blind' || b.round === true || (b.round !== false && (picks.length > 0 || /\?\s*$/.test(text)));
    if (wantsRound && live(s) && s.phase !== 'wrapping') {
      s.round = { id: nid('r'), questionMsg: msg.id, blind: b.round === 'blind', openedAt: now(), answers: {}, extra: [] };
      notes.push(`round opened (${s.round.blind ? 'blind' : 'open'}) — you hear back when everyone answered or someone goes ahead`);
    }
  }
  if (Array.isArray(b.verdicts)) {
    for (const v of b.verdicts) {
      if (v && !s.candidates.includes(v.card)) { // promoted before the Judge spoke: its note goes on record with the card
        const c = loadCard(p, v.card);
        if (c?.status === 'promoted' && c.session === s.id && ['warn', 'block'].includes(v.verdict)) {
          p.run('INSERT INTO exceptions(id, section, ref_json, note, reason, who, ts) VALUES (?,?,?,?,?,?,?)', nid('ex'), 'brainstorm', J({ card: c.id, session: s.id }), String(v.note || '').slice(0, 600), 'promoted before the Judge’s note came in', 'bot', now());
          sys(p, s, `Judge, after the vote · ${v.verdict === 'warn' ? 'a question' : 'a contradiction'} · “${c.title}”${v.note ? ` — ${v.note}` : ''} · logged with the promoted card`);
          notes.push(`verdict on ${v.card} (already promoted): logged`);
        } else notes.push(`verdict on ${v.card}: it was already decided, nothing to do`);
        continue;
      }
      if (!v) continue;
      const verdict = ['ok', 'warn', 'block'].includes(v.verdict) ? v.verdict : 'ok';
      s.verdicts[v.card] = { verdict, note: String(v.note || '').slice(0, 600), dismissed: false, ts: now() };
      sys(p, s, `Judge · ${verdict === 'ok' ? 'consistent' : verdict === 'warn' ? 'a question' : 'a contradiction'} · “${title(p, v.card)}”${v.note ? ` — ${v.note}` : ''}`);
      notes.push(`verdict on ${v.card}: ${verdict}`);
    }
    checkTie(p, s);
  }
  if (b.result) {
    if (!s.tied.includes(b.result)) notes.push(`result ignored: ${b.result} is not in the tie`);
    else { s.winner = b.result; s.tied = []; sys(p, s, `The bot’s pick: “${title(p, s.winner)}”. Anyone can promote it now.`); notes.push('tiebreak → pick made; Promote is lit'); }
  }
  if (b.recap) {
    if (s.phase !== 'wrapping') notes.push('recap ignored: nobody asked to wrap');
    else {
      s.recap = String(b.recap).slice(0, 6000); s.status = 'closed'; s.phase = 'closed'; s.closedAt = now();
      p.run("UPDATE cards SET status = 'parked' WHERE session = ? AND status = 'candidate'", s.id);
      sys(p, s, 'Session closed. Cards stay usable.');
      p.log('brainstorm', 'wrapped', `wrapped “${s.topic}”`, 'bot', { session: s.id });
      notes.push('session closed');
    }
  }
  saveSession(p, s);
  const st = stageOf(s);
  return { ok: true, project: p.id, session: s.id, phase: s.phase, status: s.status, stage: `${s.stage + 1}/${tpl(s).stages.length} ${st.name}`, created, notes };
}


// ---------------------------------------------------------------- Promoted: the cards the team decided on, cleaned before they go on
export function promotedList(p) {
  return p.all("SELECT c.*, s.type, s.topic, s.origin_json, s.status AS s_status, (SELECT landed_json FROM promotions pr WHERE pr.card = c.id ORDER BY pr.ts DESC LIMIT 1) AS landed_json FROM cards c JOIN sessions s ON s.id = c.session WHERE c.status = 'promoted' ORDER BY c.promoted_at DESC")
    .map((r) => {
      const c = cardObj(r);
      const card = { ...c, type: r.type, topic: r.topic, origin: originInfo(p, P(r.origin_json)), landed: P(r.landed_json) };
      return { ...card, send: sendLabelHook(p, { ...card, origin: P(r.origin_json) }) };
    });
}
export function promotedAction(p, cid, act, b, who) {
  const card = loadCard(p, cid);
  if (!card || card.status !== 'promoted') throw err('that card isn’t promoted', 404);
  if (act === 'edit') {
    if (b.title !== undefined) card.title = String(b.title).trim().slice(0, 120) || card.title;
    if (b.note !== undefined) card.note = String(b.note).slice(0, 4000);
    if (b.fields && typeof b.fields === 'object') for (const [k, v] of Object.entries(b.fields)) if (/^[a-z_]{1,40}$/.test(k)) card.fields[k] = String(v ?? '').slice(0, 4000);
    saveCard(p, card);
    // one history line per card per person while they're cleaning it, not one per keystroke
    const recent = p.one("SELECT id FROM events WHERE section = 'brainstorm' AND kind = 'cleaned' AND who = ? AND ts > ? AND json_extract(ref_json, '$.card') = ? ORDER BY ts DESC LIMIT 1", who, now() - 15 * 60 * 1000, card.id);
    if (recent) p.run('UPDATE events SET ts = ?, text = ? WHERE id = ?', now(), `cleaned up the promoted card “${card.title}”`, recent.id);
    else p.log('brainstorm', 'cleaned', `cleaned up the promoted card “${card.title}”`, who, { card: card.id, session: card.session });
    return { ok: true };
  }
  if (act === 'send') {
    const landed = landHook(p, card.id, who, { scene: b.scene || null });
    p.log('brainstorm', 'sent', `sent “${card.title}” on: ${landed.say}`, who, { card: card.id, session: card.session });
    return { ok: true, landed };
  }
  throw err('unknown action', 404);
}

// ---------------------------------------------------------------- what a tab sees
export function publicState(p, sid, botOnline) {
  const sessions = listSessions(p).map((s) => ({ ...s, origin: originInfo(p, s.origin), botBusy: isBusy(p, s.id), cards: p.one("SELECT count(*) AS n FROM cards WHERE session = ? AND status != 'discarded'", s.id).n }));
  const s = sid ? sessions.find((x) => x.id === sid) || null : null;
  return {
    sessions,
    session: s,
    promoted: promotedList(p),
    scenes: (() => { const m = p.one('SELECT id, order_json FROM drafts WHERE is_main = 1'); if (!m) return []; const order = P(m.order_json, []); const t = Object.fromEntries(p.all('SELECT id, title FROM scenes WHERE draft = ?', m.id).map((r) => [r.id, r.title])); return order.filter((id) => t[id]).map((id, i) => ({ id, num: i + 1, title: t[id] })); })(),
    landings: s ? Object.fromEntries(p.all('SELECT card, landed_json FROM promotions WHERE session = ? AND landed_json IS NOT NULL', s.id).map((r) => [r.card, P(r.landed_json)])) : {},
    messages: s ? messagesOf(p, s.id) : [],
    cards: s ? cardsOf(p, s.id) : [],
    exceptions: p.all("SELECT ref_json, note, reason, who, ts FROM exceptions WHERE section = 'brainstorm'").map((x) => ({ ...P(x.ref_json, {}), note: x.note, reason: x.reason, who: x.who, ts: x.ts })),
    botOnline,
  };
}
