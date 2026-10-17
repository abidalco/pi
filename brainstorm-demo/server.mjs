// π production system · Section 1 Brainstorming — demo server.
// Zero dependencies. One JSON file. SSE pushes the whole state to every open tab.
// The bot is not in here: a Claude Code terminal long-polls /api/bot/next and
// answers through /api/bot/say (see bot/wait.mjs, bot/say.mjs, BOT.md).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, PERSONALITIES, MINI_ROUNDS, REACTIONS } from './lib/templates.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const argv = process.argv.slice(2);
const flag = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const PORT = Number(flag('port') || process.env.PORT || 3142);
const DATA_DIR = flag('data') || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BOT_SEEN_WINDOW = 3 * 60 * 1000; // "online" if the bot polled within 3 min

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------- state
const fresh = () => ({
  project: { name: 'Demo project', members: [] },
  seq: 0,
  sessions: {},   // id → Session
  cards: {},      // id → Card
  messages: {},   // sessionId → Message[]
  promotions: [], // { card, session, target, approvedBy, ts }
  exceptions: [], // dismissed ⚠️ flags — the Story Bible's "Intentional Exceptions"
  events: [],     // bot inbox (append-only, delivered flag)
});

let S = fresh();
if (!argv.includes('--reset') && fs.existsSync(STATE_FILE)) {
  try { S = { ...fresh(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; }
  catch (e) { console.error('state.json unreadable, starting fresh:', e.message); }
}
for (const s of Object.values(S.sessions)) {
  s.botBusy = false; // nobody is thinking after a restart
  if (s.round === undefined) s.round = null;
  if (!PERSONALITIES[s.personality?.key]) s.personality = { key: 'trickster', custom: '' }; // retired personalities
}

const nid = (p) => `${p}${(++S.seq).toString(36)}`;
const now = () => Date.now();

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(S, null, 1)); }
    catch (e) { console.error(`state not saved (${e.code}): ${e.message}`); } // a full disk must not kill the demo
  }, 60);
}

// ---------------------------------------------------------------- live sync
const clients = new Set();
let botWaiter = null;        // pending long-poll { res, timer }
let botLastSeen = 0;

function botOnline() { return !!botWaiter || now() - botLastSeen < BOT_SEEN_WINDOW; }

function publicState() {
  const { events, ...rest } = S;
  return {
    ...rest,
    botOnline: botOnline(),
    botWaiting: !!botWaiter,
    pendingEvents: events.filter((e) => !e.delivered).length,
    templates: TEMPLATES,
    personalities: PERSONALITIES,
    miniRounds: MINI_ROUNDS,
    reactions: REACTIONS,
  };
}

function changed() {
  save();
  const data = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const res of clients) res.write(data);
}

// ---------------------------------------------------------------- helpers
const majorityOf = (s) => Math.floor(s.participants.length / 2) + 1;
const tpl = (s) => TEMPLATES[s.type];
const stageOf = (s) => tpl(s).stages[s.stage];
const sessionCards = (sid) => Object.values(S.cards).filter((c) => c.session === sid);
const title = (id) => S.cards[id]?.title || id;

function addMessage(sid, m) {
  const msg = { id: nid('m'), session: sid, ts: now(), kind: 'user', picks: [], ...m };
  (S.messages[sid] ||= []).push(msg);
  return msg;
}
const sys = (s, text) => addMessage(s.id, { kind: 'system', author: 'system', text });

function addCard(sid, c) {
  const card = {
    id: nid('c'), session: sid, ts: now(),
    title: String(c.title || 'Untitled').slice(0, 120),
    note: String(c.note || '').slice(0, 2000),
    fields: c.fields && typeof c.fields === 'object' ? c.fields : {},
    author: c.author || 'bot',           // who wrote it down
    sparkedBy: c.sparkedBy || null,      // credit: who sparked it
    parent: c.parent && S.cards[c.parent] ? c.parent : null,
    reactions: {},                       // name → '👍' | '🔥' | '❌'
    status: 'active',                    // active → candidate → promoted / parked / discarded
    alternate: false,
    promotedTo: null,
  };
  S.cards[card.id] = card;
  return card;
}

