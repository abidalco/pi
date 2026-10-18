// π Script demo — vanilla client. State arrives whole over SSE; every render is morphed into the DOM
// (keyed by data-key) so a focused field, its caret and undo history survive other people's edits.
//
// Layout: one room for writing (Write · Board · Shots are three views of the same script) and two rooms
// you visit and come back from (📖 Bible, 🕘 History). Rules everywhere: the script reads like a page;
// controls show on hover; secondary actions live behind ⋯; anything that needs attention is one quiet
// line that opens on click; AI appears when asked; nothing asks for approval.
(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  let state = null;

  // ?as=Name gives one tab its own identity (to play two people in one browser)
  const asParam = new URLSearchParams(location.search).get('as');
  if (asParam) sessionStorage.setItem('pi.script.name', asParam.trim().slice(0, 40));
  let me = sessionStorage.getItem('pi.script.name') || localStorage.getItem('pi.name') || '';

  const ui = {
    draft: localStorage.getItem('pi.script.draft') || '',
    sel: { scene: null, ids: [], last: null },
    gen: { open: false, personality: 'director', custom: '', twist: 'none', ask: '', input: null, ctl: false },
    slash: null, insert: null, focusNext: null, focusSel: null, focusScene: null, trying: null,
    dragging: false, pendingRender: false, menu: null, guide: false, notice: null,
    snaps: {}, brainstorm: null, brainstormLoading: false,
    compare: { a: '', b: '', data: null }, viewVersion: null, draftOpen: {},
    staleOpen: {}, notesOpen: {}, shotMore: {}, coverEdit: null,
    sesh: null, seshFilter: 'all', seshData: null, seshLoading: null,
    factEdit: null, factNew: null, factMove: null, factReview: false,
    lastScript: 'write', lastMain: null,
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const ago = (ts) => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ts).toLocaleDateString(); };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let toastTimer;
  const toast = (t) => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.hidden = true), 3200); };

  async function api(p, data = {}) {
    const r = await fetch(`/api/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who: me, ...data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error || 'error');
    return j;
  }
  const getJSON = (p) => fetch(p).then((r) => r.json());

  // ---------------------------------------------------------------- live
  let es;
  function connect() {
    es?.close();
    es = new EventSource(`/events?who=${encodeURIComponent(me)}`);
    es.onmessage = (e) => { state = JSON.parse(e.data); placeOptimistic(state); if (ui.dragging) { ui.pendingRender = true; return; } render(); };
    es.onerror = () => toast('connection lost — is the server running?');
  }
  connect();
  window.addEventListener('hashchange', () => { ui.menu = null; render(); });

  // ---------------------------------------------------------------- morph (tiny morphdom)
  function morph(container, html) {
    const next = document.createElement(container.tagName);
    next.innerHTML = html;
    morphChildren(container, next);
  }
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);
  function morphChildren(from, to) {
    const wanted = new Set([...to.childNodes].map(keyOf).filter(Boolean));
    for (const k of [...from.childNodes]) { const key = keyOf(k); if (key && !wanted.has(key)) from.removeChild(k); }
    const keyed = new Map();
    for (const k of from.childNodes) { const key = keyOf(k); if (key) keyed.set(key, k); }
    const kids = [...to.childNodes];
    let i = 0;
    for (const nk of kids) {
      const key = keyOf(nk);
      let match = null;
      if (key) {
        match = keyed.get(key) || null;
        keyed.delete(key);
        if (match && match.tagName !== nk.tagName) { match.remove(); match = null; }
      }
      const cur = from.childNodes[i] || null;
      if (!key && cur && !keyOf(cur) && cur.nodeType === nk.nodeType && (cur.nodeType !== 1 || cur.tagName === nk.tagName)) match = cur;
      if (match) {
        if (match !== cur) from.insertBefore(match, cur);
        if (match.nodeType === 1) morphEl(match, nk);
        else if (match.nodeValue !== nk.nodeValue) match.nodeValue = nk.nodeValue;
      } else from.insertBefore(nk, cur);
      i++;
    }
    while (from.childNodes.length > i) from.removeChild(from.lastChild);
  }
  function morphEl(from, to) {
    const focused = document.activeElement === from;
    for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value && !(focused && name === 'value')) from.setAttribute(name, value);
    for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
    const tag = from.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (tag === 'SELECT') morphChildren(from, to);
      if (from.type === 'checkbox') from.checked = to.checked;
      else if (!focused && from.value !== to.value) from.value = to.value;
      return;
    }
    morphChildren(from, to);
  }

  // ---------------------------------------------------------------- helpers
  const M = () => state.drafts[state.mainId];
  const D = () => state.drafts[ui.draft] || M();
  const canEdit = (d) => !!d && (d.isMain || d.owner === 'team' || d.owner === me);
  const pers = (key, custom) => (key === 'custom' ? `✏️ ${custom || 'Custom'}` : `${state.personalities[key]?.emoji} ${state.personalities[key]?.name}`);
  const pad = (n) => String(n ?? 0).padStart(2, '0');
  const headingText = (b) => [b.intExt, b.location, b.time && `- ${b.time}`].filter(Boolean).join(' ').toUpperCase();
  const draftLabel = (d) => (d.isMain ? 'Main' : d.name);
  const job = (id) => state.jobs.find((j) => j.id === id);
  const jobsFor = (scene, type) => state.jobs.filter((j) => j.scene === scene && j.type === type);
  const myGen = () => [...state.jobs].reverse().find((j) => j.type === 'generate' && j.by === me && !j.dismissed && j.status !== 'failed');
  const busy = (j) => j && (j.status === 'pending' || j.status === 'delivered');
  const busyLabel = (j) => (!j ? '' : j.status === 'pending' ? (state.botOnline ? 'queued…' : 'waiting for the AI (it’s off: npm run bot)') : j.status === 'delivered' ? 'thinking…' : '');
  const blockIndex = (sc, id) => sc.blocks.findIndex((b) => b.id === id) + 1 || '?';
  const route = () => {
    const [p, sub] = (location.hash.replace('#', '') || 'write').split('/');
    const alias = { doc: 'write', seshes: 'history', drafts: 'history' };
    const place = alias[p] || p;
    return [['write', 'board', 'shots', 'history', 'bible'].includes(place) ? place : 'write', sub || (p === 'drafts' ? 'drafts' : '')];
  };
  const menu = (id, items, cls = '') => (ui.menu === id ? `<div class="menu ${cls}" data-key="m-${id}">${items.filter(Boolean).join('')}</div>` : '');
  const mi = (act, label, data = {}, extra = '') => `<button class="mi ${extra}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
  const menuBtn = (id, label = '⋯', title = 'more') => `<button class="icon ${ui.menu === id ? 'on' : ''}" data-act="menu" data-menu="${id}" title="${title}">${label}</button>`;

  // ---------------------------------------------------------------- local edit buffer (debounced, survives re-renders)
  const local = {};
  const pend = {};
  function queueEdit(kind, base, field, value, delay = 350) {
    const id = base.block || base.shot || base.scene || base.sesh || 'project';
    const key = `${kind}:${id}`;
    local[`${id}:${field}`] = value;
    const p = (pend[key] ||= { kind, base, patch: {}, timer: null });
    p.patch[field] = value;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => flush(key), delay);
  }
  async function flush(key) {
    const p = pend[key];
    if (!p) return;
    delete pend[key];
    clearTimeout(p.timer);
    const id = p.base.block || p.base.shot || p.base.scene || p.base.sesh || 'project';
    if (p.kind === 'block' && creating[id]) await creating[id];
    if (p.kind === 'block') await api('block/update', { ...p.base, patch: p.patch });
    if (p.kind === 'shot') await api('shot/update', { ...p.base, patch: p.patch });
    if (p.kind === 'title') await api('scene/title', { ...p.base, title: p.patch.title });
    if (p.kind === 'project') await api('project', p.patch);
    if (p.kind === 'sesh') await api('sesh/title', { sesh: p.base.sesh, title: p.patch.title });
    for (const f of Object.keys(p.patch)) if (local[`${id}:${f}`] === p.patch[f]) delete local[`${id}:${f}`];
  }
  const flushAll = () => Promise.all(Object.keys(pend).map(flush));
  const val = (id, field, server) => local[`${id}:${field}`] ?? server ?? '';

  // optimistic insert: a new line appears and takes focus at once; the server confirms with the same id
  const FIELDS = { heading: ['intExt', 'location', 'time'], action: ['text'], dialogue: ['character', 'paren', 'line'], transition: ['text'], note: ['text'] };
  const optimistic = {};
  const creating = {};
  function placeOptimistic(st) {
    for (const o of Object.values(optimistic)) {
      const sc = st.drafts[o.draft]?.scenes[o.scene];
      if (!sc || sc.blocks.some((b) => b.id === o.blk.id)) continue;
      const i = o.after === 'end' ? sc.blocks.length : o.after ? sc.blocks.findIndex((b) => b.id === o.after) + 1 : 0;
      sc.blocks.splice(i < 0 ? sc.blocks.length : i, 0, { ...o.blk });
    }
  }
  function addBlockAfter(scene, after, type, fields) {
    const d = D();
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const blk = { id, type };
    for (const f of FIELDS[type]) blk[f] = fields?.[f] || '';
    optimistic[id] = { draft: d.id, scene, after: after || null, blk };
    placeOptimistic(state);
    ui.focusNext = { block: id, field: { heading: 'location', dialogue: fields?.character ? 'line' : 'character', transition: 'text' }[type] || 'text' };
    ui.insert = null;
    render();
    creating[id] = api('block/add', { draft: d.id, scene, after: after || null, type, fields, id }).finally(() => { delete creating[id]; delete optimistic[id]; });
    return creating[id];
  }
  function nextSpeaker(sc, blockId) {
    const i = sc.blocks.findIndex((b) => b.id === blockId);
    const speakers = sc.blocks.slice(0, i + 1).filter((b) => b.type === 'dialogue' && b.character).map((b) => b.character.toUpperCase());
    const cur = speakers.at(-1);
    return [...speakers].reverse().find((s) => s !== cur) || '';
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!state) return;
    ui.pendingRender = false;
    if (!me) return renderGate();
    if (!state.started) { morph(app, `<div class="view" data-key="start">${startView()}</div>`); return post(); }
    if (ui.lastMain && ui.lastMain !== state.mainId && ui.draft === ui.lastMain) { ui.draft = state.mainId; localStorage.setItem('pi.script.draft', ui.draft); toast('Main changed: you are on the new Main'); }
    ui.lastMain = state.mainId;
    if (!state.drafts[ui.draft]) ui.draft = state.mainId;
    const [place, sub] = route();
    if (['write', 'board', 'shots'].includes(place)) ui.lastScript = place;
    const body = place === 'history' ? historyView(sub || 'seshes') : place === 'bible' ? bibleView(sub || 'facts')
      : place === 'board' ? boardView() : place === 'shots' ? shotsView() : writeView();
    morph(app, `${ui.guide ? guidePanel() : ''}
      <div class="stick" data-key="stick">${topBar(place, sub)}${draftBar(place)}${ui.notice ? `<div class="notice" data-key="notice">${ui.notice.html} <button class="ghost small" data-act="notice-x">×</button></div>` : ''}</div>
      <div class="view view-${place}" data-key="view-${place}">${body}</div>
      ${place === 'write' ? pickBar() : ''}
      <datalist id="chars" data-key="chars">${state.project.characters.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <datalist id="transitions" data-key="trans">${['CUT TO:', 'SMASH CUT TO:', 'DISSOLVE TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE IN:', 'INTERCUT WITH:'].map((t) => `<option value="${t}">`).join('')}</datalist>
      <datalist id="framings" data-key="framings">${state.framings.map((x) => `<option value="${x}">`).join('')}</datalist>`);
    post();
  }

  const fieldSizing = CSS.supports('field-sizing', 'content');
  function autosize(el) { if (fieldSizing || el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  function post() {
    if (!fieldSizing) {
      app.querySelectorAll('textarea.auto').forEach(autosize);
      app.querySelectorAll('.blk-heading .loc, .blk-heading .time').forEach((el) => { el.style.width = `${Math.max(el.classList.contains('loc') ? 10 : 6, (el.value || el.placeholder).length + 2)}ch`; });
    }
    if (ui.focusNext) {
      const { block, field, type } = ui.focusNext;
      const scope = app.querySelector(`[data-block="${block}"]${type ? `.blk-${type}` : ''}`);
      const el = scope && (scope.querySelector(`[data-field="${field || ''}"]`) || scope.querySelector('[data-field]'));
      if (el) { ui.focusNext = null; el.focus(); if (el.setSelectionRange && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length); el.scrollIntoView({ block: 'nearest' }); }
    }
    if (ui.focusSel) { const el = app.querySelector(ui.focusSel); if (el) { ui.focusSel = null; el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }
  }

  function renderGate() {
    app.innerHTML = `<div class="gate"><h1>π · Script</h1><div class="muted">What should the others see you as?</div>
      <form id="gate"><input id="gname" placeholder="your name" autofocus maxlength="40"><button class="primary">Enter</button></form></div>`;
    app.querySelector('#gate').onsubmit = (e) => {
      e.preventDefault();
      const v = app.querySelector('#gname').value.trim(); if (!v) return;
      me = v; localStorage.setItem('pi.name', v); if (asParam) sessionStorage.setItem('pi.script.name', v);
      app.innerHTML = ''; connect();
    };
  }

  // ---------------------------------------------------------------- chrome
  function topBar(place, sub) {
    const scriptPlace = ['write', 'board', 'shots'].includes(place);
    const d = D();
    const seg = (k, label, dis) => `<a href="#${k}" class="seg ${place === k ? 'on' : ''} ${dis ? 'dim' : ''}">${label}</a>`;
    const tab = (base, k, label) => `<a href="#${base}/${k}" class="seg ${sub === k || (!sub && k === (base === 'history' ? 'seshes' : 'facts')) ? 'on' : ''}">${label}</a>`;
    const toReview = Object.values(state.seshes).filter((x) => x.status === 'saved').length;
    const outdated = factsToLook().length;
    const left = scriptPlace
      ? `<a class="logo" href="#write" title="π production system">π</a><input class="ptitle" data-pfield="title" value="${esc(val('project', 'title', state.project.title))}" title="the film's title" maxlength="120">`
      : `<a class="back" href="#${ui.lastScript}">← Script</a><span class="roomname">${place === 'history' ? 'History' : 'Story Bible'}</span>`;
    const center = scriptPlace ? `${seg('write', 'Write')}${seg('board', 'Board')}${seg('shots', 'Shots', !d.isMain)}`
      : place === 'history' ? `${tab('history', 'seshes', `Seshes${toReview ? ` <span class="badge">${toReview}</span>` : ''}`)}${tab('history', 'drafts', 'Drafts')}${tab('history', 'compare', 'Compare')}`
      : `${tab('bible', 'facts', `Facts${outdated ? ' <span class="adot"></span>' : ''}`)}${tab('bible', 'characters', 'Characters')}${tab('bible', 'brainstorm', 'From Brainstorm')}${tab('bible', 'notes', 'Notes')}`;
    const room = (href, icon, title, on, badge, dot) => `<a class="icon roombtn ${on ? 'on' : ''}" href="${href}" title="${title}">${icon}${badge ? `<span class="badge">${badge}</span>` : ''}${dot ? '<span class="rdot"></span>' : ''}</a>`;
    return `<header class="top" data-key="top">
      <div class="tl">${left}</div>
      <nav class="segs">${center}</nav>
      <div class="tr">
        ${seshIndicator()}
        ${aiStatus()}
        ${room('#bible', '📖', outdated ? `Story Bible · ${plural(outdated, 'fact')} may be out of date` : 'Story Bible', place === 'bible', '', outdated)}
        ${room('#history', '🕘', 'History: seshes, drafts, versions', place === 'history', toReview || '')}
        <span class="people">${state.project.members.map((n) => `<span class="av ${n === me ? 'me' : ''} ${state.online.includes(n) ? 'on' : ''}" title="${esc(n)}${n === me ? ' (you)' : ''}${state.online.includes(n) ? ' · online' : ''}">${esc(n.slice(0, 1).toUpperCase())}</span>`).join('')}</span>
        <div class="menuwrap">${menuBtn('more', '⋯', 'more')}${menu('more', [
          `<div class="mlabel">Export ${esc(draftLabel(d))}</div>`,
          `<a class="mi" data-act="noop" href="/export/pdf?draft=${d.id}" target="_blank">PDF</a>`,
          `<a class="mi" data-act="noop" href="/export/fountain?draft=${d.id}">Fountain</a>`,
          '<div class="msep"></div>',
          mi('guide', state.project.demo ? 'Guide & keys' : 'Keys'),
          mi('rename', `You are <b>${esc(me)}</b> · change`),
          `<div class="mnote">${state.botOnline ? '🟢 The AI is on' : '⚪️ The AI is off · start it with <code>npm run bot</code>'}</div>`,
          '<div class="msep"></div>',
          mi('reset', 'Reset the demo…', {}, 'danger'),
        ], 'right')}</div>
      </div>
    </header>`;
  }

  function aiStatus() {
    return state.jobs.some((x) => x.status === 'delivered') ? '<span class="aistat" title="the AI is working">✨ thinking…</span>' : '';
  }

  // the open sesh of the draft you're in: everything you do lands here; saving it makes a version
  function seshIndicator() {
    const d = D();
    if (!canEdit(d)) return '';
    const x = d.sesh && state.seshes[d.sesh];
    if (!x) return '<span class="saved" title="Everything is saved. Your next change starts a sesh.">✓ Saved</span>';
    return `<div class="menuwrap"><button class="seshbtn ${ui.menu === 'sesh' ? 'on' : ''}" data-act="menu" data-menu="sesh" title="the sesh you're in"><span class="dot"></span><span class="st">${esc(val(x.id, 'title', x.title))}</span><span class="sc">${x.changes}</span></button>
      ${menu('sesh', [
        '<div class="mlabel">This sesh</div>',
        `<input class="seshtitle" data-seshtitle="${x.id}" value="${esc(val(x.id, 'title', x.title))}" maxlength="80" placeholder="name it">`,
        `<div class="mnote">${plural(x.changes, 'change')} · ${esc((x.people.length ? x.people : [x.by]).join(', '))} · started ${ago(x.startedAt)}</div>`,
        `<div class="mrow"><button class="primary small" data-act="sesh-end" data-draft="${d.id}">Save as a version</button><button class="ghost small" data-act="sesh-open" data-sesh="${x.id}">See what changed</button></div>`,
        '<div class="mnote">Nothing needs approving now. Review it in History whenever.</div>',
      ], 'right wide')}</div>`;
  }

  function draftBar(place) {
    const d = D();
    if (d.isMain || place === 'history') return '';
    return `<div class="draftbar" data-key="draftbar">You're in <b>${esc(d.name)}</b>${canEdit(d) ? '' : ` · ${esc(d.owner)}'s, read-only`} <button class="small" data-act="to-main">Back to Main</button></div>`;
  }

  function pickBar() {
    const n = ui.sel.scene ? ui.sel.ids.length : 0;
    if (!n || ui.gen.open) return '';
    return `<div class="pickbar" data-key="pickbar">${plural(n, 'line')} picked <button class="primary small" data-act="gen-open-sel">✨ Try options</button><button class="ghost small" data-act="sel-clear">Clear</button></div>`;
  }

  // ---------------------------------------------------------------- guide (closed until asked)
  const other = () => (me === 'Abdallah' ? 'Hadi' : 'Abdallah');
  const TOUR = [
    { id: 'sesh', go: 'write', html: () => `<b>The sesh</b> (top right, red dot) holds everything done since the last save. Click it to name it and <b>Save as a version</b>. Nobody approves anything while you work.` },
    { id: 'review', go: 'history/seshes', html: () => `<b>🕘 History</b>: every saved sesh with what changed. Approve it, or tag what needs work and pick it up again. You can undo a whole sesh.` },
    { id: 'gen', go: 'write', scene: 'Jiddo’s chair', html: () => `<b>AI options</b>: click ⋮⋮ beside a few lines (shift for a range), then ✨ Try options. Click an option and it swaps into the script; click another, or back to the original. Done keeps it.` },
    { id: 'move', go: 'write', scene: 'Jiddo’s chair', html: () => `<b>Move a line</b>: drag its ⋮⋮ to a new spot. <b>Enter</b> finishes a line, <b>Shift+Enter</b> breaks it.` },
    { id: 'attn', go: 'write', scene: 'The theory', html: () => `<b>The theory</b> was locked, then ${esc(other())} changed a line. The quiet line under its title opens what the Judge said and what changed.` },
    { id: 'shots', go: 'shots', scene: 'The theory', html: () => `<b>Shots</b>: the breakdown of each locked scene. The theory changed after its shots were made, so it says so and offers to propose them again.` },
    { id: 'alt', go: 'write', scene: 'The call to Istanbul', html: () => `<b>The call to Istanbul</b> has an alternate ending waiting from ${esc(other())}. Use it or remove it.` },
    { id: 'tray', go: 'board', html: () => `<b>Board</b>: drag cards to reorder. “Not placed” holds a scene from Brainstorm; the Judge suggests where it fits.` },
    { id: 'lock', go: 'write', scene: 'The call to Istanbul', html: () => `<b>Lock a scene</b>: ⋯ next to its title → Lock. The Judge checks it, then it's locked. Then its shots can be proposed.` },
    { id: 'facts', go: 'bible/facts', html: () => `<b>📖 Bible → Facts</b>: what's true in the story. Click a fact to change it. A dot means its scene changed since.` },
    { id: 'draft', go: 'history/drafts', html: () => `<b>${esc(other())}'s draft</b> ends Jiddo's chair differently. Open it, compare it, pull one scene, or make it Main.` },
  ];
  const tourKey = () => `pi.script.tour.${state.project.startedAt}`;
  const tourDone = () => { try { return JSON.parse(localStorage.getItem(tourKey()) || '[]'); } catch { return []; } };
  function guidePanel() {
    const done = tourDone();
    const keys = [['Enter', 'done with a line'], ['Shift + Enter', 'line break'], ['⌘/Ctrl + Enter', 'new line below (next speaker)'], ['/', 'in an empty line: change its type'], ['⋮⋮ drag', 'move a line'], ['⋮⋮ click', 'pick lines (shift = range)'], ['Backspace', 'in an empty line: delete it']];
    return `<aside class="guide" data-key="guide"><div class="ghead"><b>${state.project.demo ? 'Guide' : 'Keys'}</b><span class="grow"></span><button class="ghost small" data-act="guide">close</button></div>
      <div class="keys">${keys.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
      ${state.project.demo ? `<div class="mlabel" style="margin-top:12px">Things to try · ${done.length}/${TOUR.length}</div>${TOUR.map((t) => `<div class="titem ${done.includes(t.id) ? 'done' : ''}" data-key="ti-${t.id}"><input type="checkbox" data-act="tour-tick" data-id="${t.id}" ${done.includes(t.id) ? 'checked' : ''}><div>${t.html()} ${t.go ? `<a href="#${t.go}" class="go" data-act="tour-go" data-go="${t.go}" data-title="${esc(t.scene || '')}">go ›</a>` : ''}</div></div>`).join('')}` : ''}
    </aside>`;
  }

  // ---------------------------------------------------------------- start
  function startView() {
    if (!ui.brainstorm && !ui.brainstormLoading) loadBrainstorm();
    const ideas = (ui.brainstorm?.cards || []).filter((c) => c.type === 'idea');
    return `<main class="start">
      <div class="logo big">π</div>
      <h1>Script</h1>
      <p class="muted">Write a film together. Scenes on a board, a script you edit at the same time, AI options when you ask, shots for locked scenes.</p>
      <div class="starts">
        <button class="startcard rec" data-act="start" data-mode="demo"><b>Al Mousalsal, two days in</b><span>Your Brainstorm Idea mid-production: history, locked scenes, an open sesh. Best way to look around.</span></button>
        <button class="startcard" data-act="start" data-mode="sample"><b>A fresh start</b><span>The spec's four-scene wireframe, nothing locked, no history.</span></button>
        ${ideas.map((c) => `<button class="startcard" data-act="start" data-mode="idea" data-card="${c.id}"><b>From the Idea “${esc(c.title.replace(/^(pitch|idea)\s*[—–-]\s*/i, ''))}”</b><span>The AI builds the skeleton: title, logline, characters, scene cards.</span></button>`).join('')}
        <button class="startcard" data-act="start" data-mode="blank"><b>Empty</b><span>Just a title and a page.</span></button>
      </div>
    </main>`;
  }
  async function loadBrainstorm() {
    ui.brainstormLoading = true;
    try { ui.brainstorm = await getJSON('/api/brainstorm'); } catch { ui.brainstorm = { cards: [] }; }
    ui.brainstormLoading = false; render();
  }

  // ================================================================ SCRIPT ROOM
  // ---------------------------------------------------------------- Write
  function writeView() {
    const d = D();
    const ro = !canEdit(d);
    return `<div class="write ${ui.gen.open ? 'with-gen' : ''}" data-key="write">
      <aside class="outline" data-key="outline">${outlineView(d, ro)}</aside>
      <main class="page" data-key="page">${pageView(d, ro)}</main>
      ${ui.gen.open ? `<aside class="gen" data-key="gen" data-drop="gen">${genView(d, ro)}</aside>` : '<div class="gendrop" data-drop="gen" data-key="gendrop">✨ Drop here for AI options</div>'}
    </div>`;
  }

  function outlineView(d, ro) {
    const others = Object.entries(state.presence).filter(([n, p]) => n !== me && p.draft === d.id);
    const here = (sid) => others.filter(([, p]) => p.scene === sid).map(([n]) => `<span class="pdot" title="${esc(n)} is here">${esc(n[0])}</span>`).join('');
    const item = (sc, floating) => `<div class="oi ${ui.focusScene === sc.id ? 'cur' : ''}" data-key="oi-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}" ${floating ? '' : 'data-drop="scene"'} data-act="goto-scene">
      <span class="on">${floating ? '' : sc._num}</span><span class="ot">${esc(sc.title)}</span>${here(sc.id)}${sc.lock ? '<span class="olock" title="locked">🔒</span>' : ''}</div>`;
    return `<div class="olist" data-drop="order">${d.order.map((id) => item(d.scenes[id])).join('')}</div>
      ${ro ? '' : '<button class="oadd" data-act="scene-add" data-after="end">+ New scene</button>'}
      <div class="ohead ${d.floating.length ? '' : 'empty'}">Not placed${d.floating.length ? ` <span>${d.floating.length}</span>` : ''}</div>
      <div class="olist tray ${d.floating.length ? '' : 'empty'}" data-drop="tray">${d.floating.map((id) => item(d.scenes[id], true)).join('') || '<div class="trayhint">drop a scene here to take it out of the order</div>'}</div>`;
  }

  function pageView(d, ro) {
    const placed = d.order.map((id) => d.scenes[id]);
    const floats = d.floating.map((id) => d.scenes[id]);
    return `${placed.map((sc) => sceneSection(d, sc, ro)).join('')}
      ${floats.length ? `<div class="unplaced" data-key="unplaced">Not placed yet</div>${floats.map((sc) => sceneSection(d, sc, ro)).join('')}` : ''}
      ${!placed.length && !floats.length ? `<div class="empty center" data-key="emptypage">No scenes yet.${ro ? '' : ' <button class="small" data-act="scene-add" data-after="end">+ New scene</button>'}</div>` : ''}`;
  }

  // what needs attention on a scene, as one quiet line
  function attention(d, sc) {
    const out = [];
    const c = sc.check;
    if (c?.state === 'checking' && c.hash === sc._hash) out.push({ cls: 'info', text: `⚖️ checking before locking · ${busyLabel(jobsFor(sc.id, 'judge_lock').at(-1)) || '…'}` });
    if (c?.state === 'done' && c.hash === sc._hash && c.verdict === 'block' && !sc.lock) out.push({ cls: 'bad', text: '⚖️ not locked: the Judge found a contradiction' });
    const openWarn = c?.state === 'done' && c.hash === sc._hash ? c.notes.filter((n) => n.verdict === 'warn' && !n.dismissed).length : 0;
    if (openWarn) out.push({ cls: 'warn', text: `⚖️ ${plural(openWarn, 'note')} from the Judge` });
    if (sc.lock && sc.lock.hash !== sc._hash) {
      out.push({ cls: 'warn', text: `🔒 changed since locking${sc.shots.length ? ' · its shots may need a look' : ''}` });
      const e = sc.editCheck;
      if (e?.state === 'checking') out.push({ cls: 'info', text: '⚖️ re-checking…' });
      else if (e?.state === 'done' && e.notes.some((x) => x.verdict !== 'ok' && !x.dismissed)) out.push({ cls: 'warn', text: '⚖️ the Judge has a note on the change' });
    }
    if (sc.pacing) out.push({ cls: 'info', text: sc.pacing.pending ? `🩺 pacing check · ${busyLabel(jobsFor(sc.id, 'pacing').at(-1)) || '…'}` : '🩺 pacing notes' });
    if (d.floating.includes(sc.id)) {
      const s = sc.placeSuggestion;
      if (s?.pending) out.push({ cls: 'info', text: '⚖️ looking for where it fits…' });
      else if (s) out.push({ cls: 'info', text: `⚖️ fits ${s.after ? `after ${d.scenes[s.after]?._num} ${esc(d.scenes[s.after]?.title || '?')}` : 'at the very start'}` });
    }
    return out;
  }

  function sceneSection(d, sc, ro) {
    const att = attention(d, sc);
    const open = ui.notesOpen[sc.id];
    let blocks = '';
    for (const b of sc.blocks) blocks += blockEditor(d, sc, b, ro) + (ro ? '' : insRow(sc, b.id));
    return `<section class="scene ${sc.lock ? 'locked' : ''} ${d.floating.includes(sc.id) ? 'floating' : ''}" data-key="sc-${sc.id}" id="scene-${sc.id}" data-scene="${sc.id}">
      <header class="sh">
        <span class="snum">${sc._num ?? ''}</span>
        <input class="stitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''} maxlength="120">
        ${sc.lock ? `<span class="lockmark" title="locked ${ago(sc.lock.at)}">🔒</span>` : ''}
        <div class="menuwrap">${menuBtn(`scene:${sc.id}`)}${menu(`scene:${sc.id}`, sceneMenu(d, sc, ro), 'right')}</div>
      </header>
      ${att.length ? `<button class="attn" data-act="notes-toggle" data-scene="${sc.id}">${att.map((a) => `<span class="${a.cls}">${a.text}</span>`).join('<i>·</i>')}<span class="chev">${open ? '▴' : '▾'}</span></button>` : ''}
      ${open && att.length ? notesPanel(d, sc, ro) : ''}
      ${ro ? '' : insRow(sc, '', 'top')}
      <div class="blocks">${blocks}</div>
      ${ro ? '' : insRow(sc, sc.blocks.at(-1)?.id || '', 'end')}
    </section>`;
  }

  function sceneMenu(d, sc, ro) {
    const floating = d.floating.includes(sc.id);
    const edited = sc.lock && sc.lock.hash !== sc._hash;
    const checking = sc.check?.state === 'checking' && sc.check.hash === sc._hash;
    const items = [];
    if (ro) {
      const targets = Object.values(state.drafts).filter((x) => x.id !== d.id && canEdit(x));
      if (targets.length) { items.push('<div class="mlabel">Pull this scene into</div>'); for (const x of targets) items.push(mi('pull', esc(draftLabel(x)), { scene: sc.id, into: x.id })); }
      return items.length ? items : ['<div class="mnote">Read-only draft</div>'];
    }
    if (d.isMain && !floating && !checking) items.push(!sc.lock ? mi('lock', '🔒 Lock scene', { scene: sc.id }) : edited ? mi('lock', '🔒 Lock again, as it is now', { scene: sc.id }) : mi('unlock', '🔓 Unlock', { scene: sc.id }));
    if (d.isMain && sc.lock) items.push(mi('goto-shots', `🎬 Shots (${sc.shots.length})`, { scene: sc.id }));
    if (floating && sc.placeSuggestion && !sc.placeSuggestion.pending) items.push(mi('scene-place', `⤴ Place it where the Judge says (${sc.placeSuggestion.after ? `after ${d.scenes[sc.placeSuggestion.after]?._num}` : 'first'})`, { scene: sc.id, after: sc.placeSuggestion.after || '' }));
    if (floating) items.push(mi('scene-place', '⤴ Place it at the end', { scene: sc.id, after: d.order.at(-1) || '' }), mi('scene-suggest', '⚖️ Ask the Judge where it fits', { scene: sc.id }));
    items.push('<div class="msep"></div>', mi('pacing', '🩺 Pacing check', { scene: sc.id }), mi('send-bs', '💡 Brainstorm this scene', { scene: sc.id, type: 'scene' }), mi('send-bs', '💬 Brainstorm its dialogue', { scene: sc.id, type: 'dialogue' }));
    if (!sc.lock) items.push('<div class="msep"></div>', !floating ? mi('scene-unplace', 'Take it out of the order', { scene: sc.id }) : '', mi('scene-del', 'Delete scene', { scene: sc.id }, 'danger'));
    return items;
  }

  function notesPanel(d, sc, ro) {
    const c = sc.check;
    const icon = { ok: '✅', warn: '⚠️', block: '❌' };
    let out = '';
    if (c?.state === 'checking' && c.hash === sc._hash && !state.botOnline && !ro && d.isMain) out += `<div class="nrow">The AI is off. <button class="small" data-act="judge-skip" data-scene="${sc.id}">Lock without the Judge (demo)</button></div>`;
    if (c?.state === 'done' && c.hash === sc._hash && c.notes.some((n) => n.verdict !== 'ok')) {
      out += `<div class="ngroup"><div class="nlabel">The Judge${sc.lock ? ', when it locked this scene' : ''}</div>${c.notes.filter((n) => n.verdict !== 'ok').map((n) => { const i = c.notes.indexOf(n); return `<div class="nrow ${n.dismissed ? 'dim' : ''}">${icon[n.verdict]} ${esc(n.note)} ${n.verdict === 'warn' && !n.dismissed && !ro ? `<button class="ghost small" data-act="dismiss" data-scene="${sc.id}" data-idx="${i}">we know, it's intentional</button>` : n.dismissed ? '<span class="muted small">intentional</span>' : ''}</div>`; }).join('')}</div>`;
    }
    if (sc.lock && sc.lock.hash !== sc._hash) {
      const e = sc.editCheck;
      out += `<div class="ngroup"><div class="nlabel">Changed since locking</div>
        ${e?.state === 'done' ? e.notes.filter((x) => x.verdict !== 'ok').map((x) => `<div class="nrow">${icon[x.verdict]} ${esc(x.note)}</div>`).join('') : ''}
        ${diffAgainst(sc.lock.hash, sc)}
        <div class="nrow">${!ro && d.isMain ? `<button class="small" data-act="lock" data-scene="${sc.id}">Lock again as it is now</button>` : ''}${sc.shots.length && d.isMain ? ` <a href="#shots" class="small" data-act="goto-shots" data-scene="${sc.id}">See its shots ›</a>` : ''}</div></div>`;
    }
    if (sc.pacing && !sc.pacing.pending) {
      out += `<div class="ngroup"><div class="nlabel">Pacing <span class="muted">· asked by ${esc(sc.pacing.by)}</span> <button class="ghost small" data-act="pacing-x" data-scene="${sc.id}">dismiss</button></div><div class="nrow">${md(sc.pacing.summary)}</div>${sc.pacing.notes.map((n) => `<div class="nrow">• ${n.block ? `<a href="#" data-act="flash" data-block="${n.block}">line ${blockIndex(sc, n.block)}</a>: ` : ''}${esc(n.note)}</div>`).join('')}</div>`;
    }
    if (d.floating.includes(sc.id) && sc.placeSuggestion && !sc.placeSuggestion.pending) {
      const s = sc.placeSuggestion;
      out += `<div class="ngroup"><div class="nlabel">Where it fits</div><div class="nrow">${s.reason ? `<i>${esc(s.reason)}</i>` : ''} ${ro ? '' : `<button class="small" data-act="scene-place" data-scene="${sc.id}" data-after="${s.after || ''}">Place it there</button>`}</div></div>`;
    }
    return `<div class="notes" data-key="nt-${sc.id}">${out || '<div class="nrow muted">Nothing to see.</div>'}</div>`;
  }

  function typeMenu(scene, after, convertBlock) {
    return Object.values(state.blockTypes).map((x) => `<button class="tbtn" data-act="${convertBlock ? 'slash-type' : 'block-add'}" data-scene="${scene}" data-after="${after}" data-block="${convertBlock || ''}" data-type="${x.key}" title="${esc(x.hint)}">${esc(x.name)}</button>`).join('');
  }
  function insRow(sc, afterId, where = '') {
    const key = `${afterId || 'top'}${where === 'end' ? ':end' : ''}`;
    const open = ui.insert && ui.insert.scene === sc.id && ui.insert.key === key;
    const after = where === 'top' ? 'top' : where === 'end' ? (afterId || 'top') : afterId;
    return `<div class="ins ${open ? 'open' : ''} ${where}" data-key="ins-${sc.id}-${key}">${open
      ? `<div class="tmenu">${typeMenu(sc.id, after)}<button class="ghost small" data-act="ins-close">×</button></div>`
      : `<button class="insbtn" data-act="ins" data-scene="${sc.id}" data-key2="${key}" title="add a line here">+</button>`}</div>`;
  }

  function blockEditor(d, sc, b, ro) {
    const sel = ui.sel.scene === sc.id && ui.sel.ids.includes(b.id);
    const trying = ui.trying?.includes(b.id);
    const editing = Object.entries(state.presence).filter(([n, p]) => n !== me && p.block === b.id).map(([n]) => `<span class="who">${esc(n)}</span>`).join('');
    const F = (field, attrs = '') => `data-field="${field}" data-key="f-${b.id}-${b.type}-${field}" ${ro ? 'readonly' : ''} ${attrs}`;
    const v = (f) => esc(val(b.id, f, b[f]));
    let body = '';
    if (b.type === 'heading') body = `<select ${F('intExt')} ${ro ? 'disabled' : ''}>${['INT.', 'EXT.', 'INT./EXT.', ''].map((o) => `<option value="${o}" ${val(b.id, 'intExt', b.intExt) === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select><input class="loc" ${F('location', 'placeholder="LOCATION" maxlength="120"')} value="${v('location')}"><span class="dash">-</span><input class="time" ${F('time', 'placeholder="TIME" maxlength="40"')} value="${v('time')}">`;
    else if (b.type === 'action') body = `<textarea class="auto" rows="1" ${F('text', 'placeholder="Action…"')}>${v('text')}</textarea>`;
    else if (b.type === 'dialogue') body = `<input class="char" list="chars" ${F('character', 'placeholder="CHARACTER" maxlength="40"')} value="${v('character')}"><input class="paren" ${F('paren', 'placeholder="(parenthetical)" maxlength="80"')} value="${v('paren')}"><textarea class="auto line" rows="1" ${F('line', 'placeholder="Line…"')}>${v('line')}</textarea>`;
    else if (b.type === 'transition') body = `<input class="trans" list="transitions" ${F('text', 'placeholder="CUT TO:" maxlength="60"')} value="${v('text')}">`;
    else body = `<textarea class="auto" rows="1" ${F('text', 'placeholder="Note for the team (never printed)"')}>${v('text')}</textarea>`;
    const firstOfAlt = b.alt && sc.blocks.find((x) => x.alt?.group === b.alt.group) === b;
    const alt = firstOfAlt ? `<div class="altbar">↳ Alternate · ${esc(b.alt.personality)}${b.alt.twist ? ` · ${esc(b.alt.twist)}` : ''} · ${esc(b.alt.by)}${ro ? '' : ` <button class="small" data-act="alt-use" data-scene="${sc.id}" data-block="${b.id}">Use it</button><button class="ghost small" data-act="alt-remove" data-scene="${sc.id}" data-block="${b.id}">Remove</button>`}</div>` : '';
    return `<div class="blk blk-${b.type} ${sel ? 'sel' : ''} ${trying ? 'trying' : ''} ${b.alt ? 'alt' : ''}" data-key="b-${b.id}" data-block="${b.id}" data-scene="${sc.id}">
      ${alt}
      <div class="gut" draggable="true" data-drag="blocks" data-act="sel" data-scene="${sc.id}" data-block="${b.id}" title="drag to move · click to pick">⋮⋮</div>
      <div class="bb">${body}</div>
      <div class="bt">${editing}${ro ? '' : `<button class="ghost x" data-act="block-del" data-scene="${sc.id}" data-block="${b.id}" title="delete line">×</button>`}</div>
      ${ui.slash === b.id ? `<div class="slash">${typeMenu(sc.id, '', b.id)}</div>` : ''}
    </div>`;
  }

  function blockView(b, cls = '') {
    if (b.type === 'heading') return `<div class="rv rv-h ${cls}">${esc(headingText(b) || '—')}</div>`;
    if (b.type === 'action') return `<div class="rv rv-a ${cls}">${esc(b.text)}</div>`;
    if (b.type === 'dialogue') return `<div class="rv rv-d ${cls}"><div class="c">${esc((b.character || '').toUpperCase())}</div>${b.paren ? `<div class="p">(${esc(b.paren.replace(/^\(|\)$/g, ''))})</div>` : ''}<div class="l">${esc(b.line)}</div></div>`;
    if (b.type === 'transition') return `<div class="rv rv-t ${cls}">${esc((b.text || '').toUpperCase())}</div>`;
    return `<div class="rv rv-n ${cls}">${esc(b.text)}</div>`;
  }

  // ---------------------------------------------------------------- AI options panel (opens when asked)
  async function openGen(input) {
    const j = myGen();
    if (j) await api(j.result ? 'gen/done' : 'gen/clear', { job: j.id });
    ui.trying = null;
    ui.gen.open = true; ui.gen.ctl = false; ui.gen.input = input;
    render();
  }
  function genView(d, ro) {
    const g = ui.gen;
    const job = myGen();
    const jd = job && state.drafts[job.draft];
    const inp = g.input && state.drafts[g.input.draft]?.scenes[g.input.scene] ? g.input : null;
    const isc = inp && state.drafts[inp.draft].scenes[inp.scene];
    let inBlocks = inp ? (inp.refine || inp.blocks.map((id) => isc.blocks.find((b) => b.id === id)).filter(Boolean)) : [];
    if (inp && !inBlocks.length && job?.original) inBlocks = job.original;
    const canTry = job && canEdit(jd);
    const applied = job?.applied;
    const opts = job?.result?.options || [];
    const showCtl = !job || g.ctl;
    const voice = `${pers(g.personality, g.custom)}${g.twist !== 'none' ? ` · ${state.twists[g.twist].emoji} ${esc(state.twists[g.twist].name)}` : ''}`;
    return `<div class="genhead"><b>✨ Options</b>${inp ? `<span class="muted small">${inp.refine ? 'refining · ' : ''}${plural(inBlocks.length, 'line')} · ${esc(isc._num ? `${isc._num} ` : '')}${esc(isc.title)}</span>` : ''}<span class="grow"></span><button class="icon" data-act="gen-close" title="close">×</button></div>
      ${inp ? `<div class="preview">${inBlocks.map((b) => blockView(b)).join('')}</div>` : '<div class="genempty">Click ⋮⋮ beside lines in the script to pick them, or drag them here.</div>'}
      ${showCtl ? `<div class="genctl">
        <select data-act="gen-pers" title="voice">${Object.values(state.personalities).map((p) => `<option value="${p.key}" ${g.personality === p.key ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`).join('')}</select>
        ${g.personality === 'custom' ? `<input data-genfield="custom" value="${esc(g.custom)}" placeholder="the voice, in one line" maxlength="300">` : ''}
        <div class="twists">${Object.values(state.twists).map((t) => `<button class="tw ${g.twist === t.key ? 'on' : ''}" data-act="gen-twist" data-tw="${t.key}" title="${esc(t.rule)}">${t.emoji} ${esc(t.name)}</button>`).join('')}</div>
        <input data-genfield="ask" value="${esc(g.ask)}" placeholder="anything specific? (optional)" maxlength="400">
        <button class="primary wide" data-act="gen-go" ${inp ? '' : 'disabled'}>${opts.length ? 'New options' : 'Get options'}</button>
      </div>` : `<button class="voiceline" data-act="gen-ctl">${voice} · <u>change</u></button>`}
      ${job ? `<div class="results" data-key="res-${job.id}">
        ${!opts.length ? `<div class="genwait">${busyLabel(job) || '…'}</div>` : ''}
        ${opts.length && canTry ? `<button class="opt orig ${applied ? '' : 'cur'}" data-act="gen-try" data-job="${job.id}" data-opt="original">${applied ? '↩ Back to the original' : '● The original is in the script'}</button>` : ''}
        ${opts.map((o, i) => `<div class="opt ${applied?.option === i ? 'cur' : ''} ${canTry ? 'clickable' : ''}" data-key="opt-${job.id}-${i}" ${canTry ? `data-act="gen-try" data-job="${job.id}" data-opt="${i}"` : ''}>
          <div class="onote">${esc(o.note)}${applied?.option === i ? ' <span class="incur">in the script</span>' : ''}</div><div class="preview">${o.blocks.map((b) => blockView(b)).join('')}</div>
          <div class="oacts">${canTry ? `<button class="ghost small" data-act="gen-alt" data-job="${job.id}" data-opt="${i}" title="add it next to the lines, to decide later">keep as alternate</button>` : ''}<button class="ghost small" data-act="gen-refine" data-job="${job.id}" data-opt="${i}">refine this</button></div></div>`).join('')}
        ${opts.length ? `<button class="primary wide" data-act="gen-done" data-job="${job.id}">Done</button>` : ''}
      </div>` : ''}`;
  }

  // ---------------------------------------------------------------- Board
  function boardView() {
    const d = D();
    const ro = !canEdit(d);
    const floats = d.floating.map((id) => d.scenes[id]);
    return `<main class="board">
      <div class="cards" data-drop="order">${d.order.map((id) => boardCard(d, d.scenes[id], ro)).join('')}
        ${ro ? '' : '<button class="addcard" data-act="scene-add" data-after="end">+ New scene</button>'}</div>
      <div class="trayh">Not placed${floats.length ? ` <span>${floats.length}</span>` : ''}</div>
      <div class="tray ${floats.length ? '' : 'empty'}" data-drop="tray">${floats.map((sc) => trayCard(d, sc, ro)).join('') || '<div class="trayhint">Drag a card here to take it out of the order. Scenes from Brainstorm land here too.</div>'}</div>
    </main>`;
  }
  function boardCard(d, sc, ro) {
    const h = sc.blocks.find((b) => b.type === 'heading');
    const first = sc.blocks.find((b) => b.type === 'action');
    return `<div class="bcard" data-key="bc-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}" data-drop="scene">
      <div class="bctop"><span class="bnum">${sc._num}</span>${sc.lock ? '<span class="lockmark">🔒</span>' : ''}<span class="grow"></span>
        ${ro || sc.lock ? '' : `<div class="menuwrap">${menuBtn(`card:${sc.id}`)}${menu(`card:${sc.id}`, [mi('scene-unplace', 'Take it out of the order', { scene: sc.id }), mi('scene-del', 'Delete scene', { scene: sc.id }, 'danger')], 'right')}</div>`}</div>
      <input class="btitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''} maxlength="120">
      <div class="bhead">${esc(h ? headingText(h) : '')}</div>
      <div class="bsum">${esc((first?.text || '').slice(0, 110))}</div>
      <a class="bopen" href="#write" data-act="goto-scene" data-scene="${sc.id}">Open ›</a>
    </div>`;
  }
  function trayCard(d, sc, ro) {
    const s = sc.placeSuggestion;
    return `<div class="tcard" data-key="tc-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}">
      <div class="bctop"><input class="btitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''}><span class="grow"></span>
        ${ro ? '' : `<div class="menuwrap">${menuBtn(`card:${sc.id}`)}${menu(`card:${sc.id}`, [mi('scene-suggest', '⚖️ Ask the Judge where it fits', { scene: sc.id }), mi('scene-place', 'Place it at the end', { scene: sc.id, after: d.order.at(-1) || '' }), mi('scene-del', 'Delete scene', { scene: sc.id }, 'danger')], 'right')}</div>`}</div>
      ${sc.from ? `<div class="bsum">${esc(sc.from)}</div>` : ''}
      ${s?.pending ? '<div class="sug">⚖️ looking for where it fits…</div>' : s ? `<div class="sug">⚖️ fits ${s.after ? `after ${d.scenes[s.after]?._num} ${esc(d.scenes[s.after]?.title || '?')}` : 'at the start'}${ro ? '' : ` <button class="small" data-act="scene-place" data-scene="${sc.id}" data-after="${s.after || ''}">Place it</button>`}</div>` : ''}
      <a class="bopen" href="#write" data-act="goto-scene" data-scene="${sc.id}">Open ›</a>
    </div>`;
  }

  // ---------------------------------------------------------------- Shots: the breakdown only (images, video and sound are made in their own sections)
  function shotsView() {
    const d = D();
    if (!d.isMain) return '<main class="center-msg"><p>Shots come from Main.</p><button class="small" data-act="to-main">Go to Main</button></main>';
    const ro = !canEdit(d);
    const locked = d.order.map((id) => d.scenes[id]).filter((sc) => sc.lock);
    const waiting = d.order.length - locked.length;
    return `<main class="shots">
      ${locked.length ? locked.map((sc) => shotScene(d, sc, ro)).join('') : '<div class="empty center">No locked scenes yet. In Write, ⋯ next to a scene title → Lock scene.</div>'}
      ${waiting ? `<div class="muted small center">${plural(waiting, 'scene')} not locked yet</div>` : ''}
    </main>`;
  }

  function shotScene(d, sc, ro) {
    const changed = sc.lock.hash !== sc._hash;
    const bJob = jobsFor(sc.id, 'breakdown').at(-1);
    const working = busy(bJob);
    const total = sc.shots.reduce((t, s) => t + (Number(s.duration) || 0), 0);
    return `<section class="sscene" data-key="ss-${sc.id}" id="shots-${sc.id}">
      <header class="sh"><span class="snum">${sc._num}</span><span class="sttl">${esc(sc.title)}</span><span class="muted small">${plural(sc.shots.length, 'shot')}${total ? ` · ${total} s` : ''}</span><span class="grow"></span>
        ${ro ? '' : `<div class="menuwrap">${menuBtn(`shots:${sc.id}`)}${menu(`shots:${sc.id}`, [
          mi('breakdown', sc.shots.length ? '✨ Propose shots again' : '✨ Propose shots', { scene: sc.id }),
          mi('shot-add', '+ Add a shot', { scene: sc.id }),
          sc.shots.some((s) => s.status !== 'approved') ? mi('shot-approve-all', 'Mark all final', { scene: sc.id }) : '',
          mi('goto-scene', 'Open the scene', { scene: sc.id }),
        ], 'right')}</div>`}
      </header>
      ${changed && sc.shots.length && !working ? `<div class="attn static"><span class="warn">The scene changed after it was locked, so these shots may need a look.</span>${ro ? '' : ` <button class="small" data-act="goto-scene" data-scene="${sc.id}">See the change</button><button class="small" data-act="breakdown" data-scene="${sc.id}">✨ Propose again</button>`}</div>` : ''}
      ${working ? `<div class="attn static"><span class="info">✨ proposing shots · ${busyLabel(bJob)}</span></div>` : ''}
      ${sc.shots.length ? `<div class="stable">${sc.shots.map((s) => shotRow(d, sc, s, ro)).join('')}</div>` : working ? '' : `<div class="empty small">No shots yet.${ro ? '' : ` <button class="small" data-act="breakdown" data-scene="${sc.id}">✨ Propose shots</button>`}</div>`}
    </section>`;
  }

  function shotRow(d, sc, s, ro) {
    const F = (f, extra = '') => `data-shotf="${f}" data-scene="${sc.id}" data-shot="${s.id}" data-key="sf-${s.id}-${f}" ${ro ? 'readonly' : ''} ${extra}`;
    const v = (f) => esc(val(s.id, f, s[f]));
    const more = ui.shotMore[s.id];
    const covers = s.blocks.map((id) => blockIndex(sc, id)).filter((x) => x !== '?');
    return `<div class="shot ${s.status}" data-key="sr-${s.id}">
      <div class="shmain">
        <span class="sn" title="stable id ${s.id}">${s._num}</span>
        <input class="sfr" list="framings" ${F('framing')} value="${v('framing')}" title="framing">
        <textarea class="auto sact" rows="1" ${F('action', 'placeholder="what we see"')}>${v('action')}</textarea>
        <input class="sdur" type="number" min="0" step="0.5" ${F('duration')} value="${v('duration')}" title="seconds"><span class="muted small">s</span>
        ${s.status === 'approved' ? `<button class="final on" ${ro ? 'disabled' : ''} data-act="shot-approve" data-scene="${sc.id}" data-shot="${s.id}" data-yes="0" title="final · click to undo">✓</button>` : `<button class="final" ${ro ? 'disabled' : ''} data-act="shot-approve" data-scene="${sc.id}" data-shot="${s.id}" data-yes="1" title="mark final">✓</button>`}
        <button class="ghost small" data-act="shot-more" data-shot="${s.id}" title="details">${more ? '▴' : '▾'}</button>
      </div>
      ${more ? `<div class="shmore">
        <label>Camera<input ${F('camera', 'placeholder="static, dolly in…"')} value="${v('camera')}"></label>
        <label>Characters<input ${F('characters')} value="${v('characters')}"></label>
        <label>Location<input ${F('location')} value="${v('location')}"></label>
        <label>Dialogue / VO<textarea class="auto" rows="1" ${F('dialogue')}>${v('dialogue')}</textarea></label>
        <label>References<input ${F('refs', 'placeholder="Section 3"')} value="${v('refs')}"></label>
        <div class="cov"><span class="muted small">Covers lines</span> ${covers.length ? covers.join(', ') : '—'} ${ro ? '' : `<button class="ghost small" data-act="cover-edit" data-shot="${ui.coverEdit === s.id ? '' : s.id}">${ui.coverEdit === s.id ? 'done' : 'change'}</button>`}
          ${ui.coverEdit === s.id ? `<div class="coverpick">${sc.blocks.filter((b) => b.type !== 'note' && !b.alt).map((b) => `<label><input type="checkbox" data-act="cover-tick" data-scene="${sc.id}" data-shot="${s.id}" data-block="${b.id}" ${s.blocks.includes(b.id) ? 'checked' : ''}> ${blockIndex(sc, b.id)} · ${esc((b.type === 'heading' ? headingText(b) : b.type === 'dialogue' ? `${b.character}: ${b.line}` : b.text).slice(0, 60))}</label>`).join('')}</div>` : ''}</div>
        ${ro ? '' : `<div class="shtools"><span class="grow"></span><button class="ghost small" data-act="shot-up" data-scene="${sc.id}" data-shot="${s.id}">move up</button><button class="ghost small" data-act="shot-down" data-scene="${sc.id}" data-shot="${s.id}">move down</button><button class="ghost small danger" data-act="shot-del" data-scene="${sc.id}" data-shot="${s.id}">delete</button></div>`}
      </div>` : ''}
    </div>`;
  }

  // ================================================================ HISTORY ROOM
  const SESH_STATUS = { open: 'open', saved: 'to review', approved: 'approved', tagged: 'tagged' };
  const dur = (a, b) => { const m = Math.max(1, Math.round(((b || Date.now()) - a) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  function historyView(sub) {
    if (sub === 'drafts') return draftsView();
    if (sub === 'compare') return `<main class="room">${compareView()}</main>`;
    return seshesView();
  }

  function seshesView() {
    const all = Object.values(state.seshes).sort((a, b) => (b.status === 'open') - (a.status === 'open') || (b.endedAt || b.lastAt) - (a.endedAt || a.lastAt));
    const f = ui.seshFilter;
    const list = all.filter((x) => f === 'all' || x.status === f);
    const count = (k) => all.filter((x) => x.status === k).length;
    const flt = (k, label) => (k === 'all' || count(k) ? `<button class="link ${f === k ? 'on' : ''}" data-act="sesh-filter" data-f="${k}">${label}${k !== 'all' ? ` ${count(k)}` : ''}</button>` : '');
    return `<main class="room">
      <div class="filters">${[flt('all', 'All'), flt('saved', 'To review'), flt('tagged', 'Tagged'), flt('approved', 'Approved')].filter(Boolean).join('<i>·</i>')}</div>
      <div class="slist">${list.length ? list.map((x) => seshRow(x) + (ui.sesh === x.id ? seshDetail(x) : '')).join('') : '<div class="empty">Nothing here yet. Your work becomes a sesh as soon as you change something.</div>'}</div>
    </main>`;
  }
  function seshRow(x) {
    const d = state.drafts[x.draft];
    return `<div class="srow2 st-${x.status} ${ui.sesh === x.id ? 'cur' : ''}" data-key="sr2-${x.id}" data-act="sesh-open" data-sesh="${x.id}">
      <span class="sst ${x.status}">${SESH_STATUS[x.status] || x.status}</span>
      <span class="stt"><span><b>${esc(x.title)}</b>${x.tags?.length ? ` ${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}` : ''}</span>
        <span class="muted small">${d && !d.isMain ? `${esc(d.name)} · ` : ''}${esc((x.people.length ? x.people : [x.by]).join(' & '))} · ${new Date(x.startedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${plural(x.changes, 'change')}</span></span>
      <span class="chev">${ui.sesh === x.id ? '▴' : '▾'}</span></div>`;
  }
  function seshDetail(x) {
    const d = state.drafts[x.draft];
    const ed = canEdit(d);
    if (!ui.seshData || ui.seshData.sesh.id !== x.id || ui.seshData.stamp !== `${x.changes}:${x.status}:${x.v}`) loadSesh(x);
    const data = ui.seshData?.sesh.id === x.id ? ui.seshData : null;
    const actions = x.status === 'open'
      ? (ed ? `<button class="primary small" data-act="sesh-end" data-draft="${x.draft}">Save as a version</button>` : '')
      : `<button class="small ${x.status === 'approved' ? 'on' : ''}" data-act="sesh-review" data-sesh="${x.id}" data-status="approved">✓ Approve</button>
         <button class="small ${x.status === 'tagged' ? 'on' : ''}" data-act="sesh-tag" data-sesh="${x.id}">Tag what needs work</button>
         ${ed ? `<button class="small" data-act="sesh-followup" data-sesh="${x.id}">Pick it up again</button>` : ''}
         <span class="grow"></span>
         ${ed ? `<button class="ghost small danger" data-act="sesh-revert" data-sesh="${x.id}">Undo this sesh</button>` : ''}`;
    return `<div class="sdetail" data-key="sd-${x.id}">
      <div class="sdhead"><input class="sdtitle" data-seshtitle="${x.id}" value="${esc(val(x.id, 'title', x.title))}" maxlength="80" title="rename">
        <span class="muted small">${x.v ? `version ${x.v} of ${esc(draftLabel(d))} · ` : ''}${dur(x.startedAt, x.endedAt)}${x.followsUp && state.seshes[x.followsUp] ? ` · follows “${esc(state.seshes[x.followsUp].title)}”` : ''}${x.reviewedBy ? ` · ${x.status} by ${esc(x.reviewedBy)}` : ''}</span></div>
      ${x.status === 'tagged' && (x.note || x.tags?.length) ? `<div class="snote">${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')} ${esc(x.note)}</div>` : ''}
      <div class="sreview">${actions}</div>
      <div class="cols2">
        <div><div class="mlabel">What happened</div><div class="sevents">${data ? data.events.map((e) => `<div class="ev" data-key="se-${e.id}"><span class="muted">${new Date(e.ts).toTimeString().slice(0, 5)}</span> <b>${esc(e.who)}</b> ${esc(e.text)}${e.personality ? ` <span class="muted">· ${esc(e.personality)}${e.twist ? ` · ${esc(e.twist)}` : ''}</span>` : ''}</div>`).join('') || '<div class="muted small">nothing logged</div>' : '<div class="muted small">…</div>'}</div></div>
        <div><div class="mlabel">What changed in the script</div>${data?.before && data?.after ? sideBySide({ snap: data.before, name: 'Before', v: x.baseV || null }, { snap: data.after, name: x.status === 'open' ? 'Now' : 'After', v: x.v || null }, true) : '<div class="muted small">…</div>'}</div>
      </div>
    </div>`;
  }
  async function loadSesh(x) {
    const stamp = `${x.changes}:${x.status}:${x.v}`;
    if (ui.seshLoading === x.id + stamp) return;
    ui.seshLoading = x.id + stamp;
    const r = await getJSON(`/api/sesh?id=${x.id}`);
    ui.seshData = { ...r, stamp };
    ui.seshLoading = null;
    render();
  }

  function draftsView() {
    const list = Object.values(state.drafts).sort((a, b) => (b.isMain - a.isMain) || a.createdAt - b.createdAt);
    const vv = ui.viewVersion;
    return `<main class="room">
      <div class="dlist">${list.map((d) => draftRow(d) + (vv?.draft === d.id ? versionViewer(vv) : '')).join('')}</div>
      ${list.some((d) => d.owner === me) ? '' : '<div class="muted small center">You have no draft of your own. ⋯ on Main → Make my own draft.</div>'}
    </main>`;
  }
  function draftRow(d) {
    const ed = canEdit(d);
    const cur = d.id === D().id;
    const open = d.sesh && state.seshes[d.sesh];
    const sub = d.isMain ? 'everyone writes here · the pipeline uses it' : `${d.owner === me ? 'yours' : `${esc(d.owner)}'s`}${d.forkedFrom ? ` · from ${esc(d.forkedFrom.name)}${d.forkedFrom.v ? ` v${d.forkedFrom.v}` : ''}` : ''}${d.formerName ? ` · was ${esc(d.formerName)}` : ''}`;
    const showV = ui.draftOpen[d.id];
    return `<div class="drow ${cur ? 'cur' : ''}" data-key="dr-${d.id}">
      <div class="dtop">
        <span class="dname">${d.isMain ? '⭐ Main' : ed && d.owner === me ? `<input data-dname="${d.id}" value="${esc(d.name)}" maxlength="60">` : esc(d.name)}</span>
        <span class="muted small">${sub} · edited ${ago(d.editedAt)}${open ? ' · <span class="reddot"></span> sesh open' : ''}</span>
        <span class="grow"></span>
        ${cur ? '<span class="muted small">you are here</span>' : `<button class="small" data-act="open-draft" data-draft="${d.id}">Open</button>`}
        <div class="menuwrap">${menuBtn(`draft:${d.id}`)}${menu(`draft:${d.id}`, [
          mi('fork', d.isMain ? 'Make my own draft from it' : 'Copy it into a draft of my own', { draft: d.id }),
          !d.isMain ? mi('make-main', '⭐ Make it Main…', { draft: d.id }) : '',
          !d.isMain ? mi('cmp-main', 'Compare with Main', { draft: d.id }) : '',
          ed && open ? mi('sesh-end', 'Save its open sesh', { draft: d.id }) : '',
        ], 'right')}</div>
      </div>
      <button class="link small" data-act="draft-versions" data-draft="${d.id}">${plural(d.versions.length, 'version')} ${showV ? '▴' : '▾'}</button>
      ${showV ? `<div class="vchips">${[...d.versions].reverse().map((v) => `<button class="vchip ${ui.viewVersion?.draft === d.id && ui.viewVersion?.v === v.n ? 'on' : ''}" data-act="view-version" data-draft="${d.id}" data-v="${v.n}" title="${esc(v.by)} · ${new Date(v.ts).toLocaleString()}">v${v.n} ${esc(v.name || v.reason || '')}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  function versionViewer(vv) {
    const d = state.drafts[vv.draft];
    if (!vv.data) return '<div class="vview">…</div>';
    const s = vv.data.snap;
    const targets = Object.values(state.drafts).filter((x) => canEdit(x));
    return `<div class="vview" data-key="vv-${vv.draft}-${vv.v}">
      <div class="vhead"><b>v${vv.v}</b> <span class="muted">${esc(vv.data.label || '')}</span><span class="grow"></span>
        ${canEdit(d) ? `<button class="small" data-act="restore" data-draft="${d.id}" data-v="${vv.v}">Restore it</button>` : ''}
        <button class="small" data-act="cmp-now" data-draft="${d.id}" data-v="${vv.v}">Compare with now</button>
        <div class="menuwrap">${menuBtn(`ver:${vv.v}`)}${menu(`ver:${vv.v}`, [mi('fork', 'Make a draft from this version', { draft: d.id, v: vv.v })], 'right')}</div>
        <button class="icon" data-act="close-version">×</button></div>
      ${[...s.order, ...s.floating].map((id) => { const sc = s.scenes[id]; const n = s.order.indexOf(id) + 1 || ''; return `<div class="vscene"><div class="ch"><span>${n} ${esc(sc.title)}</span><span class="grow"></span><select class="small quiet" data-act="pull-v" data-from="${d.id}" data-v="${vv.v}" data-scene="${id}"><option value="">pull into…</option>${targets.map((x) => `<option value="${x.id}">${esc(draftLabel(x))}</option>`).join('')}</select></div>${sc.blocks.filter((b) => !b.alt).map((b) => blockView(b)).join('')}</div>`; }).join('')}
    </div>`;
  }

  // ================================================================ BIBLE ROOM
  function bibleView(sub) {
    if (sub === 'characters') return `<main class="room narrow">
      <div class="chips big">${state.project.characters.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      <input class="addchar" data-addchar="1" placeholder="+ add a character, Enter" maxlength="40">
      <p class="muted small">Names typed in dialogue join the list on their own.</p></main>`;
    if (sub === 'brainstorm') return brainstormView();
    if (sub === 'notes') return `<main class="room narrow">
      <div class="mlabel">Logline</div><textarea class="auto quietbox" rows="2" data-pfield="logline">${esc(val('project', 'logline', state.project.logline))}</textarea>
      ${state.project.notes ? `<div class="mlabel">From the Idea</div><div class="small pre">${esc(state.project.notes)}</div>` : ''}
      <div class="mlabel">Intentional exceptions <span class="muted">· Judge notes marked as intended</span></div>
      ${state.exceptions.length ? state.exceptions.map((x, i) => `<div class="small exc" data-key="ex-${i}"><b>${esc(x.scene)}</b> ${esc(x.note)} <span class="muted">· ${esc(x.who)}: “${esc(x.reason)}”</span></div>`).join('') : '<div class="muted small">None.</div>'}
    </main>`;
    return `<main class="room narrow">${factsLedger()}</main>`;
  }

  function brainstormView() {
    if (!ui.brainstorm && !ui.brainstormLoading) loadBrainstorm();
    const cards = ui.brainstorm?.cards || [];
    const m = M();
    const TYPE = { idea: 'Ideas', arc: 'Arcs (canon)', character: 'Characters', scene: 'Scenes', dialogue: 'Dialogue' };
    const by = {}; for (const c of cards) (by[c.type] ||= []).push(c);
    const act = (c) => {
      if (c.type === 'scene') return c.imported ? '<span class="muted small">in Not placed</span>' : `<button class="small" data-act="import" data-card="${c.id}">Add to the script</button>`;
      if (c.type === 'dialogue') return `<select class="small quiet" data-act="import-dlg" data-card="${c.id}"><option value="">${c.imported ? 'added · again into…' : 'Add its lines to…'}</option>${m.order.map((id) => `<option value="${id}">${m.scenes[id]._num} ${esc(m.scenes[id].title)}</option>`).join('')}</select>`;
      if (c.type === 'character') return c.imported ? '<span class="muted small">in the list</span>' : `<button class="small" data-act="import" data-card="${c.id}">Add to characters</button>`;
      if (c.type === 'idea') return `<button class="ghost small" data-act="import-logline" data-card="${c.id}">Use its logline</button>`;
      return '<span class="muted small">the Judge reads it</span>';
    };
    return `<main class="room narrow">
      <div class="nrow muted small">${ui.brainstormLoading ? 'Looking in Brainstorm…' : ui.brainstorm?.source === 'none' ? 'The Brainstorm demo isn’t running.' : `${plural(cards.length, 'card')} promoted in Brainstorm`} <button class="link" data-act="bs-refresh">refresh</button></div>
      ${Object.entries(by).map(([t, list]) => `<div class="mlabel">${TYPE[t] || t}</div>${list.map((c) => `<div class="pcard" data-key="pc-${c.id}"><div class="pctop"><b>${esc(c.title)}</b><span class="grow"></span>${act(c)}</div>
        ${c.note ? `<div class="small">${md(c.note)}</div>` : ''}${Object.entries(c.fields).filter(([, v]) => v).map(([k, v]) => `<div class="small"><span class="muted">${esc(k.replace(/_/g, ' '))}</span> ${esc(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</div>`).join('')}`).join('')}
    </main>`;
  }

  // facts: plain sentences under their scene; click to change; a dot when the scene changed since
  function factFlag(f) { const m = M(); const sc = f.scene && m.scenes[f.scene]; return f.doubt || (sc && f.hash && sc._hash !== f.hash ? 'its scene changed since this was written' : ''); }
  function factsToLook() { return (state.facts || []).filter(factFlag); }
  function factsLedger() {
    const m = M();
    const facts = state.facts || [];
    const flagged = factsToLook();
    const review = ui.factReview && flagged.length;
    const shown = review ? flagged : facts;
    const ids = [...m.order, ...m.floating];
    const groups = ids.map((id) => [id, shown.filter((f) => f.scene === id)]).filter(([id, l]) => l.length || (!review && ui.factNew === id));
    const loose = shown.filter((f) => !f.scene || !m.scenes[f.scene]);
    const sceneOpts = (cur) => `<option value="">no scene</option>${ids.map((id) => `<option value="${id}" ${cur === id ? 'selected' : ''}>${m.scenes[id]._num ?? '–'} ${esc(m.scenes[id].title)}</option>`).join('')}`;
    const row = (f) => {
      const flag = factFlag(f);
      const meta = `${f.source === 'team' ? `written by ${f.by}` : 'from the Judge'}${f.edited ? ` · changed by ${f.edited.by}` : ''} · ${ago(f.edited?.at || f.at)}`;
      if (ui.factEdit === f.id) return `<li class="fi editing" data-key="fa-${f.id}"><input class="ftext" data-factedit="${f.id}" value="${esc(val(f.id, 'fact', f.fact))}" maxlength="300"><span class="muted small">Enter to save · Esc</span></li>`;
      return `<li class="fi ${flag ? 'flag' : ''}" data-key="fa-${f.id}">
        <span class="fdot" title="${esc(flag)}"></span>
        <span class="ft" data-act="fact-edit" data-id="${f.id}" title="${esc(meta)} · click to change">${esc(f.fact)}</span>
        <span class="ftools">${ui.factMove === f.id ? `<select class="small quiet" data-factmove="${f.id}">${sceneOpts(f.scene && m.scenes[f.scene] ? f.scene : '')}</select>` : `${flag ? `<button class="ghost small" data-act="fact-ok" data-id="${f.id}">still true</button>` : ''}<button class="ghost small" data-act="fact-move" data-id="${f.id}">move</button><button class="ghost small" data-act="fact-del" data-id="${f.id}">remove</button>`}</span>
        ${review && flag ? `<div class="freason">${esc(flag)}</div>` : ''}
      </li>`;
    };
    const newRow = (scene) => (ui.factNew === (scene || 'none') ? `<li class="fi editing" data-key="fnew-${scene || 'none'}"><input class="ftext" data-factnew="${scene || 'none'}" placeholder="a new fact…" maxlength="300"><span class="muted small">Enter to add · Esc</span></li>` : '');
    const addBtn = (scene) => (review ? '' : `<button class="fadd" data-act="fact-new" data-scene="${scene || 'none'}">+ Add a fact</button>`);
    return `<div class="fhead"><span class="muted small">${plural(facts.length, 'fact')}: what's true in the story so far</span><span class="grow"></span>
        ${flagged.length ? `<button class="link ${review ? 'on' : ''}" data-act="fact-review">${review ? 'Show all' : `<span class="adot"></span> ${flagged.length} may be out of date`}</button>` : ''}</div>
      ${groups.map(([id, list]) => { const sc = m.scenes[id]; return `<section class="fg" data-key="fg-${id}"><a class="fgh" href="#write" data-act="goto-scene" data-scene="${id}">${sc._num ?? ''} ${esc(sc.title)}</a><ul class="fl">${list.map(row).join('')}${newRow(id)}</ul>${addBtn(id)}</section>`; }).join('')}
      ${loose.length || ui.factNew === 'none' ? `<section class="fg" data-key="fg-none"><span class="fgh muted">No scene</span><ul class="fl">${loose.map(row).join('')}${newRow(null)}</ul></section>` : ''}
      ${review ? '' : '<button class="fadd" data-act="fact-new" data-scene="none">+ Add a fact without a scene</button>'}
      <p class="muted small foot">The Judge adds facts when it checks a scene and reads them every time it checks. It never removes one a person wrote or changed.</p>`;
  }
  function saveFact(t) {
    const id = t.dataset.factedit;
    const f = state.facts.find((x) => x.id === id);
    const v = t.value.trim();
    delete local[`${id}:fact`];
    ui.factEdit = null;
    if (f && v !== f.fact) { if (v) api('fact/edit', { id, fact: v }); else api('fact/delete', { id }); }
    render();
  }
  function saveNewFact(t) {
    const v = t.value.trim();
    const scene = t.dataset.factnew === 'none' ? null : t.dataset.factnew;
    ui.factNew = null;
    if (v) api('fact/add', { fact: v, scene });
    render();
  }

  // ================================================================ diffs
  function lcs(a, b) {
    const n = a.length, m = b.length, t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const rows = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { rows.push([a[i], b[j]]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) rows.push([a[i++], null]); else rows.push([null, b[j++]]); }
    while (i < n) rows.push([a[i++], null]); while (j < m) rows.push([null, b[j++]]);
    return rows;
  }
  const strip = (b) => { const { id, alt, ...rest } = b; return rest; };
  const same = (x, y) => JSON.stringify(strip(x)) === JSON.stringify(strip(y));
  function blockDiffRows(A, B) {
    const ma = new Map(A.map((b) => [b.id, b])), mb = new Map(B.map((b) => [b.id, b]));
    return lcs(A.map((b) => b.id), B.map((b) => b.id)).map(([x, y]) => { const a = x && ma.get(x), b = y && mb.get(y); return { a, b, kind: a && b ? (same(a, b) ? 'same' : 'changed') : a ? 'removed' : 'added' }; });
  }
  function diffAgainst(hash, sc, onlyIds = null) {
    const old = ui.snaps[hash];
    if (old === undefined) { ui.snaps[hash] = null; getJSON(`/api/snap?h=${hash}`).then((r) => { ui.snaps[hash] = r.blocks || []; render(); }); }
    if (!old) return '<div class="muted small">…</div>';
    const cur = sc.blocks.filter((b) => b.type !== 'note' && !b.alt);
    const only = onlyIds && onlyIds.length ? new Set(onlyIds) : null;
    const rows = blockDiffRows(old, cur).filter((r) => r.kind !== 'same');
    if (!rows.length) return '<div class="muted small">No change in the script (only notes or alternates).</div>';
    return `<div class="udiff">${rows.map((r) => {
      const faint = only && !only.has(r.a?.id) && !only.has(r.b?.id) ? 'faint' : '';
      if (r.kind === 'removed') return `<div class="dr rem ${faint}">${blockView(r.a)}</div>`;
      if (r.kind === 'added') return `<div class="dr add ${faint}">${blockView(r.b)}</div>`;
      return `<div class="dr chg ${faint}"><div class="was">${blockView(r.a)}</div><div class="now">${blockView(r.b)}</div></div>`;
    }).join('')}</div>`;
  }
  function compareView() {
    const c = ui.compare;
    const opts = [];
    for (const d of Object.values(state.drafts)) {
      opts.push({ k: `${d.id}:`, label: `${draftLabel(d)} · now` });
      for (const v of [...d.versions].reverse()) opts.push({ k: `${d.id}:${v.n}`, label: `${draftLabel(d)} · v${v.n} ${v.name || v.reason || ''}` });
    }
    const sel = (side) => `<select data-act="cmp-pick" data-side="${side}"><option value="">choose…</option>${opts.map((o) => `<option value="${o.k}" ${c[side] === o.k ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    return `<div class="cmpbar">${sel('a')} <span class="muted">and</span> ${sel('b')} <button class="small primary" data-act="cmp-go" ${c.a && c.b ? '' : 'disabled'}>Compare</button></div>${c.data ? sideBySide(c.data.a, c.data.b) : ''}`;
  }
  function sideBySide(A, B, changesOnly = false) {
    const sa = A.snap, sb = B.snap;
    const ids = (s) => [...s.order, ...s.floating];
    const inA = new Set(ids(sa)), inB = new Set(ids(sb));
    const rows = lcs(ids(sa), ids(sb)).filter(([x, y]) => !(x && !y && inB.has(x))).map(([x, y]) => (!x && inA.has(y) ? [y, y] : [x, y]));
    let changed = 0, added = 0, removed = 0;
    const body = rows.map(([x, y]) => {
      const a = x && sa.scenes[x], b = y && sb.scenes[y];
      const na = x ? (sa.order.indexOf(x) + 1 || '–') : '', nb = y ? (sb.order.indexOf(y) + 1 || '–') : '';
      if (!a) { added++; return `<div class="cmprow"><div class="cside empty"></div><div class="cside add"><div class="ch">${nb} ${esc(b.title)} <span class="tag">new</span></div>${b.blocks.filter((z) => !z.alt).map((z) => blockView(z)).join('')}</div></div>`; }
      if (!b) { removed++; return `<div class="cmprow"><div class="cside rem"><div class="ch">${na} ${esc(a.title)} <span class="tag">gone</span></div>${a.blocks.filter((z) => !z.alt).map((z) => blockView(z)).join('')}</div><div class="cside empty"></div></div>`; }
      const br = blockDiffRows(a.blocks.filter((z) => !z.alt), b.blocks.filter((z) => !z.alt));
      const diff = br.some((r) => r.kind !== 'same') || a.title !== b.title;
      if (diff) changed++;
      if (!diff && changesOnly && na === nb) return '';
      const moved = na !== nb ? ` <span class="tag">${na} → ${nb}</span>` : '';
      return `<div class="cmprow ${diff ? '' : 'nodiff'}"><div class="cside"><div class="ch">${na} ${esc(a.title)}</div>${br.map((r) => (r.a ? blockView(r.a, r.kind) : '<div class="rv gap"></div>')).join('')}</div>
        <div class="cside"><div class="ch">${nb} ${esc(b.title)}${moved}</div>${br.map((r) => (r.b ? blockView(r.b, r.kind) : '<div class="rv gap"></div>')).join('')}</div></div>`;
    }).join('');
    const orderChanged = JSON.stringify(sa.order) !== JSON.stringify(sb.order);
    if (changesOnly && !changed && !added && !removed && !orderChanged) return '<div class="muted small">The script’s text didn’t change (locks, shots and notes only).</div>';
    return `<div class="cmpsum">${plural(changed, 'scene')} changed · ${added} new · ${removed} gone${orderChanged ? ' · order changed' : ''}</div>
      <div class="cmphead"><div>${esc(A.name)} ${A.v ? `v${A.v}` : ''}</div><div>${esc(B.name)} ${B.v ? `v${B.v}` : ''}</div></div>${body}`;
  }
  async function runCompare() {
    const [ad, av] = ui.compare.a.split(':'); const [bd, bv] = ui.compare.b.split(':');
    const [a, b] = await Promise.all([getJSON(`/api/version?draft=${ad}&v=${av || ''}`), getJSON(`/api/version?draft=${bd}&v=${bv || ''}`)]);
    ui.compare.data = { a, b }; render();
  }

  // ================================================================ actions
  const blockCtx = (el) => ({ draft: D().id, scene: el.closest('[data-scene]')?.dataset.scene, block: el.closest('[data-block]')?.dataset.block });
  const scrollToScene = (id, prefix = 'scene') => setTimeout(() => document.getElementById(`${prefix}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  app.addEventListener('click', async (e) => {
    if (ui.menu && !e.target.closest('.menuwrap')) { ui.menu = null; render(); } // a click outside an open menu closes it
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return;
    const act = b.dataset.act;
    const d = state && D();
    const ds = b.dataset;
    if (b.classList.contains('mi')) { ui.menu = null; render(); }
    switch (act) {
      case 'noop': return;
      case 'menu': ui.menu = ui.menu === ds.menu ? null : ds.menu; return render();
      case 'rename': { const v = prompt('Your name:', me); if (v && v.trim()) { me = v.trim().slice(0, 40); localStorage.setItem('pi.name', me); if (sessionStorage.getItem('pi.script.name')) sessionStorage.setItem('pi.script.name', me); connect(); } return; }
      case 'notice-x': ui.notice = null; return render();
      case 'guide': ui.guide = !ui.guide; return render();
      case 'tour-tick': { const done = new Set(tourDone()); if (b.checked) done.add(ds.id); else done.delete(ds.id); try { localStorage.setItem(tourKey(), JSON.stringify([...done])); } catch {} return render(); }
      case 'tour-go': {
        e.preventDefault();
        ui.draft = state.mainId; localStorage.setItem('pi.script.draft', ui.draft);
        const sc = ds.title ? Object.values(M().scenes).find((x) => x.title === ds.title) : null;
        if (sc) ui.focusScene = sc.id;
        location.hash = `#${ds.go}`;
        if (sc) scrollToScene(sc.id, ds.go === 'shots' ? 'shots' : 'scene');
        return render();
      }
      case 'start': return api('start', { mode: ds.mode, card: ds.card });
      case 'reset': if (confirm('Reset the demo? Everything is deleted and you start again.')) { await api('reset'); location.hash = ''; } return;
      case 'to-main': ui.draft = state.mainId; localStorage.setItem('pi.script.draft', ui.draft); return render();

      // sesh
      case 'sesh-open': { e.preventDefault(); const inHistory = route()[0] === 'history'; ui.sesh = inHistory && ui.sesh === ds.sesh ? null : ds.sesh; if (!inHistory) location.hash = '#history/seshes'; return render(); }
      case 'sesh-filter': ui.seshFilter = ds.f; return render();
      case 'sesh-end': {
        const dd = state.drafts[ds.draft]; const x = dd?.sesh && state.seshes[dd.sesh]; if (!x) return;
        await flushAll();
        let title = val(x.id, 'title', x.title);
        if (!x.titled && title === x.title) { const t = prompt(`Give this sesh a name. It becomes the version's name:`, x.title); if (t === null) return; title = t.trim() || x.title; }
        ui.menu = null;
        const r = await api('sesh/end', { draft: ds.draft, title });
        if (r.ok) toast(r.status === 'empty' ? 'Nothing changed, nothing to save' : `Saved as version ${r.v}`);
        return;
      }
      case 'sesh-review': return api('sesh/review', { sesh: ds.sesh, status: ds.status });
      case 'sesh-tag': {
        const x = state.seshes[ds.sesh];
        const note = prompt('What needs work?', x.note || ''); if (note === null) return;
        const tags = prompt('Tags, if any (comma separated):', (x.tags || []).join(', ')); if (tags === null) return;
        return api('sesh/review', { sesh: ds.sesh, status: 'tagged', tags, note });
      }
      case 'sesh-followup': { const r = await api('sesh/followup', { sesh: ds.sesh }); if (r.ok) { ui.draft = r.draft; localStorage.setItem('pi.script.draft', r.draft); location.hash = '#write'; toast('A new sesh is open, following up that one'); } return; }
      case 'sesh-revert': if (confirm('Put the draft back to how it was before this sesh? Later changes go too. Everything stays in the versions.')) api('sesh/revert', { sesh: ds.sesh }); return;

      // scenes
      case 'scene-add': {
        const title = prompt('Scene title:', 'New scene'); if (!title) return;
        const r = await api('scene/add', { draft: d.id, after: ds.after === 'end' ? 'end' : ds.after || null, title });
        if (r.ok) { ui.focusScene = r.id; if (route()[0] === 'write') scrollToScene(r.id); }
        return;
      }
      case 'scene-del': if (confirm('Delete this scene? It stays in the versions.')) api('scene/delete', { draft: d.id, scene: ds.scene }); return;
      case 'scene-unplace': return api('scene/unplace', { draft: d.id, scene: ds.scene });
      case 'scene-place': return api('scene/place', { draft: d.id, scene: ds.scene, after: ds.after || null });
      case 'scene-suggest': return api('scene/suggest', { draft: d.id, scene: ds.scene });
      case 'goto-scene': {
        if (e.target.closest('input')) return;
        e.preventDefault();
        ui.focusScene = ds.scene;
        if (route()[0] !== 'write') location.hash = '#write';
        scrollToScene(ds.scene);
        return render();
      }
      case 'goto-shots': location.hash = '#shots'; scrollToScene(ds.scene, 'shots'); return;
      case 'notes-toggle': ui.notesOpen[ds.scene] = !ui.notesOpen[ds.scene]; return render();
      case 'lock': await flushAll(); ui.notesOpen[ds.scene] = false; return api('scene/lock', { draft: d.id, scene: ds.scene });
      case 'unlock': return api('scene/unlock', { draft: d.id, scene: ds.scene });
      case 'judge-skip': return api('scene/judge-skip', { draft: d.id, scene: ds.scene });
      case 'dismiss': { const reason = prompt('Why is it intentional? (kept in the Bible)', 'We know, it’s intentional'); if (reason === null) return; return api('scene/dismiss', { draft: d.id, scene: ds.scene, idx: Number(ds.idx), edit: !!ds.edit, reason }); }
      case 'pacing': ui.notesOpen[ds.scene] = true; return api('scene/pacing', { draft: d.id, scene: ds.scene });
      case 'pacing-x': return api('scene/pacing-clear', { draft: d.id, scene: ds.scene });
      case 'flash': { e.preventDefault(); const el = app.querySelector(`[data-block="${ds.block}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } return; }
      case 'breakdown': { const r = await api('scene/breakdown', { draft: d.id, scene: ds.scene }); if (r.ok && route()[0] !== 'shots') { location.hash = '#shots'; scrollToScene(ds.scene, 'shots'); } return; }
      case 'send-bs': {
        await flushAll();
        const r = await api('scene/send-brainstorm', { draft: d.id, scene: ds.scene, type: ds.type, blocks: ds.type === 'dialogue' && ui.sel.scene === ds.scene ? ui.sel.ids : [] });
        if (r.url) { ui.notice = { html: `A Brainstorm session is ready, loaded with the scene: <a href="${esc(r.url)}" target="_blank">open it ↗</a>` }; render(); }
        return;
      }
      case 'pull': { const r = await api('draft/pull', { from: d.id, scene: ds.scene, into: ds.into }); if (r.ok) toast(`Pulled into ${draftLabel(state.drafts[ds.into])}`); return; }

      // lines
      case 'ins': ui.insert = { scene: ds.scene, key: ds.key2 }; return render();
      case 'ins-close': ui.insert = null; return render();
      case 'block-add': { const after = ds.after === 'top' ? null : ds.after; return addBlockAfter(ds.scene, after, ds.type); }
      case 'slash-type': {
        ui.slash = null;
        const pk = `block:${ds.block}`; if (pend[pk]) { clearTimeout(pend[pk].timer); delete pend[pk]; }
        app.querySelectorAll(`[data-block="${ds.block}"] [data-field]`).forEach((f) => { if (f.value === '/') f.value = ''; });
        await api('block/type', { draft: d.id, scene: ds.scene, block: ds.block, type: ds.type });
        for (const k of Object.keys(local)) if (k.startsWith(ds.block + ':')) delete local[k];
        ui.focusNext = { block: ds.block, type: ds.type, field: { heading: 'location', dialogue: 'character' }[ds.type] || 'text' };
        return render();
      }
      case 'block-del': return api('block/delete', { draft: d.id, scene: ds.scene, block: ds.block });
      case 'alt-use': return api('alt/use', { draft: d.id, scene: ds.scene, block: ds.block });
      case 'alt-remove': return api('alt/remove', { draft: d.id, scene: ds.scene, block: ds.block });
      case 'sel': {
        const sc = d.scenes[ds.scene]; if (!sc) return;
        if (ui.sel.scene !== ds.scene) ui.sel = { scene: ds.scene, ids: [], last: null };
        if (e.shiftKey && ui.sel.last) {
          const ids = sc.blocks.map((x) => x.id); const a = ids.indexOf(ui.sel.last), z = ids.indexOf(ds.block);
          ui.sel.ids = [...new Set([...ui.sel.ids, ...ids.slice(Math.min(a, z), Math.max(a, z) + 1)])];
        } else ui.sel.ids = ui.sel.ids.includes(ds.block) ? ui.sel.ids.filter((x) => x !== ds.block) : [...ui.sel.ids, ds.block];
        ui.sel.ids = sc.blocks.map((x) => x.id).filter((id) => ui.sel.ids.includes(id));
        ui.sel.last = ds.block; ui.focusScene = ds.scene;
        if (ui.gen.open && ui.sel.ids.length) ui.gen.input = { draft: d.id, scene: ui.sel.scene, blocks: [...ui.sel.ids], refine: null };
        return render();
      }
      case 'sel-clear': ui.sel = { scene: null, ids: [], last: null }; return render();

      // AI options
      case 'gen-open-sel': return openGen({ draft: d.id, scene: ui.sel.scene, blocks: [...ui.sel.ids], refine: null });
      case 'gen-close': { const j = myGen(); if (j) await api(j.result ? 'gen/done' : 'gen/clear', { job: j.id }); ui.gen.open = false; ui.gen.input = null; ui.trying = null; ui.sel = { scene: null, ids: [], last: null }; return render(); }
      case 'gen-ctl': ui.gen.ctl = !ui.gen.ctl; return render();
      case 'gen-twist': ui.gen.twist = ds.tw; return render();
      case 'gen-go': {
        const g = ui.gen; if (!g.input) return;
        await flushAll();
        const cur = myGen();
        g.ctl = false;
        return api('gen', { draft: g.input.draft, scene: g.input.scene, blocks: g.input.blocks, refine: g.input.refine, from: g.input.from || (cur?.applied ? cur.id : undefined), personality: g.personality, custom: g.custom, twist: g.twist, ask: g.ask });
      }
      case 'gen-try': {
        await flushAll();
        const r = await api('gen/apply', { job: ds.job, option: ds.opt === 'original' ? 'original' : Number(ds.opt), mode: 'replace' });
        if (r.ok) {
          ui.sel = { scene: null, ids: [], last: null };
          ui.trying = r.ids?.length ? r.ids : null;
          setTimeout(() => { const el = r.ids?.[0] && app.querySelector(`[data-block="${r.ids[0]}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
        }
        return;
      }
      case 'gen-alt': return api('gen/apply', { job: ds.job, option: Number(ds.opt), mode: 'alt' });
      case 'gen-done': ui.trying = null; ui.gen.input = null; ui.gen.open = false; return api('gen/done', { job: ds.job });
      case 'gen-refine': { const j = job(ds.job); const o = j?.result?.options[Number(ds.opt)]; if (!o) return; ui.gen.input = { draft: j.draft, scene: j.scene, blocks: j.applied?.ids || j.blocks, refine: o.blocks, from: j.id }; ui.gen.ctl = true; return render(); }

      // shots & assets
      case 'shot-add': return api('shot/add', { draft: d.id, scene: ds.scene });
      case 'shot-approve': return api('shot/approve', { draft: d.id, scene: ds.scene, shot: ds.shot, yes: ds.yes === '1' });
      case 'shot-approve-all': return api('shot/approve', { draft: d.id, scene: ds.scene, all: true });
      case 'shot-del': if (confirm('Delete this shot?')) api('shot/delete', { draft: d.id, scene: ds.scene, shot: ds.shot }); return;
      case 'shot-up': return api('shot/move', { draft: d.id, scene: ds.scene, shot: ds.shot, dir: -1 });
      case 'shot-down': return api('shot/move', { draft: d.id, scene: ds.scene, shot: ds.shot, dir: 1 });
      case 'shot-more': ui.shotMore[ds.shot] = !ui.shotMore[ds.shot]; return render();
      case 'cover-edit': ui.coverEdit = ds.shot || null; return render();
      case 'cover-tick': {
        const sc = d.scenes[ds.scene]; const s = sc.shots.find((x) => x.id === ds.shot);
        const set = new Set(s.blocks); if (b.checked) set.add(ds.block); else set.delete(ds.block);
        return api('shot/update', { draft: d.id, scene: ds.scene, shot: ds.shot, patch: { blocks: sc.blocks.map((x) => x.id).filter((id) => set.has(id)) } });
      }

      // drafts & versions
      case 'open-draft': ui.draft = ds.draft; localStorage.setItem('pi.script.draft', ui.draft); location.hash = `#${ui.lastScript}`; return render();
      case 'draft-versions': ui.draftOpen[ds.draft] = !ui.draftOpen[ds.draft]; return render();
      case 'fork': { const name = prompt('Name your draft:', `${me}'s draft`); if (!name) return; const r = await api('draft/fork', { from: ds.draft, v: ds.v ? Number(ds.v) : null, name }); if (r.ok) { ui.draft = r.id; localStorage.setItem('pi.script.draft', r.id); ui.viewVersion = null; location.hash = '#write'; toast('You are in your own draft now'); } return; }
      case 'make-main': {
        const sum = await getJSON(`/api/promo?draft=${ds.draft}`);
        const lines = [`Make “${state.drafts[ds.draft].name}” the Main draft?`, '',
          sum.changed.length ? `Changed: ${sum.changed.join(', ')}` : '', sum.added.length ? `New: ${sum.added.join(', ')}` : '', sum.dropped.length ? `Dropped: ${sum.dropped.join(', ')}` : '',
          !sum.changed.length && !sum.added.length && !sum.dropped.length ? 'The script is the same.' : '', 'The old Main stays in History.'].filter((l, i) => l || i === 1);
        if (confirm(lines.join('\n'))) api('draft/make-main', { draft: ds.draft });
        return;
      }
      case 'cmp-main': ui.compare.a = `${state.mainId}:`; ui.compare.b = `${ds.draft}:`; location.hash = '#history/compare'; return runCompare();
      case 'view-version': {
        const k = { draft: ds.draft, v: Number(ds.v), data: null };
        if (ui.viewVersion?.draft === k.draft && ui.viewVersion?.v === k.v) { ui.viewVersion = null; return render(); }
        ui.viewVersion = k; render();
        k.data = await getJSON(`/api/version?draft=${k.draft}&v=${k.v}`); return render();
      }
      case 'close-version': ui.viewVersion = null; return render();
      case 'restore': if (confirm(`Restore version ${ds.v}? Your open sesh is saved first, so nothing is lost.`)) { await api('draft/restore', { draft: ds.draft, v: Number(ds.v) }); ui.viewVersion = null; render(); } return;
      case 'cmp-go': return runCompare();
      case 'cmp-now': ui.compare.a = `${ds.draft}:${ds.v}`; ui.compare.b = `${ds.draft}:`; location.hash = '#history/compare'; return runCompare();

      // bible
      case 'bs-refresh': ui.brainstorm = null; return loadBrainstorm();
      case 'import': { const r = await api('import', { card: ds.card }); if (r.ok) loadBrainstorm(); return; }
      case 'import-logline': { const r = await api('import', { card: ds.card, logline: true, again: true }); if (r.ok) toast('Logline updated'); return; }
      case 'fact-edit': ui.factEdit = ds.id; ui.factMove = null; ui.focusSel = `[data-factedit="${ds.id}"]`; return render();
      case 'fact-new': ui.factNew = ds.scene; ui.focusSel = `[data-factnew="${ds.scene}"]`; return render();
      case 'fact-move': ui.factMove = ui.factMove === ds.id ? null : ds.id; return render();
      case 'fact-review': ui.factReview = !ui.factReview; return render();
      case 'fact-del': return api('fact/delete', { id: ds.id });
      case 'fact-ok': return api('fact/confirm', { id: ds.id });
    }
  });

  app.addEventListener('change', async (e) => {
    const t = e.target;
    const act = t.dataset.act;
    if (act === 'gen-pers') { ui.gen.personality = t.value; return render(); }
    if (act === 'cmp-pick') { ui.compare[t.dataset.side] = t.value; ui.compare.data = null; return render(); }
    if (act === 'pull-v' && t.value) { const into = t.value; t.value = ''; const r = await api('draft/pull', { from: t.dataset.from, v: Number(t.dataset.v), scene: t.dataset.scene, into }); if (r.ok) toast(`Pulled into ${draftLabel(state.drafts[into])}`); return; }
    if (act === 'import-dlg' && t.value) { const scene = t.value; t.value = ''; const r = await api('import', { card: t.dataset.card, scene, again: true }); if (r.ok) { toast('Lines added'); loadBrainstorm(); } return; }
    if (act === 'cover-tick') return;
    if (t.dataset.field && t.tagName === 'SELECT') { const c = blockCtx(t); queueEdit('block', c, t.dataset.field, t.value, 0); }
    if (t.dataset.dname) api('draft/rename', { draft: t.dataset.dname, name: t.value });
    if (t.dataset.factmove) { const f = state.facts.find((x) => x.id === t.dataset.factmove); ui.factMove = null; api('fact/edit', { id: f.id, fact: f.fact, scene: t.value || null }); render(); }
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.tagName === 'TEXTAREA') autosize(t);
    if (t.dataset.field) {
      const c = blockCtx(t);
      if (t.value === '/' && t.dataset.field !== 'paren') { ui.slash = c.block; queueEdit('block', c, t.dataset.field, '/', 50); return render(); }
      if (ui.slash === c.block) { ui.slash = null; render(); }
      return queueEdit('block', c, t.dataset.field, t.value);
    }
    if (t.dataset.stitle) return queueEdit('title', { draft: D().id, scene: t.dataset.stitle }, 'title', t.value, 500);
    if (t.dataset.pfield) return queueEdit('project', {}, t.dataset.pfield, t.value, 500);
    if (t.dataset.seshtitle) return queueEdit('sesh', { sesh: t.dataset.seshtitle }, 'title', t.value, 600);
    if (t.dataset.shotf) return queueEdit('shot', { draft: D().id, scene: t.dataset.scene, shot: t.dataset.shot }, t.dataset.shotf, t.value, 400);
    if (t.dataset.genfield) ui.gen[t.dataset.genfield] = t.value;
    if (t.dataset.factedit) local[`${t.dataset.factedit}:fact`] = t.value;
  });

  app.addEventListener('keydown', async (e) => {
    const t = e.target;
    if (e.key === 'Escape') {
      if (t.dataset.factedit) { delete local[`${t.dataset.factedit}:fact`]; ui.factEdit = null; return render(); }
      if (t.dataset.factnew) { ui.factNew = null; return render(); }
      if (ui.menu || ui.slash || ui.insert) { ui.menu = null; ui.slash = null; ui.insert = null; return render(); }
      if (ui.guide) { ui.guide = false; return render(); }
      return;
    }
    if (e.isComposing) return;
    if (e.key === 'Enter' && t.dataset.factedit) { e.preventDefault(); return saveFact(t); }
    if (e.key === 'Enter' && t.dataset.factnew) { e.preventDefault(); return saveNewFact(t); }
    if (e.key === 'Enter' && t.dataset.seshtitle) { e.preventDefault(); flush(`sesh:${t.dataset.seshtitle}`); t.blur(); return; }
    if (e.key === 'Enter' && (t.dataset.stitle || t.dataset.pfield === 'title' || t.dataset.dname)) { e.preventDefault(); t.blur(); return; }
    if (t.dataset.addchar && e.key === 'Enter') { e.preventDefault(); const v = t.value.trim(); if (v) { t.value = ''; api('character/add', { name: v }); } return; }
    if (!t.dataset.field) return;
    const c = blockCtx(t);
    const d = D(); const sc = d.scenes[c.scene]; if (!sc) return;
    const blk = sc.blocks.find((x) => x.id === c.block); if (!blk) return;
    const field = t.dataset.field;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { // new line below (a dialogue gets the other speaker)
      e.preventDefault(); flushAll();
      const next = { heading: 'action', action: 'action', dialogue: 'dialogue', transition: 'heading', note: 'action' }[blk.type];
      const who = next === 'dialogue' ? nextSpeaker(sc, blk.id) : '';
      return addBlockAfter(sc.id, blk.id, next, next === 'heading' ? { intExt: 'INT.' } : who ? { character: who } : undefined);
    }
    if (e.key === 'Enter' && !e.shiftKey) { // Enter = done with this line; Shift+Enter = a line break
      e.preventDefault();
      const el = t.closest('.blk');
      const need = blk.type === 'dialogue' && field !== 'line' ? 'line' : blk.type === 'heading' && field === 'intExt' ? 'location' : null;
      const target = need && el.querySelector(`[data-field="${need}"]`);
      if (target && !target.value.trim()) { target.focus(); return; }
      await flush(`block:${blk.id}`);
      t.blur();
      el.classList.remove('done'); void el.offsetWidth; el.classList.add('done');
      setTimeout(() => el.classList.remove('done'), 900);
      return;
    }
    if (e.key === 'Backspace') {
      const fields = [...t.closest('.blk').querySelectorAll('[data-field]')].filter((f) => f.tagName !== 'SELECT');
      if (fields.every((f) => !f.value)) {
        e.preventDefault();
        const i = sc.blocks.indexOf(blk); const prev = sc.blocks[i - 1];
        const pk = `block:${blk.id}`; if (pend[pk]) { clearTimeout(pend[pk].timer); delete pend[pk]; }
        await api('block/delete', { draft: d.id, scene: sc.id, block: blk.id });
        if (prev) { ui.focusNext = { block: prev.id, field: { heading: 'time', action: 'text', dialogue: 'line', transition: 'text', note: 'text' }[prev.type] }; render(); }
      }
    }
  });

  // presence + saving on leaving a field
  let presTimer = null; let lastPres = '';
  app.addEventListener('focusin', (e) => {
    const t = e.target;
    const blk = t.closest?.('[data-block]');
    const scn = t.closest?.('section[data-scene]');
    if (!scn) return;
    clearTimeout(presTimer);
    const key = `${D().id}|${scn.dataset.scene}|${blk?.dataset.block || ''}`;
    if (scn.dataset.scene !== ui.focusScene && route()[0] === 'write') { ui.focusScene = scn.dataset.scene; setTimeout(render, 0); }
    if (key !== lastPres) { lastPres = key; api('presence', { draft: D().id, scene: scn.dataset.scene, block: blk?.dataset.block || null }); }
  });
  app.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.dataset?.field) { const c = blockCtx(t); flush(`block:${c.block}`); }
    if (t.dataset?.stitle) flush(`title:${t.dataset.stitle}`);
    if (t.dataset?.shotf) flush(`shot:${t.dataset.shot}`);
    if (t.dataset?.pfield) flush('project:project');
    if (t.dataset?.seshtitle) flush(`sesh:${t.dataset.seshtitle}`);
    if (t.dataset?.factedit && ui.factEdit === t.dataset.factedit) saveFact(t);
    if (t.dataset?.factnew && ui.factNew === t.dataset.factnew) saveNewFact(t);
    clearTimeout(presTimer);
    presTimer = setTimeout(() => { lastPres = ''; if (state?.started) api('presence', { draft: D().id }); }, 1500);
  });

  // ---------------------------------------------------------------- drag & drop
  let drag = null;
  app.addEventListener('dragstart', (e) => {
    const el = e.target.closest?.('[data-drag]');
    if (!el) return;
    ui.dragging = true;
    if (el.dataset.drag === 'blocks') {
      const sid = el.dataset.scene, bid = el.dataset.block;
      drag = { kind: 'blocks', scene: sid, ids: ui.sel.scene === sid && ui.sel.ids.includes(bid) ? ui.sel.ids : [bid] };
      app.classList.add('dragging', 'dragging-lines');
    } else { drag = { kind: 'scene', scene: el.dataset.scene }; app.classList.add('dragging', 'dragging-scenes'); }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(drag));
  });
  app.addEventListener('dragend', () => {
    drag = null; ui.dragging = false;
    app.classList.remove('dragging', 'dragging-lines', 'dragging-scenes');
    app.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
    if (ui.pendingRender) render();
  });
  function dropSpot(e) {
    if (!drag) return null;
    if (drag.kind === 'blocks') {
      const g = e.target.closest('[data-drop="gen"]');
      if (g) return { el: g, type: 'gen' };
      const b = e.target.closest('.page .blk[data-block]');
      if (!b || !canEdit(D())) return null;
      if (drag.ids.includes(b.dataset.block)) return { el: b, type: 'noop' };
      const r = b.getBoundingClientRect();
      return { el: b, type: 'line', target: b.dataset.block, scene: b.dataset.scene, before: e.clientY < r.top + r.height / 2 };
    }
    const card = e.target.closest('[data-drop="scene"]');
    if (card && card.dataset.scene !== drag.scene) {
      const r = card.getBoundingClientRect();
      const before = card.classList.contains('bcard') ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      return { el: card, type: 'scene', target: card.dataset.scene, before };
    }
    const zone = e.target.closest('[data-drop="tray"],[data-drop="order"]');
    if (zone && !card) return { el: zone, type: zone.dataset.drop };
    return null;
  }
  app.addEventListener('dragover', (e) => {
    const s = dropSpot(e); if (!s) return;
    e.preventDefault();
    app.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
    if (s.type === 'noop') return;
    s.el.classList.add(s.type === 'scene' || s.type === 'line' ? (s.before ? 'drop-before' : 'drop-after') : 'drop-into');
  });
  app.addEventListener('drop', async (e) => {
    const s = dropSpot(e); if (!s) return;
    e.preventDefault();
    const d = D(); const dr = drag;
    if (s.type === 'noop') return;
    if (s.type === 'gen') { ui.dragging = false; return openGen({ draft: d.id, scene: dr.scene, blocks: d.scenes[dr.scene].blocks.map((x) => x.id).filter((id) => dr.ids.includes(id)), refine: null }); }
    if (s.type === 'line') {
      await flushAll();
      const dst = d.scenes[s.scene];
      const rest = dst.blocks.filter((x) => !dr.ids.includes(x.id));
      const i = rest.findIndex((x) => x.id === s.target);
      const after = s.before ? (i > 0 ? rest[i - 1].id : null) : s.target;
      return api('block/reorder', { draft: d.id, scene: dr.scene, toScene: s.scene !== dr.scene ? s.scene : undefined, ids: dr.ids, after });
    }
    const isFloat = d.floating.includes(dr.scene);
    if (s.type === 'tray') { if (!isFloat) api('scene/unplace', { draft: d.id, scene: dr.scene }); return; }
    let after;
    if (s.type === 'order') after = d.order.filter((x) => x !== dr.scene).at(-1) || null;
    else {
      if (d.floating.includes(s.target)) return;
      const o = d.order.filter((x) => x !== dr.scene);
      const i = o.indexOf(s.target);
      after = s.before ? (i > 0 ? o[i - 1] : null) : s.target;
    }
    await api(isFloat ? 'scene/place' : 'scene/move', { draft: d.id, scene: dr.scene, after });
  });
})();