function join(s, who) {
  if (!who) return;
  if (!s.participants.includes(who)) s.participants.push(who);
  if (!S.project.members.includes(who)) S.project.members.push(who);
}

// Bot inbox -------------------------------------------------------------
function enqueue(type, s, payload = {}) {
  S.events.push({ id: nid('e'), type, session: s.id, ts: now(), delivered: false, ...payload });
  setImmediate(tryDeliver); // so several enqueues from one request reach the bot as one batch
}

// Rounds: the bot asks, everyone answers once, the bot speaks once to the set.
// Messages during an open round are not events; the closed round is one event.
function closeRound(s, reason, by) {
  const r = s.round;
  if (!r) return;
  s.round = null;
  const msgs = S.messages[s.id] || [];
  for (const m of msgs) if (m.round === r.id) m.hidden = false; // reveal
  const textOf = (id) => msgs.find((m) => m.id === id)?.text || '';
  const answers = Object.entries(r.answers).map(([who, id]) => ({ who, text: textOf(id) }));
  const extra = r.extra.map((id) => { const m = msgs.find((x) => x.id === id); return m ? { who: m.author, text: m.text } : null; }).filter(Boolean);
  const missing = s.participants.filter((p) => !r.answers[p]);
  if (reason === 'all in') { if (r.blind) sys(s, '🔓 Everyone answered.'); }
  else if (!answers.length) sys(s, `${by || 'The room'} moved on${reason ? ` (${reason})` : ''} before anyone answered.`);
  else if (missing.length) sys(s, `${by || 'The room'} went ahead without ${missing.join(', ')}${reason ? ` (${reason})` : ''}.`);
  enqueue('round_complete', s, { question: textOf(r.questionMsg), blind: r.blind, answers, extra, missing, reason });
}

function botContext(sid) {
  const s = S.sessions[sid];
  const t = tpl(s);
  const p = s.personality.key === 'custom'
    ? { key: 'custom', name: 'Custom', prompt: s.personality.custom || 'Be yourself.' }
    : PERSONALITIES[s.personality.key];
  const { botBusy, ...session } = s;
  const stage = stageOf(s);
  return {
    session: { ...session, majority: majorityOf(s) },
    stage: { index: s.stage, of: t.stages.length, ...stage, isLast: s.stage === t.stages.length - 1 },
    template: { key: t.key, name: t.name, promotesTo: t.promotesTo, fields: t.fields, stages: t.stages.map((x) => `${x.icon} ${x.name}`) },
    personality: p,
    round: s.round ? { blind: s.round.blind, answered: Object.keys(s.round.answers), waitingOn: s.participants.filter((n) => !s.round.answers[n]) } : null,
    messages: (S.messages[sid] || []).slice(-40).map(({ author, kind, text, picks }) => ({ author, kind, text, ...(picks?.length ? { picks } : {}) })),
    cards: sessionCards(sid).map(({ id, title, note, fields, author, sparkedBy, status, alternate, reactions, parent }) => ({
      id, title, note, fields, author, sparkedBy, status, alternate, parent,
      reactions: Object.values(reactions).reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {}),
    })),
    canon: Object.values(S.cards).filter((c) => c.status === 'promoted').map(({ id, title, note, fields, promotedTo, session }) => ({
      id, title, note, fields, promotedTo, fromSession: S.sessions[session]?.topic,
    })),
    exceptions: S.exceptions.map(({ card, note, reason }) => ({ card: title(card), flag: note, reason })),
  };
}

function tryDeliver() {
  if (!botWaiter) return;
  const pending = S.events.filter((e) => !e.delivered);
  if (!pending.length) return;
  const sid = pending[0].session;
  const batch = pending.filter((e) => e.session === sid);
  for (const e of batch) e.delivered = true;
  const s = S.sessions[sid];
  s.botBusy = true;
  const { res, timer } = botWaiter;
  clearTimeout(timer);
  botWaiter = null;
  botLastSeen = now();
  json(res, { events: batch.map(({ delivered, ...e }) => e), ...botContext(sid) });
  changed();
}

// Promotion flow ------------------------------------------------------------
// judging → (vote → tiebreak) → approval → promoted. Any candidate change re-settles.
function unresolvedCandidates(s) {
  return s.candidates.filter((id) => {
    const v = s.verdicts[id];
    return !v || v.verdict === 'block' || (v.verdict === 'warn' && !v.dismissed);
  });
}

function settle(s) {
  s.candidates = s.candidates.filter((id) => S.cards[id]?.status === 'candidate');
  if (s.phase === 'judging' && unresolvedCandidates(s).length) return;
  const n = s.candidates.length;
  if (n === 0) {
    if (s.phase !== 'play') sys(s, 'No candidates left. Back to play.');
    s.phase = 'play'; s.winner = null; s.votes = {}; s.approvals = {}; s.tied = [];
    return;
  }
  if (n === 1) {
    if (s.phase !== 'approval' || s.winner !== s.candidates[0]) {
      s.winner = s.candidates[0]; s.phase = 'approval'; s.approvals = {}; s.tied = [];
      sys(s, `⚖️ Cleared. "${title(s.winner)}" needs 👍 from ${majorityOf(s)} of ${s.participants.length} to be promoted.`);
    }
    return;
  }
  if (s.phase === 'approval' && s.candidates.includes(s.winner)) return;
  if (s.phase === 'tiebreak' && s.tied.every((id) => s.candidates.includes(id))) return;
  s.phase = 'vote'; s.votes = {}; s.winner = null; s.tied = [];
  sys(s, `🗳️ Vote: ${n} candidates. Everyone picks one.`);
}

function tally(s) {
  const counts = {};
  for (const c of Object.values(s.votes)) counts[c] = (counts[c] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = s.candidates.filter((id) => (counts[id] || 0) === max);
  if (top.length === 1) {
    s.winner = top[0]; s.phase = 'approval'; s.approvals = {};
    sys(s, `🗳️ "${title(s.winner)}" wins the vote. Now 👍 from ${majorityOf(s)} of ${s.participants.length}.`);
  } else {
    s.tied = top; s.phase = 'tiebreak';
    sys(s, `🎲 Tie between ${top.map((id) => `"${title(id)}"`).join(' and ')}. The bot runs a quick Q&A.`);
    enqueue('tie', s, { cards: top });
  }
}

function promote(s) {
  const card = S.cards[s.winner];
  const target = tpl(s).promotesTo;
  card.status = 'promoted'; card.promotedTo = target; card.promotedAt = now();
  S.promotions.push({ card: card.id, session: s.id, target, approvedBy: Object.keys(s.approvals).filter((k) => s.approvals[k]), ts: now() });
  const others = s.candidates.filter((id) => id !== card.id);
  for (const id of others) { S.cards[id].status = 'parked'; S.cards[id].alternate = true; }
  sys(s, `✅ "${card.title}" promoted to ${target}.${others.length ? ` ${others.length} alternate${others.length > 1 ? 's' : ''} parked.` : ''}`);
  s.phase = 'play'; s.winner = null; s.candidates = []; s.votes = {}; s.approvals = {}; s.tied = []; s.verdicts = {};
  enqueue('promoted', s, { card: card.id, target, alternates: others });
}

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
  if (p === '/' || p.startsWith('/s/')) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const live = (s) => s.status === 'live';
const name = (b) => String(b?.who || '').trim().slice(0, 40);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // ---- live state
  if (p === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (p === '/api/state' && req.method === 'GET') return json(res, publicState());

  // ---- bot side
  if (p === '/api/bot/next' && req.method === 'GET') {
    botLastSeen = now();
    if (url.searchParams.get('fresh')) for (const e of S.events) e.delivered = true;
    if (botWaiter) { clearTimeout(botWaiter.timer); json(botWaiter.res, { idle: true, replaced: true }); botWaiter = null; }
    const timeout = Math.min(Number(url.searchParams.get('timeout')) || 100000, 590000);
    const timer = setTimeout(() => { if (botWaiter?.res === res) { botWaiter = null; json(res, { idle: true }); changed(); } }, timeout);
    botWaiter = { res, timer };
    req.on('close', () => { if (botWaiter?.res === res) { clearTimeout(timer); botWaiter = null; changed(); } });
    tryDeliver();
    if (botWaiter) changed(); // now online
    return;
  }
  if (p === '/api/bot/context' && req.method === 'GET') {
    const s = S.sessions[url.searchParams.get('session')];
    if (!s) return fail(res, 'no such session', 404);
    return json(res, botContext(s.id));
  }
  if (p === '/api/bot/say' && req.method === 'POST') {
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    const s = S.sessions[b.session];
    if (!s) return fail(res, `no such session: ${b.session}`, 404);
    botLastSeen = now();
    s.botBusy = false;
    const notes = [];
    const created = [];
    if (Array.isArray(b.cards)) {
      for (const c of b.cards) {
        if (!c || !c.title) continue;
        const card = addCard(s.id, { title: c.title, note: c.note, fields: c.fields, author: 'bot', sparkedBy: c.sparkedBy, parent: c.parent });
        created.push({ id: card.id, title: card.title });
      }
      if (created.length) notes.push(`created ${created.length} card(s)`);
    }
    if (Array.isArray(b.update)) {
      for (const u of b.update) {
        const card = u && S.cards[u.id];
        if (!card || card.session !== s.id) { notes.push(`update skipped: unknown card ${u?.id}`); continue; }
        if (card.status === 'promoted') { notes.push(`update skipped: ${card.id} is promoted (canon is amended by vote, not edits)`); continue; }
        if (u.title) card.title = String(u.title).slice(0, 120);
        if (u.note !== undefined) card.note = String(u.note).slice(0, 2000);
        if (u.fields && typeof u.fields === 'object') card.fields = { ...card.fields, ...u.fields };
        if (u.sparkedBy) card.sparkedBy = u.sparkedBy;
        notes.push(`updated ${card.id}`);
      }
    }
    if (typeof b.stage === 'number' && live(s)) {
      const to = Math.max(0, Math.min(tpl(s).stages.length - 1, Math.floor(b.stage)));
      if (to !== s.stage) { s.stage = to; const st = stageOf(s); sys(s, `🤖 moved to ${st.icon} ${st.name}`); notes.push(`stage → ${st.name}`); }
    }
    if (b.text && String(b.text).trim()) {
      const text = String(b.text).trim().slice(0, 4000);
      const picks = Array.isArray(b.picks) ? b.picks.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6).map((x) => x.slice(0, 80)) : [];
      const msg = addMessage(s.id, { kind: 'bot', author: 'bot', text, picks });
      // a question opens a round unless the bot says round:false
      const wantsRound = b.round === 'blind' || b.round === true || (b.round !== false && (picks.length > 0 || /\?\s*$/.test(text)));
      if (wantsRound && live(s) && s.phase !== 'wrapping') {
        s.round = { id: nid('r'), questionMsg: msg.id, blind: b.round === 'blind', openedAt: now(), answers: {}, extra: [] };
        notes.push(`round opened (${s.round.blind ? 'blind' : 'open'}) — you hear back when everyone answered or someone goes ahead`);
      }
    }
    if (Array.isArray(b.verdicts)) {
      if (s.phase !== 'judging') notes.push('verdicts ignored: not in judging phase');
      else {
        for (const v of b.verdicts) {
          if (!v || !s.candidates.includes(v.card)) { notes.push(`verdict skipped: ${v?.card} is not a candidate`); continue; }
          const verdict = ['ok', 'warn', 'block'].includes(v.verdict) ? v.verdict : 'ok';
          s.verdicts[v.card] = { verdict, note: String(v.note || '').slice(0, 600), dismissed: false, ts: now() };
          const icon = { ok: '✅', warn: '⚠️', block: '❌' }[verdict];
          sys(s, `⚖️ ${icon} "${title(v.card)}"${v.note ? ` — ${v.note}` : ''}`);
        }
        settle(s);
        notes.push(`judging → ${s.phase}`);
      }
    }
    if (b.result) {
      if (s.phase !== 'tiebreak') notes.push('result ignored: not in tiebreak');
      else if (!s.tied.includes(b.result)) notes.push(`result ignored: ${b.result} was not tied`);
      else {
        s.winner = b.result; s.phase = 'approval'; s.approvals = {}; s.tied = [];
        sys(s, `🎲 Tiebreak result: "${title(s.winner)}". Now 👍 from ${majorityOf(s)} of ${s.participants.length}.`);
        notes.push('tiebreak → approval');
      }
    }
    if (b.recap) {
      if (s.phase !== 'wrapping') notes.push('recap ignored: nobody asked to wrap');
      else {
        s.recap = String(b.recap).slice(0, 6000); s.status = 'closed'; s.phase = 'closed'; s.closedAt = now();
        for (const c of sessionCards(s.id)) if (c.status === 'candidate') c.status = 'parked';
        sys(s, '🔒 Session closed. Cards stay usable.');
        notes.push('session closed');
      }
    }
    changed();
    const st = stageOf(s);
    return json(res, { ok: true, session: s.id, phase: s.phase, status: s.status, stage: `${s.stage + 1}/${tpl(s).stages.length} ${st.icon} ${st.name}`, created, notes });
  }

  // ---- team side
  if (p === '/api/reset' && req.method === 'POST') {
    S = fresh();
    if (botWaiter) { clearTimeout(botWaiter.timer); json(botWaiter.res, { idle: true, reset: true }); botWaiter = null; }
    changed();
    return json(res, { ok: true });
  }

  if (p === '/api/session' && req.method === 'POST') {
    const b = await body(req);
    const who = name(b);
    const t = TEMPLATES[b?.type];
    if (!who || !t) return fail(res, 'need who and a valid type');
    const topic = String(b.topic || '').trim().slice(0, 120) || `${t.name} session`;
    const s = {
      id: nid('s'), type: t.key, topic, seed: String(b.seed || '').trim().slice(0, 8000) || null,
      personality: { key: t.defaultPersonality, custom: '' },
      participants: [], createdBy: who, createdAt: now(),
      status: 'lobby', stage: 0, phase: 'play',
      candidates: [], verdicts: {}, votes: {}, approvals: {}, winner: null, tied: [], recap: null, botBusy: false,
      round: null, // { id, questionMsg, blind, openedAt, answers: {name → msgId}, extra: [msgId] }
    };
    S.sessions[s.id] = s;
    S.messages[s.id] = [];
    join(s, who);
    changed();
    return json(res, { ok: true, id: s.id });
  }

  const m = p.match(/^\/api\/session\/([^/]+)\/([a-z-]+)$/);
  if (m && req.method === 'POST') {
    const s = S.sessions[m[1]];
    if (!s) return fail(res, 'no such session', 404);
    const b = await body(req);
    if (!b) return fail(res, 'bad json');
    const who = name(b);
    if (!who) return fail(res, 'who?');
    const act = m[2];

    if (act === 'join') { if (s.status === 'closed') return fail(res, 'closed'); join(s, who); changed(); return json(res, { ok: true }); }

    if (act === 'personality') {
      if (s.status === 'closed') return fail(res, 'closed');
      const key = PERSONALITIES[b.key] ? b.key : 'director';
      const custom = key === 'custom' ? String(b.custom || '').trim().slice(0, 300) : '';
      join(s, who);
      s.personality = { key, custom };
      if (live(s)) {
        if (s.round) closeRound(s, 'personality switch', who);
        const pn = key === 'custom' ? `✏️ ${custom || 'Custom'}` : `${PERSONALITIES[key].emoji} ${PERSONALITIES[key].name}`;
        sys(s, `${who} switched the bot to ${pn}`);
        enqueue('personality_changed', s, { who });
      }
      changed(); return json(res, { ok: true });
    }

    if (act === 'start') {
      if (s.status !== 'lobby') return fail(res, 'already started');
      join(s, who);
      s.status = 'live'; s.startedAt = now();
      sys(s, `${tpl(s).emoji} ${tpl(s).name} session started by ${who} · ${s.topic}`);
      enqueue('session_started', s, { who, seed: s.seed });
      changed(); return json(res, { ok: true });
    }

    if (s.status !== 'live') return fail(res, s.status === 'lobby' ? 'not started yet' : 'session is closed');
    join(s, who);

    if (act === 'message') {
      const text = String(b.text || '').trim().slice(0, 4000);
      if (!text) return fail(res, 'empty');
      if (s.round) {
        const r = s.round;
        const first = !r.answers[who];
        const msg = addMessage(s.id, { kind: 'user', author: who, text, round: r.id, hidden: r.blind });
        if (first) r.answers[who] = msg.id; else r.extra.push(msg.id);
        const missing = s.participants.filter((p) => !r.answers[p]);
        if (!missing.length) closeRound(s, 'all in');
        changed(); return json(res, { ok: true, round: true, missing });
      }
      addMessage(s.id, { kind: 'user', author: who, text });
      enqueue('message', s, { who, text });
      changed(); return json(res, { ok: true });
    }
    if (act === 'round-close') {
      if (!s.round) return fail(res, 'no round open');
      closeRound(s, '', who);
      changed(); return json(res, { ok: true });
    }
    if (act === 'stage') {
      const to = Math.max(0, Math.min(tpl(s).stages.length - 1, s.stage + (Number(b.dir) < 0 ? -1 : 1)));
      if (to === s.stage) return json(res, { ok: true, unchanged: true });
      if (s.round) closeRound(s, 'stage move', who);
      const from = s.stage; s.stage = to; const st = stageOf(s);
      sys(s, `${who} ${to < from ? '⏪ back to' : '→'} ${st.icon} ${st.name}`);
      enqueue('stage_changed', s, { who, from, to, direction: to < from ? 'back' : 'forward' });
      changed(); return json(res, { ok: true });
    }
    if (act === 'mini') {
      const r = MINI_ROUNDS[b.round];
      if (!r) return fail(res, 'unknown round');
      const card = b.card ? S.cards[b.card] : null;
      if (b.card && (!card || card.session !== s.id)) return fail(res, 'no such card here');
      if (r.target === 'card' && !card) return fail(res, `${r.name} is called on a card — use the button on the card`);
      if (s.round) closeRound(s, 'mini-round', who);
      sys(s, `${who} called ${r.emoji} ${r.name}${card ? ` on “${card.title}”` : ''}`);
      enqueue('mini_round', s, { who, round: r.key, card: card ? { id: card.id, title: card.title, note: card.note, fields: card.fields } : null });
      changed(); return json(res, { ok: true });
    }
    if (act === 'call-vote') {
      if (s.phase !== 'play') return fail(res, `already in ${s.phase}`);
      s.candidates = sessionCards(s.id).filter((c) => c.status === 'candidate').map((c) => c.id);
      if (!s.candidates.length) return fail(res, 'no candidates yet — mark a card ⭐ first');
      if (s.round) closeRound(s, 'vote called', who);
      s.phase = 'judging'; s.verdicts = {};
      sys(s, `⚖️ ${who} called the vote. The Continuity Judge checks ${s.candidates.length} candidate${s.candidates.length > 1 ? 's' : ''}…`);
      enqueue('judge', s, { who, cards: s.candidates });
      changed(); return json(res, { ok: true });
    }
    if (act === 'vote') {
      if (s.phase !== 'vote') return fail(res, 'no vote running');
      if (!s.candidates.includes(b.card)) return fail(res, 'not a candidate');
      s.votes[who] = b.card;
      if (Object.keys(s.votes).length >= s.participants.length) tally(s);
      changed(); return json(res, { ok: true });
    }
    if (act === 'close-vote') {
      if (s.phase !== 'vote') return fail(res, 'no vote running');
      if (!Object.keys(s.votes).length) return fail(res, 'nobody voted yet');
      sys(s, `${who} closed the vote early.`);
      tally(s);
      changed(); return json(res, { ok: true });
    }
    if (act === 'approve') {
      if (s.phase !== 'approval') return fail(res, 'nothing to approve');
      s.approvals[who] = !!b.yes;
      const yes = Object.values(s.approvals).filter(Boolean).length;
      const no = Object.values(s.approvals).length - yes;
      const need = majorityOf(s);
      if (yes >= need) promote(s);
      else if (no > s.participants.length - need) {
        const w = S.cards[s.winner];
        w.status = 'active';
        sys(s, `👎 "${w.title}" was not approved. Back to the table.`);
        settle(s);
      }
      changed(); return json(res, { ok: true });
    }
    if (act === 'wrap') {
      if (s.phase === 'wrapping') return json(res, { ok: true });
      if (s.round) closeRound(s, 'wrap', who);
      s.phase = 'wrapping';
      sys(s, `${who} is wrapping up. The bot writes the recap…`);
      enqueue('wrap', s, { who });
      changed(); return json(res, { ok: true });
    }
    return fail(res, 'unknown action', 404);
  }

  if (p === '/api/card' && req.method === 'POST') {
    const b = await body(req);
    const who = name(b);
    const s = S.sessions[b?.session];
    if (!who || !s) return fail(res, 'need who and session');
    if (!live(s)) return fail(res, 'session not live');
    if (!String(b.title || '').trim()) return fail(res, 'title?');
    join(s, who);
    const card = addCard(s.id, { title: b.title, note: b.note, author: who, sparkedBy: who });
    changed(); return json(res, { ok: true, id: card.id });
  }

  const cm = p.match(/^\/api\/card\/([^/]+)\/([a-z-]+)$/);
  if (cm && req.method === 'POST') {
    const card = S.cards[cm[1]];
    if (!card) return fail(res, 'no such card', 404);
    const s = S.sessions[card.session];
    const b = await body(req);
    const who = name(b);
    if (!who) return fail(res, 'who?');
    const act = cm[2];

    if (act === 'react') {
      if (!REACTIONS.includes(b.value)) return fail(res, 'bad reaction');
      if (card.reactions[who] === b.value) delete card.reactions[who]; else card.reactions[who] = b.value;
      changed(); return json(res, { ok: true });
    }
    if (!live(s)) return fail(res, 'session not live');
    join(s, who);

    if (act === 'status') {
      const st = b.status;
      if (!['active', 'candidate', 'parked', 'discarded'].includes(st)) return fail(res, 'bad status');
      if (card.status === 'promoted') return fail(res, 'promoted cards are canon; amend by vote');
      if (st === 'candidate' && s.phase !== 'play') return fail(res, `a round is running (${s.phase}) — wait for it to finish`);
      const was = card.status;
      card.status = st;
      if (st === 'candidate') { card.alternate = false; if (!s.candidates.includes(card.id)) s.candidates.push(card.id); sys(s, `⭐ ${who} marked "${card.title}" as candidate`); }
      else if (was === 'candidate') { sys(s, `${who} pulled "${card.title}" back (${st})`); settle(s); }
      changed(); return json(res, { ok: true });
    }
    if (act === 'dismiss-flag') {
      const v = s.verdicts[card.id];
      if (!v || v.verdict !== 'warn' || v.dismissed) return fail(res, 'no open ⚠️ on this card');
      v.dismissed = true; v.dismissedBy = who;
      S.exceptions.push({ card: card.id, session: s.id, note: v.note, reason: String(b.reason || 'We know, it’s intentional').slice(0, 300), who, ts: now() });
      sys(s, `${who}: "We know, it’s intentional" on "${card.title}" — logged, never re-flagged.`);
      settle(s);
      changed(); return json(res, { ok: true });
    }
    if (act === 'edit') {
      if (card.status === 'promoted') return fail(res, 'promoted cards are canon');
      if (b.title) card.title = String(b.title).slice(0, 120);
      if (b.note !== undefined) card.note = String(b.note).slice(0, 2000);
      if (b.fields && typeof b.fields === 'object') card.fields = { ...card.fields, ...b.fields };
      changed(); return json(res, { ok: true });
    }
    return fail(res, 'unknown action', 404);
  }

  if (p.startsWith('/api/')) return fail(res, 'not found', 404);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`π brainstorm demo → http://localhost:${PORT}   (data: ${STATE_FILE})`);
  console.log(`bot: run "npm run bot" in another terminal, or drive it by hand with node bot/wait.mjs / bot/say.mjs`);
});
