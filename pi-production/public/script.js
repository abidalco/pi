// Script — the section. Draws inside the shell (app.js): the pill stays; the centre of the top bar switches between
// Home (the drafts, a new draft, what was promoted) and the three views of the script (Write · Board · Shots), or a
// room's tabs (Promoted, History, Bible); the left holds the draft you're in; the right holds the open sesh, the
// three rooms and who's online. Rules everywhere: the script reads like a page; controls show on hover;
// secondary actions live behind ⋯; anything that needs attention is one quiet line that opens on click; the AI
// appears when asked; nothing asks for approval.
(() => {
  const PI = window.PI;
  const { esc, md, ic, plural, ago, toast, menu, mi, menuBtn, TYPE } = PI;
  const ui = PI.ui; // the shell's: ui.menu is the open menu
  const app = document.getElementById('app');
  const R = () => PI.render();

  // script-local state, kept across renders (reset when you open another project)
  const fresh = () => ({
    pid: null, draft: '',
    sel: { scene: null, ids: [], last: null },
    gen: { open: false, personality: 'director', custom: '', twist: 'none', ask: '', input: null, ctl: false },
    slash: null, insert: null, focusNext: null, focusSel: null, focusScene: null, trying: null, scrollTo: null,
    dragging: false, pendingRender: false, keys: false, notice: null,
    snaps: {}, compare: { a: '', b: '', data: null }, viewVersion: null, draftOpen: {},
    notesOpen: {}, shotMore: {}, coverEdit: null,
    sesh: null, seshFilter: 'all', seshData: null, seshLoading: null,
    factEdit: null, factNew: null, factMove: null, factReview: false,
    lastScript: 'write', lastMain: null,
    newDraft: false, ndName: '', renaming: null, popen: {}, psendscene: {},
  });
  let sx = fresh();
  let state = null, cfg = null, pid = null, me = '';
  function sync(ctx) {
    state = ctx.SC; cfg = ctx.SCC; me = ctx.me;
    if (ctx.pid !== pid) { pid = ctx.pid; sx = fresh(); sx.pid = pid; sx.draft = localStorage.getItem(`pi.script.draft.${pid}`) || ''; }
  }
  const setDraft = (id) => { sx.draft = id; try { localStorage.setItem(`pi.script.draft.${pid}`, id); } catch {} };
  const base = () => `#p/${esc(pid)}/script`;
  const go = (place, sub = '') => { location.hash = place === 'home' ? `#p/${pid}/script` : `#p/${pid}/script/${place}${sub ? `/${sub}` : ''}`; };
  const sapi = (act, data) => PI.api(`/api/projects/${pid}/script/${act}`, data);
  const getJSON = (p) => fetch(`/api/projects/${pid}/script/${p}`).then((r) => r.json());
  const I = (n) => ic(n, 's');
  const PLACES = ['home', 'write', 'board', 'shots', 'promoted', 'history', 'bible'];
  const VIEWS = ['home', 'write', 'board', 'shots']; // the script itself; the rest are rooms
  const placeOf = () => {
    const [p, sub] = (PI.route().sub || '').split('/');
    if (p === 'bible' && sub === 'brainstorm') return ['promoted', '']; // the Bible's old Brainstorm tab
    return [PLACES.includes(p) ? p : 'home', sub || ''];
  };
  const inScript = () => PI.route().section === 'script' && !!state?.started;

  // ---------------------------------------------------------------- helpers
  const M = () => state.drafts[state.mainId];
  const D = () => state.drafts[sx.draft] || M();
  const canEdit = (d) => !!d && (d.isMain || d.owner === 'team' || d.owner === me);
  const persName = (key, custom) => (key === 'custom' ? custom || 'Custom' : cfg.personalities[key]?.name || key);
  const headingText = (b) => [b.intExt, b.location, b.time && `- ${b.time}`].filter(Boolean).join(' ').toUpperCase();
  const draftLabel = (d) => (d.isMain ? 'Main' : d.name);
  const job = (id) => state.jobs.find((j) => j.id === id);
  const jobsFor = (scene, type) => state.jobs.filter((j) => j.scene === scene && j.type === type);
  const myGen = () => [...state.jobs].reverse().find((j) => j.type === 'generate' && j.by === me && !j.dismissed && j.status !== 'failed');
  const busy = (j) => j && (j.status === 'pending' || j.status === 'delivered');
  const busyLabel = (j) => (!j ? '' : j.status === 'pending' ? (state.botOnline ? 'queued…' : 'waiting for the AI (it’s off: npm run bot)') : j.status === 'delivered' ? 'thinking…' : '');
  const blockIndex = (sc, id) => sc.blocks.findIndex((b) => b.id === id) + 1 || '?';
  const bsAlts = (sc) => sc.blocks.filter((b, i) => b.alt?.source === 'brainstorm' && sc.blocks.findIndex((x) => x.alt?.group === b.alt.group) === i);
  const bsSessions = (sc) => (state.sessions || []).filter((x) => x.origin?.scene === sc.id);
  const sessionHref = (sid) => `#p/${esc(pid)}/brainstorm/s/${esc(sid)}`;
  const cardOf = (id) => (state.brainstorm || []).find((c) => c.id === id);
  const drafts = () => Object.values(state.drafts).sort((a, b) => (b.isMain - a.isMain) || (b.editedAt - a.editedAt));
  const ideaName = (t) => String(t || '').replace(/^(pitch|idea)\s*[—–-]\s*/i, '');
  const freshName = () => { const b = `${me}’s draft`; const n = new Set(Object.values(state.drafts).map((d) => d.name)); if (!n.has(b)) return b; let i = 2; while (n.has(`${b} ${i}`)) i++; return `${b} ${i}`; };
  const skeletonJob = (d) => state.jobs.filter((j) => j.type === 'skeleton' && busy(j) && (j.draft || state.mainId) === d.id).at(-1);
  const asText = (v) => (Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
  const PTYPES = [['idea', 'Ideas'], ['arc', 'Arcs'], ['character', 'Characters'], ['scene', 'Scenes'], ['dialogue', 'Dialogue']];
  // history lines from the old demo start with an emoji; the app speaks in words
  const clean = (t) => String(t || '').replace(/^(?:[\p{Extended_Pictographic}←-⇿⤀-⥿⬀-⯿＋✂-➿️‍]+\s*)+/u, '');

  // ---------------------------------------------------------------- local edit buffer (debounced, survives re-renders)
  const local = {};
  const pend = {};
  function queueEdit(kind, b, field, value, delay = 350) {
    const id = b.block || b.shot || b.scene || b.sesh || 'project';
    const key = `${kind}:${id}`;
    local[`${id}:${field}`] = value;
    const p = (pend[key] ||= { kind, base: b, pid, patch: {}, timer: null });
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
    const A = (act, data) => PI.api(`/api/projects/${p.pid}/script/${act}`, data);
    if (p.kind === 'block' && creating[id]) await creating[id];
    if (p.kind === 'block') await A('block/update', { ...p.base, patch: p.patch });
    if (p.kind === 'shot') await A('shot/update', { ...p.base, patch: p.patch });
    if (p.kind === 'title') await A('scene/title', { ...p.base, title: p.patch.title });
    if (p.kind === 'project') await A('project', p.patch);
    if (p.kind === 'sesh') await A('sesh/title', { sesh: p.base.sesh, title: p.patch.title });
    for (const f of Object.keys(p.patch)) if (local[`${id}:${f}`] === p.patch[f]) delete local[`${id}:${f}`];
  }
  const flushAll = () => Promise.all(Object.keys(pend).map(flush));
  const dropPending = (key) => { if (pend[key]) { clearTimeout(pend[key].timer); delete pend[key]; } };
  const val = (id, field, server) => local[`${id}:${field}`] ?? server ?? '';

  // optimistic insert: a new line appears and takes focus at once; the server confirms with the same id
  const FIELDS = { heading: ['intExt', 'location', 'time'], action: ['text'], dialogue: ['character', 'paren', 'line'], transition: ['text'], note: ['text'] };
  const optimistic = {};
  const creating = {};
  function placeOptimistic(st) {
    for (const o of Object.values(optimistic)) {
      const sc = st?.drafts?.[o.draft]?.scenes[o.scene];
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
    sx.focusNext = { block: id, field: { heading: 'location', dialogue: fields?.character ? 'line' : 'character', transition: 'text' }[type] || 'text' };
    sx.insert = null;
    R();
    creating[id] = sapi('block/add', { draft: d.id, scene, after: after || null, type, fields, id }).finally(() => { delete creating[id]; delete optimistic[id]; });
    return creating[id];
  }
  function nextSpeaker(sc, blockId) {
    const i = sc.blocks.findIndex((b) => b.id === blockId);
    const speakers = sc.blocks.slice(0, i + 1).filter((b) => b.type === 'dialogue' && b.character).map((b) => b.character.toUpperCase());
    const cur = speakers.at(-1);
    return [...speakers].reverse().find((s) => s !== cur) || '';
  }

  // ---------------------------------------------------------------- a new picture arrived
  function onState(S, ctx) {
    if (!S.script) return true;
    placeOptimistic(S.script);
    if (sx.dragging) { sx.pendingRender = true; return false; } // a re-render would drop the drag
    return true;
  }

  // ---------------------------------------------------------------- chrome: what the top bar shows for this section
  function chrome(ctx) {
    sync(ctx);
    if (!state) return { title: 'Script', viewClass: 'sx' };
    const [place, sub] = placeOf();
    const toSend = (state.brainstorm || []).filter((c) => !c.landed).length;
    const room = (key, icon, title, badge, dot) => `<a class="icon roombtn ${place === key ? 'on' : ''}" href="${place === key ? (state.started ? `${base()}/${sx.lastScript}` : base()) : `${base()}/${key}`}" title="${esc(title)}" data-key="room-${key}">${ic(icon)}${badge ? `<span class="rbadge">${badge}</span>` : ''}${dot ? '<span class="rdot"></span>' : ''}</a>`;
    const promoRoom = room('promoted', 'spark', toSend ? `Promoted in Brainstorm · ${plural(toSend, 'card')} not sent yet` : 'Promoted in Brainstorm: ideas, arcs, characters, scenes, lines', toSend || '');
    const backTo = (label) => `<a class="back" href="${state.started ? `${base()}/${sx.lastScript}` : base()}" data-key="back" title="back to the script">${I('back')}<span class="bl">${label}</span></a>`;
    if (!state.started) {
      if (place === 'promoted') return { title: 'Promoted', left: backTo('Script'), center: promotedSegs(sub), right: promoRoom, viewClass: 'sx', viewKey: 'promoted' };
      return { title: 'Script', right: promoRoom, viewClass: 'sx', viewKey: 'start' };
    }
    if (sx.lastMain && sx.lastMain !== state.mainId && sx.draft === sx.lastMain) { setDraft(state.mainId); toast('Main changed: you are on the new Main'); }
    sx.lastMain = state.mainId;
    if (VIEWS.includes(place)) sx.lastScript = place;
    if (place === 'write' && sub.includes(':')) { // a link from Brainstorm or the Overview: open that scene, notes unfolded
      if (sx.jumped !== sub) {
        sx.jumped = sub;
        const [dr, scn] = sub.split(':');
        if (state.drafts[dr]?.scenes[scn]) setDraft(dr);
        sx.focusScene = scn; sx.scrollTo = `scene-${scn}`; sx.notesOpen[scn] = true;
      }
    } else sx.jumped = null;
    const d = D();
    const scriptPlace = VIEWS.includes(place);
    const seg = (k, label, icon, dis) => `<a href="${k === 'home' ? base() : `${base()}/${k}`}" class="seg ${place === k ? 'on' : ''} ${dis ? 'dim' : ''}">${I(icon)}${label}</a>`;
    const tab = (rm, k, label) => `<a href="${base()}/${rm}/${k}" class="seg ${sub === k || (!sub && k === (rm === 'history' ? 'seshes' : 'facts')) ? 'on' : ''}">${label}</a>`;
    const toReview = Object.values(state.seshes).filter((x) => x.status === 'saved').length;
    const outdated = factsToLook().length;
    const center = scriptPlace ? `${seg('home', 'Home', 'home')}${seg('write', 'Write', 'edit')}${seg('board', 'Board', 'columns')}${seg('shots', 'Shots', 'film', !d.isMain)}`
      : place === 'promoted' ? promotedSegs(sub)
      : place === 'history' ? `${tab('history', 'seshes', `Seshes${toReview ? ` <span class="badge">${toReview}</span>` : ''}`)}${tab('history', 'drafts', 'Versions')}${tab('history', 'compare', 'Compare')}`
      : `${tab('bible', 'facts', `Facts${outdated ? ' <span class="adot"></span>' : ''}`)}${tab('bible', 'characters', 'Characters')}${tab('bible', 'notes', 'Notes')}`;
    const right = `${seshIndicator()}${aiStatus()}${promoRoom}${room('bible', 'book', outdated ? `The Bible · ${plural(outdated, 'fact')} may be out of date` : 'The Bible: facts, characters, logline', '', outdated)}${room('history', 'history', 'History: seshes, versions, compare', toReview || '')}`;
    const people = `<span class="people" data-key="people">${state.project.members.map((n) => `<span class="av ${n === me ? 'me' : ''} ${state.online.includes(n) ? 'online' : ''}" title="${esc(n)}${n === me ? ' (you)' : ''}${state.online.includes(n) ? ' · here now' : ''}">${esc(n.slice(0, 1).toUpperCase())}</span>`).join('')}</span>`;
    const more = [
      `<div class="mlabel">Export ${esc(draftLabel(d))}</div>`,
      `<a class="mi" data-act="noop" href="/api/projects/${esc(pid)}/script/export/pdf?draft=${esc(d.id)}" target="_blank">${I('script')}PDF (print)</a>`,
      `<a class="mi" data-act="noop" href="/api/projects/${esc(pid)}/script/export/fountain?draft=${esc(d.id)}">${I('download')}Fountain</a>`,
      mi('sc-keys', 'keyboard', 'Keys'),
      `<div class="mnote"><span class="dot ${state.botOnline ? '' : 'off'}"></span> The AI is ${state.botOnline ? 'on' : 'off · start it with <code>npm run bot</code>'}</div>`,
    ];
    return {
      title: scriptPlace ? 'Script' : place === 'promoted' ? 'Promoted' : place === 'history' ? 'History' : 'Bible',
      left: scriptPlace ? (place === 'home' ? '' : draftSwitch()) : backTo('Script'),
      center, right, people, more,
      viewClass: `sx ${place === 'write' ? 'view-write' : ''}`, viewKey: place,
    };
  }

  // the draft you're in, in the top bar: switch drafts or make a new one without leaving the page
  function draftSwitch() {
    const d = D();
    const row = (x) => `<button class="mi ${x.id === d.id ? 'cur' : ''}" data-act="sc-switch" data-draft="${x.id}">${I(x.isMain ? 'star' : 'fork')}<span class="mgrow">${esc(draftLabel(x))}</span><span class="msub">${x.isMain ? 'everyone' : x.owner === me ? 'yours' : esc(x.owner)}</span></button>`;
    return `<div class="menuwrap dsw" data-key="dsw"><button class="dswbtn ${d.isMain ? '' : 'alt'} ${ui.menu === 'sx-dsw' ? 'on' : ''}" data-act="menu" data-menu="sx-dsw" title="the draft you’re in · switch">${I(d.isMain ? 'star' : 'fork')}<span class="dswn">${esc(draftLabel(d))}</span>${ic('chevron', 's')}</button>
      ${menu('sx-dsw', ['<div class="mlabel">Drafts</div>', ...drafts().map(row), '<div class="msep"></div>', mi('sc-new-go', 'plus', 'New draft…'), mi('sc-home', 'home', 'Script home')], 'wide')}</div>`;
  }
  function promotedSegs(sub) {
    const all = state.brainstorm || [];
    const seg = (k, label, n) => `<a href="${base()}/promoted${k ? `/${k}` : ''}" class="seg ${(sub || '') === k ? 'on' : ''} ${n || !k ? '' : 'dim'}">${label} <span class="pnum">${n}</span></a>`;
    return `${seg('', 'All', all.length)}${PTYPES.map(([t, l]) => seg(t, l, all.filter((c) => c.type === t).length)).join('')}`;
  }

  function aiStatus() {
    return state.jobs.some((x) => x.status === 'delivered') ? `<span class="aistat" data-key="aistat" title="the AI is working">${I('sparkle')} thinking…</span>` : '';
  }

  // the open sesh of the draft you're in: everything you do lands here; saving it makes a version
  function seshIndicator() {
    const d = D();
    if (!canEdit(d)) return '';
    const x = d.sesh && state.seshes[d.sesh];
    if (!x) return `<span class="saved" data-key="saved" title="Everything is saved. Your next change starts a sesh.">${I('check')}<span class="sv">Saved</span></span>`;
    return `<div class="menuwrap" data-key="seshw"><button class="seshbtn ${ui.menu === 'sx-sesh' ? 'on' : ''}" data-act="menu" data-menu="sx-sesh" title="the sesh you’re in"><span class="rec"></span><span class="st">${esc(val(x.id, 'title', x.title))}</span><span class="sc">${x.changes}</span></button>
      ${menu('sx-sesh', [
        '<div class="mlabel">This sesh</div>',
        `<input class="seshtitle" data-seshtitle="${x.id}" value="${esc(val(x.id, 'title', x.title))}" maxlength="80" placeholder="name it">`,
        `<div class="mnote">${plural(x.changes, 'change')} · ${esc((x.people.length ? x.people : [x.by]).join(', '))} · started ${ago(x.startedAt)}</div>`,
        `<div class="mrow"><button class="primary small" data-act="sc-sesh-end" data-draft="${d.id}">Save as a version</button><button class="ghost small" data-act="sc-sesh-open" data-sesh="${x.id}">See what changed</button></div>`,
        '<div class="mnote">Nothing needs approving now. Review it in History whenever.</div>',
      ], 'right wide')}</div>`;
  }

  // the switcher names the draft you're in; this line only shows when you can't write in it
  function draftBar(place) {
    const d = D();
    if (d.isMain || canEdit(d) || !['write', 'board', 'shots'].includes(place)) return '';
    return `<div class="draftbar" data-key="draftbar"><b>${esc(d.name)}</b> is ${esc(d.owner)}’s draft, read-only for you <button class="small" data-act="sc-fork" data-draft="${d.id}">Copy it into a draft of mine</button><button class="small" data-act="sc-to-main">Back to Main</button></div>`;
  }
  function pickBar() {
    const n = sx.sel.scene ? sx.sel.ids.length : 0;
    if (!n || sx.gen.open) return '';
    return `<div class="pickbar" data-key="pickbar">${plural(n, 'line')} picked <button class="primary small" data-act="sc-gen-open-sel">${I('sparkle')}Try options</button><button class="ghost small" data-act="sc-sel-clear">Clear</button></div>`;
  }
  function keysPanel() {
    const keys = [['Enter', 'done with a line'], ['Shift + Enter', 'line break'], ['⌘/Ctrl + Enter', 'new line below (next speaker)'], ['/', 'in an empty line: change its type'], ['⋮⋮ drag', 'move a line'], ['⋮⋮ click', 'pick lines (shift = range)'], ['Backspace', 'in an empty line: delete it']];
    return `<aside class="keyspanel" data-key="keys"><div class="ghead"><b>Keys</b><span class="grow"></span><button class="icon" data-act="sc-keys" title="close">${I('x')}</button></div>
      <div class="keys">${keys.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div></aside>`;
  }

  // ---------------------------------------------------------------- body
  function body(ctx) {
    sync(ctx);
    if (!state) return '<div class="loading">…</div>';
    const [place, sub] = placeOf();
    if (!state.started) return place === 'promoted' ? promotedView(sub) : startView();
    const content = place === 'home' ? homeView() : place === 'promoted' ? promotedView(sub)
      : place === 'history' ? historyView(sub || 'seshes') : place === 'bible' ? bibleView(sub || 'facts')
      : place === 'board' ? boardView() : place === 'shots' ? shotsView() : writeView();
    return `${draftBar(place)}${sx.notice ? `<div class="notice" data-key="notice">${sx.notice.html} <button class="icon" data-act="sc-notice-x" title="close">${I('x')}</button></div>` : ''}
      ${content}
      ${place === 'write' ? pickBar() : ''}
      ${sx.keys ? keysPanel() : ''}
      <datalist id="chars" data-key="chars">${state.project.characters.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <datalist id="transitions" data-key="trans">${['CUT TO:', 'SMASH CUT TO:', 'DISSOLVE TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE IN:', 'INTERCUT WITH:'].map((t) => `<option value="${t}">`).join('')}</datalist>
      <datalist id="framings" data-key="framings">${cfg.framings.map((x) => `<option value="${x}">`).join('')}</datalist>`;
  }

  // ---------------------------------------------------------------- start (a project with no script yet)
  function startView() {
    const ideas = (state.brainstorm || []).filter((c) => c.type === 'idea');
    return `<main class="start" data-key="start">
      <h1>The script</h1>
      <p class="muted">Write the film together: scenes on a board, a script you edit at the same time, AI options when you ask, shots for locked scenes.</p>
      <div class="starts">
        ${ideas.map((c) => `<button class="startcard rec" data-act="sc-start" data-mode="idea" data-card="${esc(c.id)}">${I('bulb')}<b>From the Idea “${esc(c.title.replace(/^(pitch|idea)\s*[—–-]\s*/i, ''))}”</b><span>Promoted in Brainstorm. The AI builds the skeleton: logline, characters, scene cards.</span></button>`).join('')}
        <button class="startcard ${ideas.length ? '' : 'rec'}" data-act="sc-start" data-mode="blank">${I('script')}<b>An empty script</b><span>A Main draft and a page. Add the first scene.</span></button>
        <button class="startcard" data-act="sc-start" data-mode="sample">${I('clapper')}<b>Try it on a sample</b><span>Four scenes of “Rainline” and one not placed yet, to find your way around.</span></button>
      </div>
      ${ideas.length ? '' : `<p class="muted small">Promote an Idea in <a href="#p/${esc(pid)}/brainstorm">Brainstorm</a> and it can start the script here.</p>`}
      ${(state.brainstorm || []).length ? `<div class="hsec left" data-key="hs-promo">${promotedSummary()}</div>` : ''}
    </main>`;
  }

  // ---------------------------------------------------------------- Home: the drafts, a new draft, what was promoted
  function homeView() {
    const list = drafts();
    const lg = state.project.logline;
    return `<main class="shome" data-key="home">
      <header class="hhead"><h1>The script</h1><p class="muted">${lg ? esc(lg) : `No logline yet · <a href="${base()}/bible/notes">add one in the Bible</a>`}</p></header>
      <section class="hsec" data-key="hs-drafts">
        <div class="lbl">${I('layers')}<span>Drafts</span><span class="muted">${list.length}</span><span class="grow"></span>${sx.newDraft ? '' : `<button class="small" data-act="sc-new-open">${I('plus')}New draft</button>`}</div>
        ${sx.newDraft ? newDraftPanel() : ''}
        <div class="hdl">${list.map(homeDraftRow).join('')}</div>
      </section>
      <section class="hsec" data-key="hs-promo">${promotedSummary()}</section>
    </main>`;
  }
  function homeDraftRow(d) {
    const cur = d.id === D().id;
    const all = Object.values(d.scenes);
    const locked = all.filter((sc) => sc.lock).length;
    const open = d.sesh && state.seshes[d.sesh];
    const sk = skeletonJob(d);
    const here = Object.entries(state.presence).filter(([n, x]) => n !== me && x.draft === d.id).map(([n]) => `<span class="av online" title="${esc(n)} is in it">${esc(n[0].toUpperCase())}</span>`).join('');
    const who = d.isMain ? 'everyone writes here · the pipeline uses it' : `${d.owner === me ? 'yours' : `${esc(d.owner)}’s${canEdit(d) ? '' : ', read-only for you'}`}${d.forkedFrom ? ` · from ${esc(d.forkedFrom.name)}${d.forkedFrom.v ? ` v${d.forkedFrom.v}` : ''}` : ''}`;
    const sub = sk ? `<span class="tint">${I('sparkle')} the AI is building its skeleton · ${busyLabel(sk)}</span>` : `${who} · edited ${ago(d.editedAt)}${open ? ' · <span class="reddot"></span> sesh open' : ''}`;
    const name = sx.renaming === d.id
      ? `<input class="hdname" data-dname="${d.id}" value="${esc(d.name)}" maxlength="60" title="Enter to save · Esc">`
      : `<button class="hdmain" data-act="sc-open-draft" data-draft="${d.id}" data-to="write"><span class="hdn">${I(d.isMain ? 'star' : 'fork')}<b>${esc(draftLabel(d))}</b>${cur ? '<span class="tag">you’re in it</span>' : ''}</span><span class="hds muted small">${sub}</span></button>`;
    return `<div class="hdr ${cur ? 'cur' : ''} ${d.isMain ? 'main' : ''}" data-key="hdr-${d.id}">${name}
      <span class="hdstat muted small">${plural(d.order.length, 'scene')}${d.floating.length ? ` · ${d.floating.length} not placed` : ''}${locked ? ` · ${locked} locked` : ''}</span>
      ${here ? `<span class="people">${here}</span>` : ''}
      <div class="menuwrap">${menuBtn(`sx-hd:${d.id}`)}${menu(`sx-hd:${d.id}`, [
        !d.isMain && d.owner === me ? mi('sc-rename', 'edit', 'Rename', { draft: d.id }) : '',
        mi('sc-fork', 'fork', d.isMain ? 'Make my own draft from it' : 'Copy it into a draft of mine', { draft: d.id }),
        !d.isMain ? mi('sc-cmp-main', 'columns', 'Compare with Main', { draft: d.id }) : '',
        !d.isMain ? mi('sc-make-main', 'star', 'Make it Main…', { draft: d.id }) : '',
        mi('sc-versions', 'history', `Its versions (${d.versions.length})`, { draft: d.id }),
      ], 'right')}</div>
    </div>`;
  }
  function newDraftPanel() {
    const ideas = (state.brainstorm || []).filter((c) => c.type === 'idea');
    return `<div class="ndp" data-key="ndp">
      <div class="ndrow"><span class="muted small">Name</span><input class="ndname" data-ndname="1" value="${esc(sx.ndName)}" maxlength="60" placeholder="${esc(freshName())}"><span class="grow"></span><button class="icon" data-act="sc-new-close" title="close">${I('x')}</button></div>
      <div class="starts">
        <button class="startcard rec" data-act="sc-new" data-mode="copy">${I('fork')}<b>From Main as it is now</b><span>A copy of Main to try things in. Main doesn’t change.</span></button>
        ${ideas.map((c) => `<button class="startcard" data-act="sc-new" data-mode="idea" data-card="${esc(c.id)}">${I('bulb')}<b>From the Idea “${esc(ideaName(c.title))}”</b><span>The AI builds a fresh skeleton in this draft: characters and scene cards. Main doesn’t change.</span></button>`).join('')}
        <button class="startcard" data-act="sc-new" data-mode="blank">${I('script')}<b>An empty page</b><span>Start from nothing, in a draft of your own.</span></button>
      </div>
      <p class="muted small">It’s yours: others can read it. Any draft can become Main later from its ⋯.</p>
    </div>`;
  }
  function promotedSummary() {
    const all = state.brainstorm || [];
    const toSend = all.filter((c) => !c.landed).length;
    const cat = ([t, label]) => { const l = all.filter((c) => c.type === t); const un = l.filter((c) => !c.landed).length; return `<a class="hcat ${l.length ? '' : 'none'}" href="${base()}/promoted/${t}" title="${un ? `${un} not sent yet` : ''}">${ic(TYPE[t] || 'tag', 's')}<b>${l.length}</b><span>${label}</span>${un ? '<span class="hdot"></span>' : ''}</a>`; };
    return `<div class="lbl">${I('spark')}<span>Promoted in Brainstorm</span><span class="muted">${all.length}</span><span class="grow"></span>${all.length ? `<a class="small" href="${base()}/promoted">See them all ›</a>` : ''}</div>
      ${all.length ? `<div class="hcats">${PTYPES.map(cat).join('')}</div>${toSend ? `<p class="muted small">${plural(toSend, 'card')} not sent yet: open one and send it where it belongs.</p>` : ''}`
        : `<p class="muted small">Nothing promoted yet. What the team decides in <a href="#p/${esc(pid)}/brainstorm">Brainstorm</a> shows here, by kind.</p>`}`;
  }

  // ---------------------------------------------------------------- Promoted: every promoted card, by kind; read it, send it, start a draft from an Idea
  function promotedView(sub) {
    const all = state.brainstorm || [];
    const kinds = sub ? PTYPES.filter(([t]) => t === sub) : PTYPES;
    const groups = kinds.map(([t, label]) => [t, label, all.filter((c) => c.type === t).sort((a, b) => !!a.landed - !!b.landed)]).filter(([, , l]) => l.length || sub);
    return `<main class="promo sprom" data-key="sprom-${sub || 'all'}">
      ${!all.length ? `<div class="empty">Nothing promoted yet. In a <a href="#p/${esc(pid)}/brainstorm">Brainstorm</a> session: star a card, the room votes, and it lands here.</div>` : ''}
      ${groups.map(([t, label, list]) => `<section data-key="pg-${t}"><div class="lbl">${ic(TYPE[t] || 'tag', 's')}<span>${label}</span><span class="muted">${list.length}</span></div>
        ${list.length ? `<div class="plist">${list.map(spcard).join('')}</div>` : `<div class="muted small">No ${label.toLowerCase()} promoted yet.</div>`}</section>`).join('')}
      ${all.length && !sub && groups.length < PTYPES.length ? `<p class="muted small pnone">No ${PTYPES.filter(([t]) => !groups.some(([g]) => g === t)).map(([, l]) => l.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1')} promoted yet.</p>` : ''}
      ${all.length ? `<p class="muted small pfootnote">Cleaning a card happens in <a href="#p/${esc(pid)}/brainstorm/promoted">Brainstorm → Promoted</a>. Sending from here or there is the same.</p>` : ''}
    </main>`;
  }
  function spcard(c) {
    const open = !!sx.popen[c.id];
    const o = c.origin?.section === 'script' ? c.origin : null;
    const od = o && (state.drafts[o.draft]?.scenes[o.scene] ? state.drafts[o.draft] : M()?.scenes[o.scene] ? M() : null);
    const loose = c.type === 'dialogue' && !od;
    const m = M();
    const fields = Object.entries(c.fields || {}).filter(([, v]) => asText(v).trim());
    const sel = loose ? `<select class="small" data-psendscene="${c.id}">${m?.order.length ? `<option value="">pick the scene…</option>${m.order.map((id) => `<option value="${esc(id)}" ${sx.psendscene[c.id] === id ? 'selected' : ''}>${m.scenes[id]._num} ${esc(m.scenes[id].title)}</option>`).join('')}` : '<option value="">no scenes yet</option>'}</select>` : '';
    const idea = c.type === 'idea' ? (state.started ? `<button class="small" data-act="sc-new-from-idea" data-card="${c.id}">${I('fork')}New draft from it</button>` : `<button class="small" data-act="sc-start" data-mode="idea" data-card="${c.id}">${I('bulb')}Start the script from it</button>`) : '';
    return `<div class="pc ${open ? 'open' : ''}" data-key="spc-${c.id}">
      <button class="prow" data-act="sc-popen" data-card="${c.id}" aria-expanded="${open}">${ic(TYPE[c.type] || 'tag')}<span class="pt">${esc(c.title)}</span><span class="pmeta">from “${esc(c.topic)}”${c.sparkedBy ? ` · ${esc(c.sparkedBy)}` : ''}</span><span class="grow"></span>${c.landed ? '<span class="tag tint">sent</span>' : '<span class="tag">to send</span>'}${ic('chevron', 's pchev')}</button>
      ${open ? `<div class="ped pread" data-key="sped-${c.id}">
        ${c.note ? `<div class="pnote">${md(c.note)}</div>` : ''}
        ${fields.length ? `<dl class="pfields">${fields.map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(asText(v))}</dd>`).join('')}</dl>` : ''}
        ${!c.note && !fields.length ? '<div class="muted small">Just the title.</div>' : ''}
        <div class="pfoot">
          <div class="pwhere">${c.landed ? PI.landedLink(pid, c.landed) : od ? `<span class="muted small">from sc. ${od.scenes[o.scene]._num ?? '–'} ${esc(od.scenes[o.scene].title)}: it goes back there as an alternate</span>` : ''}</div>
          <div class="pacts"><a class="small" href="#p/${esc(pid)}/brainstorm/promoted/${esc(c.id)}">Edit in Brainstorm ›</a>${idea}${sel}
            <button class="${c.landed ? '' : 'primary'} small" data-act="sc-psend" data-card="${c.id}">${c.landed ? 'Send again' : esc(loose ? 'Send its lines' : c.send || 'Send')}</button></div>
        </div>
      </div>` : ''}
    </div>`;
  }

  // ================================================================ SCRIPT ROOM
  // ---------------------------------------------------------------- Write
  function writeView() {
    const d = D();
    const ro = !canEdit(d);
    return `<div class="write ${sx.gen.open ? 'with-gen' : ''}" data-key="write">
      <aside class="outline" data-key="outline">${outlineView(d, ro)}</aside>
      <main class="spage" data-key="spage">${pageView(d, ro)}</main>
      ${sx.gen.open ? `<aside class="gen" data-key="gen" data-drop="gen">${genView(d)}</aside>` : `<div class="gendrop" data-drop="gen" data-key="gendrop">${I('sparkle')} Drop here for AI options</div>`}
    </div>`;
  }

  function outlineView(d, ro) {
    const others = Object.entries(state.presence).filter(([n, p]) => n !== me && p.draft === d.id);
    const here = (sid) => others.filter(([, p]) => p.scene === sid).map(([n]) => `<span class="pdot" title="${esc(n)} is here">${esc(n[0])}</span>`).join('');
    const item = (sc, floating) => `<div class="oi ${sx.focusScene === sc.id ? 'cur' : ''}" data-key="oi-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}" ${floating ? '' : 'data-drop="scene"'} data-act="sc-goto-scene">
      <span class="onum">${floating ? '' : sc._num}</span><span class="ot">${esc(sc.title)}</span>${here(sc.id)}${sc.lock ? `<span class="olock" title="locked">${ic('lock')}</span>` : ''}</div>`;
    return `<div class="olist" data-drop="order">${d.order.map((id) => item(d.scenes[id])).join('')}</div>
      ${ro ? '' : `<button class="oadd" data-act="sc-scene-add" data-after="end">${I('plus')}New scene</button>`}
      <div class="ohead ${d.floating.length ? '' : 'empty'}">Not placed${d.floating.length ? ` <span>${d.floating.length}</span>` : ''}</div>
      <div class="olist tray ${d.floating.length ? '' : 'empty'}" data-drop="tray">${d.floating.map((id) => item(d.scenes[id], true)).join('') || '<div class="trayhint">drop a scene here to take it out of the order</div>'}</div>`;
  }

  function pageView(d, ro) {
    const placed = d.order.map((id) => d.scenes[id]);
    const floats = d.floating.map((id) => d.scenes[id]);
    return `${placed.map((sc) => sceneSection(d, sc, ro)).join('')}
      ${floats.length ? `<div class="unplaced" data-key="unplaced">Not placed yet</div>${floats.map((sc) => sceneSection(d, sc, ro)).join('')}` : ''}
      ${!placed.length && !floats.length ? (() => { const sk = skeletonJob(d); return sk
        ? `<div class="empty center" data-key="emptypage"><span class="attn static" style="justify-content:center"><span class="info">${I('sparkle')} the AI is building the skeleton from the Idea · ${busyLabel(sk)}</span></span></div>`
        : `<div class="empty center" data-key="emptypage">No scenes yet.${ro ? '' : ` <button class="small" data-act="sc-scene-add" data-after="end">${I('plus')}New scene</button>`}</div>`; })() : ''}`;
  }

  // what needs attention on a scene, as one quiet line
  function attention(d, sc) {
    const out = [];
    const c = sc.check;
    if (c?.state === 'checking' && c.hash === sc._hash) out.push({ cls: 'info', text: `the Judge is checking it before the lock · ${busyLabel(jobsFor(sc.id, 'judge_lock').at(-1)) || '…'}` });
    if (c?.state === 'done' && c.hash === sc._hash && c.verdict === 'block' && !sc.lock) out.push({ cls: 'bad', text: 'not locked: the Judge found a contradiction' });
    const openWarn = c?.state === 'done' && c.hash === sc._hash ? c.notes.filter((n) => n.verdict === 'warn' && !n.dismissed).length : 0;
    if (openWarn) out.push({ cls: 'warn', text: `${plural(openWarn, 'note')} from the Judge` });
    if (sc.lock && sc.lock.hash !== sc._hash) {
      out.push({ cls: 'warn', text: `changed since locking${sc.shots.length ? ' · its shots may need a look' : ''}` });
      const e = sc.editCheck;
      if (e?.state === 'checking') out.push({ cls: 'info', text: 'the Judge is re-checking…' });
      else if (e?.state === 'done' && e.notes.some((x) => x.verdict !== 'ok' && !x.dismissed)) out.push({ cls: 'warn', text: 'the Judge has a note on the change' });
    }
    const alts = bsAlts(sc);
    if (alts.length) out.push({ cls: 'tint', text: `${alts.length === 1 ? 'a version' : `${alts.length} versions`} from Brainstorm waiting` });
    const live = bsSessions(sc).filter((x) => x.status !== 'closed');
    if (live.length) out.push({ cls: 'info', text: `in Brainstorm now${live.length > 1 ? ` (${live.length} sessions)` : ''}` });
    if (sc.pacing) out.push({ cls: 'info', text: sc.pacing.pending ? `pacing check · ${busyLabel(jobsFor(sc.id, 'pacing').at(-1)) || '…'}` : 'pacing notes' });
    if (d.floating.includes(sc.id)) {
      const s = sc.placeSuggestion;
      if (s?.pending) out.push({ cls: 'info', text: 'the Judge is looking for where it fits…' });
      else if (s) out.push({ cls: 'info', text: `fits ${s.after ? `after ${d.scenes[s.after]?._num} ${esc(d.scenes[s.after]?.title || '?')}` : 'at the very start'}` });
    }
    return out;
  }

  function sceneSection(d, sc, ro) {
    const att = attention(d, sc);
    const open = sx.notesOpen[sc.id];
    const worst = att.some((a) => a.cls === 'bad') ? 'bad' : att.some((a) => a.cls === 'warn') ? 'warn' : att.some((a) => a.cls === 'tint') ? 'tint' : 'info';
    let blocks = '';
    for (const b of sc.blocks) blocks += blockEditor(d, sc, b, ro) + (ro ? '' : insRow(sc, b.id));
    return `<section class="scene ${sc.lock ? 'locked' : ''} ${d.floating.includes(sc.id) ? 'floating' : ''}" data-key="sc-${sc.id}" id="scene-${sc.id}" data-scene="${sc.id}">
      <header class="sh">
        <span class="snum">${sc._num ?? ''}</span>
        <input class="stitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''} maxlength="120">
        ${sc.lock ? `<span class="lockmark" title="locked ${ago(sc.lock.at)}">${I('lock')}</span>` : ''}
        <div class="menuwrap">${menuBtn(`sx-scene:${sc.id}`)}${menu(`sx-scene:${sc.id}`, sceneMenu(d, sc, ro), 'right')}</div>
      </header>
      ${att.length ? `<button class="attn" data-act="sc-notes-toggle" data-scene="${sc.id}"><span class="adot2 ${worst}"></span>${att.map((a) => `<span class="${a.cls}">${a.text}</span>`).join('<i>·</i>')}<span class="chev">${open ? '▴' : '▾'}</span></button>` : ''}
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
      if (targets.length) { items.push('<div class="mlabel">Pull this scene into</div>'); for (const x of targets) items.push(mi('sc-pull', 'layers', esc(draftLabel(x)), { scene: sc.id, into: x.id })); }
      return items.length ? items : ['<div class="mnote">Read-only draft</div>'];
    }
    if (d.isMain && !floating && !checking) items.push(!sc.lock ? mi('sc-lock', 'lock', 'Lock scene', { scene: sc.id }) : edited ? mi('sc-lock', 'lock', 'Lock again, as it is now', { scene: sc.id }) : mi('sc-unlock', 'unlock', 'Unlock', { scene: sc.id }));
    if (d.isMain && sc.lock) items.push(mi('sc-goto-shots', 'film', `Shots (${sc.shots.length})`, { scene: sc.id }));
    if (floating && sc.placeSuggestion && !sc.placeSuggestion.pending) items.push(mi('sc-scene-place', 'check', `Place it where the Judge says (${sc.placeSuggestion.after ? `after ${d.scenes[sc.placeSuggestion.after]?._num}` : 'first'})`, { scene: sc.id, after: sc.placeSuggestion.after || '' }));
    if (floating) items.push(mi('sc-scene-place', 'plus', 'Place it at the end', { scene: sc.id, after: d.order.at(-1) || '' }), mi('sc-scene-suggest', 'scale', 'Ask the Judge where it fits', { scene: sc.id }));
    const live = bsSessions(sc).filter((x) => x.status !== 'closed').at(-1);
    items.push('<div class="msep"></div>', mi('sc-pacing', 'pulse', 'Pacing check', { scene: sc.id }),
      live ? `<a class="mi" href="${sessionHref(live.id)}" data-act="noop">${I('spark')}Open its brainstorm<span class="msub">${live.status === 'lobby' ? 'lobby' : 'live'}</span></a>` : '',
      mi('sc-send-bs', 'spark', live ? 'Brainstorm it again' : 'Brainstorm this scene', { scene: sc.id, type: 'scene' }), mi('sc-send-bs', 'message', 'Brainstorm its dialogue', { scene: sc.id, type: 'dialogue' }));
    if (!sc.lock) items.push('<div class="msep"></div>', !floating ? mi('sc-scene-unplace', '', 'Take it out of the order', { scene: sc.id }) : '', mi('sc-scene-del', 'trash', 'Delete scene', { scene: sc.id }, 'danger'));
    return items;
  }

  const MARK = { ok: () => `<span class="vm ok">${I('check')}</span>`, warn: () => '<span class="vm warn">?</span>', block: () => `<span class="vm bad">${I('x')}</span>` };
  function notesPanel(d, sc, ro) {
    const c = sc.check;
    let out = '';
    if (c?.state === 'checking' && c.hash === sc._hash && !state.botOnline && !ro && d.isMain) out += `<div class="nrow">The AI is off. <button class="small" data-act="sc-judge-skip" data-scene="${sc.id}">Lock without the Judge</button></div>`;
    if (c?.state === 'done' && c.hash === sc._hash && c.notes.some((n) => n.verdict !== 'ok')) {
      out += `<div class="ngroup"><div class="nlabel">The Judge${sc.lock ? ', when it locked this scene' : ''}</div>${c.notes.filter((n) => n.verdict !== 'ok').map((n) => { const i = c.notes.indexOf(n); return `<div class="nrow ${n.dismissed ? 'dim' : ''}">${MARK[n.verdict]()} ${esc(n.note)} ${n.verdict === 'warn' && !n.dismissed && !ro ? `<button class="ghost small" data-act="sc-dismiss" data-scene="${sc.id}" data-idx="${i}">we know, it’s intentional</button>` : n.dismissed ? '<span class="muted small">intentional</span>' : ''}</div>`; }).join('')}</div>`;
    }
    if (sc.lock && sc.lock.hash !== sc._hash) {
      const e = sc.editCheck;
      out += `<div class="ngroup"><div class="nlabel">Changed since locking</div>
        ${e?.state === 'done' ? e.notes.filter((x) => x.verdict !== 'ok').map((x) => `<div class="nrow">${MARK[x.verdict]()} ${esc(x.note)}</div>`).join('') : ''}
        ${diffAgainst(sc.lock.hash, sc)}
        <div class="nrow">${!ro && d.isMain ? `<button class="small" data-act="sc-lock" data-scene="${sc.id}">Lock again as it is now</button>` : ''}${sc.shots.length && d.isMain ? ` <button class="ghost small" data-act="sc-goto-shots" data-scene="${sc.id}">See its shots ›</button>` : ''}</div></div>`;
    }
    const alts = bsAlts(sc), sess = bsSessions(sc);
    if (alts.length || sess.length) {
      out += `<div class="ngroup"><div class="nlabel">Brainstorm</div>
        ${alts.map((b) => `<div class="nrow">${I('spark')} “${esc(b.alt.note)}” came back from <a href="${sessionHref(b.alt.session)}">its session</a> and waits below as an alternate${ro ? '' : ` <button class="small" data-act="sc-alt-use" data-scene="${sc.id}" data-block="${b.id}">Use it</button><button class="ghost small" data-act="sc-alt-remove" data-scene="${sc.id}" data-block="${b.id}">Set it aside</button>`}</div>`).join('')}
        ${sess.map((x) => `<div class="nrow"><span class="dot ${x.status === 'closed' ? 'off' : ''}"></span><a href="${sessionHref(x.id)}">${esc(x.topic)}</a> <span class="muted">· ${x.status === 'closed' ? 'wrapped' : x.status === 'lobby' ? 'about to start' : 'live'} · ${ago(x.createdAt)}</span></div>`).join('')}
      </div>`;
    }
    if (sc.pacing && !sc.pacing.pending) {
      out += `<div class="ngroup"><div class="nlabel">Pacing <span class="muted">· asked by ${esc(sc.pacing.by)}</span> <button class="ghost small" data-act="sc-pacing-x" data-scene="${sc.id}">dismiss</button></div><div class="nrow">${md(sc.pacing.summary)}</div>${sc.pacing.notes.map((n) => `<div class="nrow">• ${n.block ? `<a href="#" data-act="sc-flash" data-block="${n.block}">line ${blockIndex(sc, n.block)}</a>: ` : ''}${esc(n.note)}</div>`).join('')}</div>`;
    }
    if (d.floating.includes(sc.id) && sc.placeSuggestion && !sc.placeSuggestion.pending) {
      const s = sc.placeSuggestion;
      out += `<div class="ngroup"><div class="nlabel">Where it fits</div><div class="nrow">${s.reason ? `<i>${esc(s.reason)}</i>` : ''} ${ro ? '' : `<button class="small" data-act="sc-scene-place" data-scene="${sc.id}" data-after="${s.after || ''}">Place it there</button>`}</div></div>`;
    }
    return `<div class="notes" data-key="nt-${sc.id}">${out || '<div class="nrow muted">Nothing to see.</div>'}</div>`;
  }

  function typeMenu(scene, after, convertBlock) {
    return Object.values(cfg.blockTypes).map((x) => `<button class="tbtn" data-act="${convertBlock ? 'sc-slash-type' : 'sc-block-add'}" data-scene="${scene}" data-after="${after}" data-block="${convertBlock || ''}" data-type="${x.key}" title="${esc(x.hint)}">${esc(x.name)}</button>`).join('');
  }
  function insRow(sc, afterId, where = '') {
    const key = `${afterId || 'top'}${where === 'end' ? ':end' : ''}`;
    const open = sx.insert && sx.insert.scene === sc.id && sx.insert.key === key;
    const after = where === 'top' ? 'top' : where === 'end' ? (afterId || 'top') : afterId;
    return `<div class="ins ${open ? 'open' : ''} ${where}" data-key="ins-${sc.id}-${key}">${open
      ? `<div class="tmenu">${typeMenu(sc.id, after)}<button class="ghost small" data-act="sc-ins-close">${I('x')}</button></div>`
      : `<button class="insbtn" data-act="sc-ins" data-scene="${sc.id}" data-key2="${key}" title="add a line here">${I('plus')}</button>`}</div>`;
  }

  function blockEditor(d, sc, b, ro) {
    const sel = sx.sel.scene === sc.id && sx.sel.ids.includes(b.id);
    const trying = sx.trying?.includes(b.id);
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
    const fromBs = firstOfAlt && b.alt.source === 'brainstorm';
    const alt = fromBs ? `<div class="altbar bs">${I('spark')}<span>From Brainstorm · “${esc(b.alt.note)}” · ${esc(b.alt.by)}${b.alt.of?.length ? ` <span class="muted">· instead of ${plural(b.alt.of.length, 'line')} above</span>` : ' <span class="muted">· to add</span>'}</span>${ro ? '' : ` <button class="small" data-act="sc-alt-use" data-scene="${sc.id}" data-block="${b.id}">Use it</button><button class="ghost small" data-act="sc-alt-remove" data-scene="${sc.id}" data-block="${b.id}">Set it aside</button>`} <a class="small" href="${sessionHref(b.alt.session)}">its session ›</a></div>`
      : firstOfAlt ? `<div class="altbar">↳ Alternate · ${esc(clean(b.alt.personality))}${b.alt.twist ? ` · ${esc(clean(b.alt.twist))}` : ''} · ${esc(b.alt.by)}${b.alt.note ? ` <span class="muted">— ${esc(b.alt.note)}</span>` : ''}${ro ? '' : ` <button class="small" data-act="sc-alt-use" data-scene="${sc.id}" data-block="${b.id}">Use it</button><button class="ghost small" data-act="sc-alt-remove" data-scene="${sc.id}" data-block="${b.id}">Remove</button>`}</div>` : '';
    return `<div class="blk blk-${b.type} ${sel ? 'sel' : ''} ${trying ? 'trying' : ''} ${b.alt ? `alt ${b.alt.source === 'brainstorm' ? 'altbs' : ''}` : ''}" data-key="b-${b.id}" data-block="${b.id}" data-scene="${sc.id}">
      ${alt}
      <div class="gut" draggable="true" data-drag="blocks" data-act="sc-sel" data-scene="${sc.id}" data-block="${b.id}" title="drag to move · click to pick">⋮⋮</div>
      <div class="bb">${body}</div>
      <div class="bt">${editing}${ro ? '' : `<button class="ghost x" data-act="sc-block-del" data-scene="${sc.id}" data-block="${b.id}" title="delete line">${I('x')}</button>`}</div>
      ${sx.slash === b.id ? `<div class="slash">${typeMenu(sc.id, '', b.id)}</div>` : ''}
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
    if (j) await sapi(j.result ? 'gen/done' : 'gen/clear', { job: j.id });
    sx.trying = null;
    sx.gen.open = true; sx.gen.ctl = false; sx.gen.input = input;
    R();
  }
  function genView(d) {
    const g = sx.gen;
    const jb = myGen();
    const jd = jb && state.drafts[jb.draft];
    const inp = g.input && state.drafts[g.input.draft]?.scenes[g.input.scene] ? g.input : null;
    const isc = inp && state.drafts[inp.draft].scenes[inp.scene];
    let inBlocks = inp ? (inp.refine || inp.blocks.map((id) => isc.blocks.find((b) => b.id === id)).filter(Boolean)) : [];
    if (inp && !inBlocks.length && jb?.original) inBlocks = jb.original;
    const canTry = jb && canEdit(jd);
    const applied = jb?.applied;
    const opts = jb?.result?.options || [];
    const showCtl = !jb || g.ctl;
    const tw = cfg.twists[g.twist];
    const voice = `${esc(persName(g.personality, g.custom))}${g.twist !== 'none' ? ` · ${esc(tw.name)}` : ''}`;
    return `<div class="genhead">${I('sparkle')}<b>Options</b>${inp ? `<span class="muted small">${inp.refine ? 'refining · ' : ''}${plural(inBlocks.length, 'line')} · ${esc(isc._num ? `${isc._num} ` : '')}${esc(isc.title)}</span>` : ''}<span class="grow"></span><button class="icon" data-act="sc-gen-close" title="close">${I('x')}</button></div>
      ${inp ? `<div class="preview">${inBlocks.map((b) => blockView(b)).join('')}</div>` : '<div class="genempty">Click ⋮⋮ beside lines in the script to pick them, or drag them here.</div>'}
      ${showCtl ? `<div class="genctl">
        <select data-act="sc-gen-pers" title="voice">${Object.values(cfg.personalities).map((p) => `<option value="${p.key}" ${g.personality === p.key ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        ${g.personality === 'custom' ? `<input data-genfield="custom" value="${esc(g.custom)}" placeholder="the voice, in one line" maxlength="300">` : ''}
        <div class="twists">${Object.values(cfg.twists).map((t) => `<button class="tw ${g.twist === t.key ? 'on' : ''}" data-act="sc-gen-twist" data-tw="${t.key}" title="${esc(t.rule)}">${t.icon ? I(t.icon) : ''}${esc(t.name)}</button>`).join('')}</div>
        <input data-genfield="ask" value="${esc(g.ask)}" placeholder="anything specific? (optional)" maxlength="400">
        <button class="primary wide" data-act="sc-gen-go" ${inp ? '' : 'disabled'}>${opts.length ? 'New options' : 'Get options'}</button>
      </div>` : `<button class="voiceline" data-act="sc-gen-ctl">${voice} · <u>change</u></button>`}
      ${jb ? `<div class="results" data-key="res-${jb.id}">
        ${!opts.length ? `<div class="genwait">${busyLabel(jb) || '…'}</div>` : ''}
        ${opts.length && canTry ? `<button class="opt orig ${applied ? '' : 'cur'}" data-act="sc-gen-try" data-job="${jb.id}" data-opt="original">${applied ? `${I('undo')} Back to the original` : 'The original is in the script'}</button>` : ''}
        ${opts.map((o, i) => `<div class="opt ${applied?.option === i ? 'cur' : ''} ${canTry ? 'clickable' : ''}" data-key="opt-${jb.id}-${i}" ${canTry ? `data-act="sc-gen-try" data-job="${jb.id}" data-opt="${i}"` : ''}>
          <div class="onote">${esc(o.note)}${applied?.option === i ? ' <span class="incur">in the script</span>' : ''}</div><div class="preview">${o.blocks.map((b) => blockView(b)).join('')}</div>
          <div class="oacts">${canTry ? `<button class="ghost small" data-act="sc-gen-alt" data-job="${jb.id}" data-opt="${i}" title="add it next to the lines, to decide later">keep as alternate</button>` : ''}<button class="ghost small" data-act="sc-gen-refine" data-job="${jb.id}" data-opt="${i}">refine this</button></div></div>`).join('')}
        ${opts.length ? `<button class="primary wide" data-act="sc-gen-done" data-job="${jb.id}">Done</button>` : ''}
      </div>` : ''}`;
  }

  // ---------------------------------------------------------------- Board
  function boardView() {
    const d = D();
    const ro = !canEdit(d);
    const floats = d.floating.map((id) => d.scenes[id]);
    return `<main class="board" data-key="board">
      <div class="cards" data-drop="order">${d.order.map((id) => boardCard(d, d.scenes[id], ro)).join('')}
        ${ro ? '' : `<button class="addcard" data-act="sc-scene-add" data-after="end">${I('plus')}New scene</button>`}</div>
      <div class="trayh">Not placed${floats.length ? ` <span>${floats.length}</span>` : ''}</div>
      <div class="tray ${floats.length ? '' : 'empty'}" data-drop="tray">${floats.map((sc) => trayCard(d, sc, ro)).join('') || '<div class="trayhint">Drag a card here to take it out of the order. Scenes from Brainstorm land here too.</div>'}</div>
    </main>`;
  }
  function boardCard(d, sc, ro) {
    const h = sc.blocks.find((b) => b.type === 'heading');
    const first = sc.blocks.find((b) => b.type === 'action');
    return `<div class="bcard" data-key="bc-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}" data-drop="scene">
      <div class="bctop"><span class="bnum">${sc._num}</span>${sc.lock ? `<span class="lockmark">${I('lock')}</span>` : ''}<span class="grow"></span>
        ${ro || sc.lock ? '' : `<div class="menuwrap">${menuBtn(`sx-card:${sc.id}`)}${menu(`sx-card:${sc.id}`, [mi('sc-scene-unplace', '', 'Take it out of the order', { scene: sc.id }), mi('sc-scene-del', 'trash', 'Delete scene', { scene: sc.id }, 'danger')], 'right')}</div>`}</div>
      <input class="btitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''} maxlength="120">
      <div class="bhead">${esc(h ? headingText(h) : '')}</div>
      <div class="bsum">${esc((first?.text || '').slice(0, 110))}</div>
      <a class="bopen" href="${base()}/write" data-act="sc-goto-scene" data-scene="${sc.id}">Open ›</a>
    </div>`;
  }
  function trayCard(d, sc, ro) {
    const s = sc.placeSuggestion;
    return `<div class="tcard" data-key="tc-${sc.id}" ${ro ? '' : 'draggable="true"'} data-drag="scene" data-scene="${sc.id}">
      <div class="bctop"><input class="btitle" data-stitle="${sc.id}" value="${esc(val(sc.id, 'title', sc.title))}" ${ro ? 'readonly' : ''}><span class="grow"></span>
        ${ro ? '' : `<div class="menuwrap">${menuBtn(`sx-card:${sc.id}`)}${menu(`sx-card:${sc.id}`, [mi('sc-scene-suggest', 'scale', 'Ask the Judge where it fits', { scene: sc.id }), mi('sc-scene-place', 'plus', 'Place it at the end', { scene: sc.id, after: d.order.at(-1) || '' }), mi('sc-scene-del', 'trash', 'Delete scene', { scene: sc.id }, 'danger')], 'right')}</div>`}</div>
      ${sc.from ? `<div class="bsum">${sc.fromCard && cardOf(sc.fromCard) ? `<a href="${sessionHref(cardOf(sc.fromCard).session)}">${esc(clean(sc.from))}</a>` : esc(clean(sc.from))}</div>` : ''}
      ${s?.pending ? '<div class="sug">the Judge is looking for where it fits…</div>' : s ? `<div class="sug">fits ${s.after ? `after ${d.scenes[s.after]?._num} ${esc(d.scenes[s.after]?.title || '?')}` : 'at the start'}${ro ? '' : ` <button class="small" data-act="sc-scene-place" data-scene="${sc.id}" data-after="${s.after || ''}">Place it</button>`}</div>` : ''}
      <a class="bopen" href="${base()}/write" data-act="sc-goto-scene" data-scene="${sc.id}">Open ›</a>
    </div>`;
  }

  // ---------------------------------------------------------------- Shots: the breakdown only (images, video and sound get their own sections)
  function shotsView() {
    const d = D();
    if (!d.isMain) return `<main class="center-msg" data-key="shots-nomain"><p>Shots come from Main.</p><button class="small" data-act="sc-to-main">Go to Main</button></main>`;
    const ro = !canEdit(d);
    const locked = d.order.map((id) => d.scenes[id]).filter((sc) => sc.lock);
    const waiting = d.order.length - locked.length;
    return `<main class="shots" data-key="shots">
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
        ${ro ? '' : `<div class="menuwrap">${menuBtn(`sx-shots:${sc.id}`)}${menu(`sx-shots:${sc.id}`, [
          mi('sc-breakdown', 'sparkle', sc.shots.length ? 'Propose shots again' : 'Propose shots', { scene: sc.id }),
          mi('sc-shot-add', 'plus', 'Add a shot', { scene: sc.id }),
          sc.shots.some((s) => s.status !== 'approved') ? mi('sc-shot-approve-all', 'check', 'Mark all final', { scene: sc.id }) : '',
          mi('sc-goto-scene', 'edit', 'Open the scene', { scene: sc.id }),
        ], 'right')}</div>`}
      </header>
      ${changed && sc.shots.length && !working ? `<div class="attn static"><span class="warn">The scene changed after it was locked, so these shots may need a look.</span>${ro ? '' : ` <button class="small" data-act="sc-goto-scene" data-scene="${sc.id}">See the change</button><button class="small" data-act="sc-breakdown" data-scene="${sc.id}">${I('sparkle')}Propose again</button>`}</div>` : ''}
      ${working ? `<div class="attn static"><span class="info">proposing shots · ${busyLabel(bJob)}</span></div>` : ''}
      ${sc.shots.length ? `<div class="stable">${sc.shots.map((s) => shotRow(d, sc, s, ro)).join('')}</div>` : working ? '' : `<div class="empty small">No shots yet.${ro ? '' : ` <button class="small" data-act="sc-breakdown" data-scene="${sc.id}">${I('sparkle')}Propose shots</button>`}</div>`}
    </section>`;
  }
  function shotRow(d, sc, s, ro) {
    const F = (f, extra = '') => `data-shotf="${f}" data-scene="${sc.id}" data-shot="${s.id}" data-key="sf-${s.id}-${f}" ${ro ? 'readonly' : ''} ${extra}`;
    const v = (f) => esc(val(s.id, f, s[f]));
    const more = sx.shotMore[s.id];
    const covers = s.blocks.map((id) => blockIndex(sc, id)).filter((x) => x !== '?');
    return `<div class="shot ${s.status}" data-key="sr-${s.id}">
      <div class="shmain">
        <span class="shn" title="stable id ${s.id}">${s._num}</span>
        <input class="sfr" list="framings" ${F('framing')} value="${v('framing')}" title="framing">
        <textarea class="auto sact" rows="1" ${F('action', 'placeholder="what we see"')}>${v('action')}</textarea>
        <input class="sdur" type="number" min="0" step="0.5" ${F('duration')} value="${v('duration')}" title="seconds"><span class="muted small">s</span>
        <button class="final ${s.status === 'approved' ? 'on' : ''}" ${ro ? 'disabled' : ''} data-act="sc-shot-approve" data-scene="${sc.id}" data-shot="${s.id}" data-yes="${s.status === 'approved' ? 0 : 1}" title="${s.status === 'approved' ? 'final · click to undo' : 'mark final'}">${I('check')}</button>
        <button class="ghost small" data-act="sc-shot-more" data-shot="${s.id}" title="details">${more ? '▴' : '▾'}</button>
      </div>
      ${more ? `<div class="shmore">
        <label>Camera<input ${F('camera', 'placeholder="static, dolly in…"')} value="${v('camera')}"></label>
        <label>Characters<input ${F('characters')} value="${v('characters')}"></label>
        <label>Location<input ${F('location')} value="${v('location')}"></label>
        <label>Dialogue / VO<textarea class="auto" rows="1" ${F('dialogue')}>${v('dialogue')}</textarea></label>
        <label>References<input ${F('refs', 'placeholder="Section 3"')} value="${v('refs')}"></label>
        <div class="cov"><span class="muted small">Covers lines</span> ${covers.length ? covers.join(', ') : '—'} ${ro ? '' : `<button class="ghost small" data-act="sc-cover-edit" data-shot="${sx.coverEdit === s.id ? '' : s.id}">${sx.coverEdit === s.id ? 'done' : 'change'}</button>`}
          ${sx.coverEdit === s.id ? `<div class="coverpick">${sc.blocks.filter((b) => b.type !== 'note' && !b.alt).map((b) => `<label><input type="checkbox" data-act="sc-cover-tick" data-scene="${sc.id}" data-shot="${s.id}" data-block="${b.id}" ${s.blocks.includes(b.id) ? 'checked' : ''}> ${blockIndex(sc, b.id)} · ${esc((b.type === 'heading' ? headingText(b) : b.type === 'dialogue' ? `${b.character}: ${b.line}` : b.text).slice(0, 60))}</label>`).join('')}</div>` : ''}</div>
        ${ro ? '' : `<div class="shtools"><span class="grow"></span><button class="ghost small" data-act="sc-shot-up" data-scene="${sc.id}" data-shot="${s.id}">move up</button><button class="ghost small" data-act="sc-shot-down" data-scene="${sc.id}" data-shot="${s.id}">move down</button><button class="ghost small danger" data-act="sc-shot-del" data-scene="${sc.id}" data-shot="${s.id}">delete</button></div>`}
      </div>` : ''}
    </div>`;
  }

  // ================================================================ HISTORY ROOM
  const SESH_STATUS = { open: 'open', saved: 'to review', approved: 'approved', tagged: 'tagged' };
  const dur = (a, b) => { const m = Math.max(1, Math.round(((b || Date.now()) - a) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
  function historyView(sub) {
    if (sub === 'drafts') return draftsView();
    if (sub === 'compare') return `<main class="sroom" data-key="compare">${compareView()}</main>`;
    return seshesView();
  }
  function seshesView() {
    const all = Object.values(state.seshes).sort((a, b) => (b.status === 'open') - (a.status === 'open') || (b.endedAt || b.lastAt) - (a.endedAt || a.lastAt));
    const f = sx.seshFilter;
    const list = all.filter((x) => f === 'all' || x.status === f);
    const count = (k) => all.filter((x) => x.status === k).length;
    const flt = (k, label) => (k === 'all' || count(k) ? `<button class="link ${f === k ? 'on' : ''}" data-act="sc-sesh-filter" data-f="${k}">${label}${k !== 'all' ? ` ${count(k)}` : ''}</button>` : '');
    return `<main class="sroom" data-key="seshes">
      <div class="filters">${[flt('all', 'All'), flt('saved', 'To review'), flt('tagged', 'Tagged'), flt('approved', 'Approved')].filter(Boolean).join('<i>·</i>')}</div>
      <div class="xlist">${list.length ? list.map((x) => seshRow(x) + (sx.sesh === x.id ? seshDetail(x) : '')).join('') : '<div class="empty">Nothing here yet. Your work becomes a sesh as soon as you change something.</div>'}</div>
    </main>`;
  }
  function seshRow(x) {
    const d = state.drafts[x.draft];
    return `<div class="xrow st-${x.status} ${sx.sesh === x.id ? 'cur' : ''}" data-key="xr-${x.id}" data-act="sc-sesh-open" data-sesh="${x.id}">
      <span class="sst ${x.status}">${SESH_STATUS[x.status] || x.status}</span>
      <span class="xtt"><span><b>${esc(x.title)}</b>${x.tags?.length ? ` ${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}` : ''}</span>
        <span class="muted small">${d && !d.isMain ? `${esc(d.name)} · ` : ''}${esc((x.people.length ? x.people : [x.by]).join(' & '))} · ${new Date(x.startedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${plural(x.changes, 'change')}</span></span>
      <span class="chev">${sx.sesh === x.id ? '▴' : '▾'}</span></div>`;
  }
  function seshDetail(x) {
    const d = state.drafts[x.draft];
    const ed = canEdit(d);
    if (!sx.seshData || sx.seshData.sesh.id !== x.id || sx.seshData.stamp !== `${x.changes}:${x.status}:${x.v}`) loadSesh(x);
    const data = sx.seshData?.sesh.id === x.id ? sx.seshData : null;
    const actions = x.status === 'open'
      ? (ed ? `<button class="primary small" data-act="sc-sesh-end" data-draft="${x.draft}">Save as a version</button>` : '')
      : `<button class="small ${x.status === 'approved' ? 'on' : ''}" data-act="sc-sesh-review" data-sesh="${x.id}" data-status="approved">${I('check')}Approve</button>
         <button class="small ${x.status === 'tagged' ? 'on' : ''}" data-act="sc-sesh-tag" data-sesh="${x.id}">${I('tag')}Tag what needs work</button>
         ${ed ? `<button class="small" data-act="sc-sesh-followup" data-sesh="${x.id}">Pick it up again</button>` : ''}
         <span class="grow"></span>
         ${ed ? `<button class="ghost small danger" data-act="sc-sesh-revert" data-sesh="${x.id}">${I('undo')}Undo this sesh</button>` : ''}`;
    return `<div class="xdetail" data-key="xd-${x.id}">
      <div class="sdhead"><input class="sdtitle" data-seshtitle="${x.id}" value="${esc(val(x.id, 'title', x.title))}" maxlength="80" title="rename">
        <span class="muted small">${x.v && d ? `version ${x.v} of ${esc(draftLabel(d))} · ` : ''}${dur(x.startedAt, x.endedAt)}${x.followsUp && state.seshes[x.followsUp] ? ` · follows “${esc(state.seshes[x.followsUp].title)}”` : ''}${x.reviewedBy ? ` · ${x.status} by ${esc(x.reviewedBy)}` : ''}</span></div>
      ${x.status === 'tagged' && (x.note || x.tags?.length) ? `<div class="snote">${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')} ${esc(x.note)}</div>` : ''}
      <div class="sreview">${actions}</div>
      <div class="cols2">
        <div><div class="mlabel">What happened</div><div class="sevents">${data ? data.events.map((e) => `<div class="sev" data-key="se-${e.id}"><span class="muted">${new Date(e.ts).toTimeString().slice(0, 5)}</span> <b>${esc(e.who)}</b> ${esc(clean(e.text))}${e.personality ? ` <span class="muted">· ${esc(clean(e.personality))}${e.twist ? ` · ${esc(clean(e.twist))}` : ''}</span>` : ''}</div>`).join('') || '<div class="muted small">nothing logged</div>' : '<div class="muted small">…</div>'}</div></div>
        <div><div class="mlabel">What changed in the script</div>${data?.before && data?.after ? sideBySide({ snap: data.before, name: 'Before', v: x.baseV || null }, { snap: data.after, name: x.status === 'open' ? 'Now' : 'After', v: x.v || null }, true) : '<div class="muted small">…</div>'}</div>
      </div>
    </div>`;
  }
  async function loadSesh(x) {
    const stamp = `${x.changes}:${x.status}:${x.v}`;
    if (sx.seshLoading === x.id + stamp) return;
    sx.seshLoading = x.id + stamp;
    const r = await getJSON(`sesh?id=${encodeURIComponent(x.id)}`);
    sx.seshData = { ...r, stamp };
    sx.seshLoading = null;
    R();
  }

  function draftsView() {
    const list = Object.values(state.drafts).sort((a, b) => (b.isMain - a.isMain) || a.createdAt - b.createdAt);
    const vv = sx.viewVersion;
    return `<main class="sroom" data-key="drafts">
      <div class="dlist">${list.map((d) => draftRow(d) + (vv?.draft === d.id ? versionViewer(vv) : '')).join('')}</div>
      ${list.some((d) => d.owner === me) ? '' : '<div class="muted small center" style="margin-top:14px">You have no draft of your own. ⋯ on Main → Make my own draft.</div>'}
    </main>`;
  }
  function draftRow(d) {
    const ed = canEdit(d);
    const cur = d.id === D().id;
    const open = d.sesh && state.seshes[d.sesh];
    const sub = d.isMain ? 'everyone writes here · the pipeline uses it' : `${d.owner === me ? 'yours' : `${esc(d.owner)}’s`}${d.forkedFrom ? ` · from ${esc(d.forkedFrom.name)}${d.forkedFrom.v ? ` v${d.forkedFrom.v}` : ''}` : ''}${d.formerName ? ` · was ${esc(d.formerName)}` : ''}`;
    const showV = sx.draftOpen[d.id];
    return `<div class="drow ${cur ? 'cur' : ''}" data-key="dr-${d.id}">
      <div class="dtop">
        <span class="dname">${d.isMain ? `${I('star')} Main` : ed && d.owner === me ? `<input data-dname="${d.id}" value="${esc(d.name)}" maxlength="60">` : esc(d.name)}</span>
        <span class="muted small">${sub} · edited ${ago(d.editedAt)}${open ? ' · <span class="reddot"></span> sesh open' : ''}</span>
        <span class="grow"></span>
        ${cur ? '<span class="muted small">you are here</span>' : `<button class="small" data-act="sc-open-draft" data-draft="${d.id}">Open</button>`}
        <div class="menuwrap">${menuBtn(`sx-draft:${d.id}`)}${menu(`sx-draft:${d.id}`, [
          mi('sc-fork', 'fork', d.isMain ? 'Make my own draft from it' : 'Copy it into a draft of my own', { draft: d.id }),
          !d.isMain ? mi('sc-make-main', 'star', 'Make it Main…', { draft: d.id }) : '',
          !d.isMain ? mi('sc-cmp-main', 'columns', 'Compare with Main', { draft: d.id }) : '',
          ed && open ? mi('sc-sesh-end', 'check', 'Save its open sesh', { draft: d.id }) : '',
        ], 'right')}</div>
      </div>
      <button class="link small" data-act="sc-draft-versions" data-draft="${d.id}">${plural(d.versions.length, 'version')} ${showV ? '▴' : '▾'}</button>
      ${showV ? `<div class="vchips">${[...d.versions].reverse().map((v) => `<button class="vchip ${sx.viewVersion?.draft === d.id && sx.viewVersion?.v === v.n ? 'on' : ''}" data-act="sc-view-version" data-draft="${d.id}" data-v="${v.n}" title="${esc(v.by)} · ${new Date(v.ts).toLocaleString()}">v${v.n} ${esc(v.name || v.reason || '')}</button>`).join('')}</div>` : ''}
    </div>`;
  }
  function versionViewer(vv) {
    const d = state.drafts[vv.draft];
    if (!vv.data) return '<div class="vview">…</div>';
    const s = vv.data.snap;
    const targets = Object.values(state.drafts).filter((x) => canEdit(x));
    return `<div class="vview" data-key="vv-${vv.draft}-${vv.v}">
      <div class="vhead"><b>v${vv.v}</b> <span class="muted">${esc(vv.data.label || '')}</span><span class="grow"></span>
        ${canEdit(d) ? `<button class="small" data-act="sc-restore" data-draft="${d.id}" data-v="${vv.v}">Restore it</button>` : ''}
        <button class="small" data-act="sc-cmp-now" data-draft="${d.id}" data-v="${vv.v}">Compare with now</button>
        <div class="menuwrap">${menuBtn(`sx-ver:${vv.v}`)}${menu(`sx-ver:${vv.v}`, [mi('sc-fork', 'fork', 'Make a draft from this version', { draft: d.id, v: vv.v })], 'right')}</div>
        <button class="icon" data-act="sc-close-version" title="close">${I('x')}</button></div>
      ${[...s.order, ...s.floating].map((id) => { const sc = s.scenes[id]; const n = s.order.indexOf(id) + 1 || ''; return `<div class="vscene"><div class="ch"><span>${n} ${esc(sc.title)}</span><span class="grow"></span><select class="small quiet" data-act="sc-pull-v" data-from="${d.id}" data-v="${vv.v}" data-scene="${id}"><option value="">pull into…</option>${targets.map((x) => `<option value="${x.id}">${esc(draftLabel(x))}</option>`).join('')}</select></div>${sc.blocks.filter((b) => !b.alt).map((b) => blockView(b)).join('')}</div>`; }).join('')}
    </div>`;
  }

  // ================================================================ BIBLE ROOM
  function bibleView(sub) {
    if (sub === 'characters') {
      const F = [['role', 'Role'], ['look', 'Look'], ['personality', 'Personality'], ['arc', 'Arc'], ['voice_notes', 'Voice']];
      const cards = (state.characterCards || []).filter((c) => F.some(([k]) => c[k]));
      const names = state.project.characters.filter((n) => !cards.some((c) => c.name === n));
      return `<main class="sroom narrow" data-key="bible-chars">
      ${cards.map((c) => { const from = c.from_card && cardOf(c.from_card); return `<div class="ccard" data-key="cc-${esc(c.name)}"><div class="cchead"><b>${esc(c.name)}</b>${c.role ? `<span class="muted">${esc(c.role)}</span>` : ''}<span class="grow"></span>${from ? `<a class="small" href="${sessionHref(from.session)}">${I('spark')}from Brainstorm</a>` : ''}</div>
        <dl>${F.filter(([k]) => k !== 'role' && c[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(c[k])}</dd>`).join('')}</dl></div>`; }).join('')}
      <div class="chips big">${names.map((c) => `<span class="chip">${esc(c)}</span>`).join('') || (cards.length ? '' : '<span class="muted">No characters yet.</span>')}</div>
      <input class="addchar" data-addchar="1" placeholder="Add a character, Enter" maxlength="40">
      <p class="muted small">Names typed in dialogue join the list on their own. A Character promoted in Brainstorm arrives here as a card.</p></main>`;
    }
    if (sub === 'notes') return `<main class="sroom narrow" data-key="bible-notes">
      <div class="mlabel">Logline</div><textarea class="auto quietbox" rows="2" data-pfield="logline">${esc(val('project', 'logline', state.project.logline))}</textarea>
      ${state.project.notes ? `<div class="mlabel">From the Idea</div><div class="small pre">${esc(state.project.notes)}</div>` : ''}
      <div class="mlabel">Intentional exceptions <span class="muted">· Judge notes marked as intended</span></div>
      ${state.exceptions.length ? state.exceptions.map((x, i) => `<div class="small exc" data-key="ex-${i}"><b>${esc(x.scene)}</b> ${esc(x.note)} <span class="muted">· ${esc(x.who)}: “${esc(x.reason)}”</span></div>`).join('') : '<div class="muted small">None.</div>'}
    </main>`;
    return `<main class="sroom narrow" data-key="bible-facts">${factsLedger()}</main>`;
  }

  // facts: plain sentences under their scene; click to change; a dot when the scene changed since
  function factFlag(f) { const m = M(); const sc = f.scene && m?.scenes[f.scene]; return f.doubt || (sc && f.hash && sc._hash !== f.hash ? 'its scene changed since this was written' : ''); }
  function factsToLook() { return (state.facts || []).filter(factFlag); }
  function factsLedger() {
    const m = M();
    const facts = state.facts || [];
    const flagged = factsToLook();
    const review = sx.factReview && flagged.length;
    const shown = review ? flagged : facts;
    const ids = [...m.order, ...m.floating];
    const groups = ids.map((id) => [id, shown.filter((f) => f.scene === id)]).filter(([id, l]) => l.length || (!review && sx.factNew === id));
    const canonFacts = shown.filter((f) => f.source === 'brainstorm' && (!f.scene || !m.scenes[f.scene]));
    const canonBy = {}; for (const f of canonFacts) (canonBy[f.fromCard || ''] ||= []).push(f);
    const loose = shown.filter((f) => (!f.scene || !m.scenes[f.scene]) && !canonFacts.includes(f));
    const sceneOpts = (cur) => `<option value="">no scene</option>${ids.map((id) => `<option value="${id}" ${cur === id ? 'selected' : ''}>${m.scenes[id]._num ?? '–'} ${esc(m.scenes[id].title)}</option>`).join('')}`;
    const row = (f) => {
      const flag = factFlag(f);
      const meta = `${f.source === 'team' ? `written by ${f.by}` : f.source === 'brainstorm' ? `from Brainstorm, sparked by ${f.by}` : 'from the Judge'}${f.edited ? ` · changed by ${f.edited.by}` : ''} · ${ago(f.edited?.at || f.at)}`;
      if (sx.factEdit === f.id) return `<li class="fi editing" data-key="fa-${f.id}"><input class="ftext" data-factedit="${f.id}" value="${esc(val(f.id, 'fact', f.fact))}" maxlength="300"><span class="muted small">Enter to save · Esc</span></li>`;
      return `<li class="fi ${flag ? 'flag' : ''}" data-key="fa-${f.id}">
        <span class="fdot" title="${esc(flag)}"></span>
        <span class="ft" data-act="sc-fact-edit" data-id="${f.id}" title="${esc(meta)} · click to change">${esc(f.fact)}</span>
        <span class="ftools">${sx.factMove === f.id ? `<select class="small quiet" data-factmove="${f.id}">${sceneOpts(f.scene && m.scenes[f.scene] ? f.scene : '')}</select>` : `${flag ? `<button class="ghost small" data-act="sc-fact-ok" data-id="${f.id}">still true</button>` : ''}<button class="ghost small" data-act="sc-fact-move" data-id="${f.id}">move</button><button class="ghost small" data-act="sc-fact-del" data-id="${f.id}">remove</button>`}</span>
        ${review && flag ? `<div class="freason">${esc(flag)}</div>` : ''}
      </li>`;
    };
    const newRow = (scene) => (sx.factNew === (scene || 'none') ? `<li class="fi editing" data-key="fnew-${scene || 'none'}"><input class="ftext" data-factnew="${scene || 'none'}" placeholder="a new fact…" maxlength="300"><span class="muted small">Enter to add · Esc</span></li>` : '');
    const addBtn = (scene) => (review ? '' : `<button class="fadd" data-act="sc-fact-new" data-scene="${scene || 'none'}">${I('plus')}Add a fact</button>`);
    return `<div class="fhead"><span class="muted small">${plural(facts.length, 'fact')}: what’s true in the story so far</span><span class="grow"></span>
        ${flagged.length ? `<button class="link ${review ? 'on' : ''}" data-act="sc-fact-review">${review ? 'Show all' : `<span class="adot"></span> ${flagged.length} may be out of date`}</button>` : ''}</div>
      ${Object.entries(canonBy).map(([cid, list]) => { const c = cardOf(cid); return `<section class="fg" data-key="fg-canon-${esc(cid)}"><span class="fgh">${I('compass')} Canon${c ? ` · <a href="${sessionHref(c.session)}">${esc(c.title)}</a>` : ' · from Brainstorm'}</span><ul class="fl">${list.map(row).join('')}</ul></section>`; }).join('')}
      ${groups.map(([id, list]) => { const sc = m.scenes[id]; return `<section class="fg" data-key="fg-${id}"><a class="fgh" href="${base()}/write" data-act="sc-goto-scene" data-scene="${id}">${sc._num ?? ''} ${esc(sc.title)}</a><ul class="fl">${list.map(row).join('')}${newRow(id)}</ul>${addBtn(id)}</section>`; }).join('')}
      ${loose.length || sx.factNew === 'none' ? `<section class="fg" data-key="fg-none"><span class="fgh muted">No scene</span><ul class="fl">${loose.map(row).join('')}${newRow(null)}</ul></section>` : ''}
      ${review ? '' : `<button class="fadd" data-act="sc-fact-new" data-scene="none">${I('plus')}Add a fact without a scene</button>`}
      <p class="muted small foot">The Judge adds facts when it checks a scene and reads them every time it checks. It never removes one a person wrote or changed.</p>`;
  }
  function saveFact(t) {
    const id = t.dataset.factedit;
    const f = state.facts.find((x) => x.id === id);
    const v = t.value.trim();
    delete local[`${id}:fact`];
    sx.factEdit = null;
    if (f && v !== f.fact) { if (v) sapi('fact/edit', { id, fact: v }); else sapi('fact/delete', { id }); }
    R();
  }
  function saveNewFact(t) {
    const v = t.value.trim();
    const scene = t.dataset.factnew === 'none' ? null : t.dataset.factnew;
    sx.factNew = null;
    if (v) sapi('fact/add', { fact: v, scene });
    R();
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
  function diffAgainst(hash, sc) {
    const old = sx.snaps[hash];
    if (old === undefined) { sx.snaps[hash] = null; getJSON(`snap?h=${encodeURIComponent(hash)}`).then((r) => { sx.snaps[hash] = r.blocks || []; R(); }); }
    if (!old) return '<div class="muted small">…</div>';
    const cur = sc.blocks.filter((b) => b.type !== 'note' && !b.alt);
    const rows = blockDiffRows(old, cur).filter((r) => r.kind !== 'same');
    if (!rows.length) return '<div class="muted small">No change in the script (only notes or alternates).</div>';
    return `<div class="udiff">${rows.map((r) => {
      if (r.kind === 'removed') return `<div class="dr rem">${blockView(r.a)}</div>`;
      if (r.kind === 'added') return `<div class="dr add">${blockView(r.b)}</div>`;
      return `<div class="dr chg"><div class="was">${blockView(r.a)}</div><div class="now">${blockView(r.b)}</div></div>`;
    }).join('')}</div>`;
  }
  function compareView() {
    const c = sx.compare;
    const opts = [];
    for (const d of Object.values(state.drafts)) {
      opts.push({ k: `${d.id}:`, label: `${draftLabel(d)} · now` });
      for (const v of [...d.versions].reverse()) opts.push({ k: `${d.id}:${v.n}`, label: `${draftLabel(d)} · v${v.n} ${v.name || v.reason || ''}` });
    }
    const sel = (side) => `<select data-act="sc-cmp-pick" data-side="${side}"><option value="">choose…</option>${opts.map((o) => `<option value="${o.k}" ${c[side] === o.k ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    return `<div class="cmpbar">${sel('a')} <span class="muted">and</span> ${sel('b')} <button class="small primary" data-act="sc-cmp-go" ${c.a && c.b ? '' : 'disabled'}>Compare</button></div>${c.data ? sideBySide(c.data.a, c.data.b) : ''}`;
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
    const [ad, av] = sx.compare.a.split(':'); const [bd, bv] = sx.compare.b.split(':');
    const [a, b] = await Promise.all([getJSON(`version?draft=${ad}&v=${av || ''}`), getJSON(`version?draft=${bd}&v=${bv || ''}`)]);
    sx.compare.data = { a, b }; R();
  }

  // ================================================================ after a render
  const fieldSizing = CSS.supports('field-sizing', 'content');
  function autosize(el) { if (fieldSizing || el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  function post(ctx) {
    sync(ctx);
    if (!fieldSizing) {
      app.querySelectorAll('.sx textarea.auto').forEach(autosize);
      app.querySelectorAll('.sx .blk-heading .loc, .sx .blk-heading .time').forEach((el) => { el.style.width = `${Math.max(el.classList.contains('loc') ? 10 : 6, (el.value || el.placeholder).length + 2)}ch`; });
    }
    if (sx.focusNext) {
      const { block, field, type } = sx.focusNext;
      const scope = app.querySelector(`[data-block="${block}"]${type ? `.blk-${type}` : ''}`);
      const el = scope && (scope.querySelector(`[data-field="${field || ''}"]`) || scope.querySelector('[data-field]'));
      if (el) { sx.focusNext = null; el.focus(); if (el.setSelectionRange && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length); el.scrollIntoView({ block: 'nearest' }); }
    }
    if (sx.focusSel) { const el = app.querySelector(sx.focusSel); if (el) { sx.focusSel = null; el.focus(); if (el.dataset.dname) el.select(); else if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }
    if (sx.scrollTo) { const el = document.getElementById(sx.scrollTo); if (el) { sx.scrollTo = null; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  }
  const scrollToScene = (id, prefix = 'scene') => { sx.scrollTo = `${prefix}-${id}`; setTimeout(() => { const el = document.getElementById(sx.scrollTo || ''); if (el) { sx.scrollTo = null; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 80); };

  // ================================================================ actions (acts start with sc-)
  const blockCtx = (el) => ({ draft: D().id, scene: el.closest('[data-scene]')?.dataset.scene, block: el.closest('[data-block]')?.dataset.block });

  async function onClick(e, b, ctx) {
    const act = b.dataset.act;
    if (!act?.startsWith('sc-')) return false;
    if (b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return true; // handled on change
    sync(ctx);
    const d = state?.started ? D() : null;
    const ds = b.dataset;
    if (b.classList.contains('mi')) R(); // the menu closes at once
    switch (act) {
      case 'sc-notice-x': sx.notice = null; R(); return true;
      case 'sc-keys': sx.keys = !sx.keys; R(); return true;
      case 'sc-start': { const r = await sapi('start', { mode: ds.mode, card: ds.card }); if (r.ok) go('write'); return true; }
      case 'sc-to-main': setDraft(state.mainId); R(); return true;

      // home, drafts, the switcher
      case 'sc-home': go('home'); return true;
      case 'sc-switch': setDraft(ds.draft); R(); return true;
      case 'sc-new-open': sx.newDraft = true; sx.ndName = ''; sx.focusSel = '[data-ndname]'; R(); return true;
      case 'sc-new-close': sx.newDraft = false; R(); return true;
      case 'sc-new-go': sx.newDraft = true; sx.ndName = ''; sx.focusSel = '[data-ndname]'; go('home'); R(); return true;
      case 'sc-new': {
        const name = (sx.ndName || '').trim() || freshName();
        const r = ds.mode === 'copy' ? await sapi('draft/fork', { from: state.mainId, name }) : await sapi('draft/new', { mode: ds.mode, card: ds.card, name });
        if (r.ok) { setDraft(r.id); sx.newDraft = false; sx.ndName = ''; go('write'); toast(ds.mode === 'idea' ? 'Your new draft: the AI is building its skeleton' : 'You are in your new draft'); }
        return true;
      }
      case 'sc-new-from-idea': {
        const c = cardOf(ds.card); if (!c) return true;
        const r = await sapi('draft/new', { mode: 'idea', card: c.id, name: ideaName(c.title).slice(0, 60) || freshName() });
        if (r.ok) { setDraft(r.id); go('write'); toast('Your new draft: the AI is building its skeleton'); }
        return true;
      }
      case 'sc-rename': sx.renaming = ds.draft; sx.focusSel = `[data-dname="${ds.draft}"]`; R(); return true;
      case 'sc-versions': sx.draftOpen[ds.draft] = true; go('history', 'drafts'); return true;

      // promoted
      case 'sc-popen': sx.popen[ds.card] = !sx.popen[ds.card]; R(); return true;
      case 'sc-psend': {
        const c = cardOf(ds.card); if (!c) return true;
        const o = c.origin?.section === 'script' ? c.origin : null;
        const loose = c.type === 'dialogue' && !(o && (state.drafts[o.draft]?.scenes[o.scene] || M()?.scenes[o.scene]));
        if (loose && !sx.psendscene[c.id]) { toast('pick the scene its lines go into'); return true; }
        const r = await PI.api(`/api/projects/${pid}/promoted/${c.id}/send`, { scene: sx.psendscene[c.id] || undefined });
        if (r.ok) toast(r.landed?.say ? `Sent: ${r.landed.say}` : 'Sent');
        return true;
      }

      // sesh
      case 'sc-sesh-open': { e.preventDefault(); const inHistory = placeOf()[0] === 'history'; sx.sesh = inHistory && sx.sesh === ds.sesh ? null : ds.sesh; if (!inHistory) go('history', 'seshes'); else R(); return true; }
      case 'sc-sesh-filter': sx.seshFilter = ds.f; R(); return true;
      case 'sc-sesh-end': {
        const dd = state.drafts[ds.draft]; const x = dd?.sesh && state.seshes[dd.sesh]; if (!x) return true;
        await flushAll();
        let title = val(x.id, 'title', x.title);
        if (!x.titled && title === x.title) { const t = prompt('Give this sesh a name. It becomes the version’s name:', x.title); if (t === null) return true; title = t.trim() || x.title; }
        ui.menu = null;
        const r = await sapi('sesh/end', { draft: ds.draft, title });
        if (r.ok) toast(r.status === 'empty' ? 'Nothing changed, nothing to save' : `Saved as version ${r.v}`);
        return true;
      }
      case 'sc-sesh-review': sapi('sesh/review', { sesh: ds.sesh, status: ds.status }); return true;
      case 'sc-sesh-tag': {
        const x = state.seshes[ds.sesh];
        const note = prompt('What needs work?', x.note || ''); if (note === null) return true;
        const tags = prompt('Tags, if any (comma separated):', (x.tags || []).join(', ')); if (tags === null) return true;
        sapi('sesh/review', { sesh: ds.sesh, status: 'tagged', tags, note }); return true;
      }
      case 'sc-sesh-followup': { const r = await sapi('sesh/followup', { sesh: ds.sesh }); if (r.ok) { setDraft(r.draft); go('write'); toast('A new sesh is open, following up that one'); } return true; }
      case 'sc-sesh-revert': if (confirm('Put the draft back to how it was before this sesh? Later changes go too. Everything stays in the versions.')) sapi('sesh/revert', { sesh: ds.sesh }); return true;

      // scenes
      case 'sc-scene-add': {
        const title = prompt('Scene title:', 'New scene'); if (!title) return true;
        const r = await sapi('scene/add', { draft: d.id, after: ds.after === 'end' ? 'end' : ds.after || null, title });
        if (r.ok) { sx.focusScene = r.id; if (placeOf()[0] === 'write') scrollToScene(r.id); }
        return true;
      }
      case 'sc-scene-del': if (confirm('Delete this scene? It stays in the versions.')) sapi('scene/delete', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-scene-unplace': sapi('scene/unplace', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-scene-place': sapi('scene/place', { draft: d.id, scene: ds.scene, after: ds.after || null }); return true;
      case 'sc-scene-suggest': sapi('scene/suggest', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-goto-scene': {
        if (e.target.closest('input')) return true;
        e.preventDefault();
        sx.focusScene = ds.scene;
        scrollToScene(ds.scene);
        if (placeOf()[0] !== 'write') go('write'); else R();
        return true;
      }
      case 'sc-goto-shots': scrollToScene(ds.scene, 'shots'); go('shots'); return true;
      case 'sc-notes-toggle': sx.notesOpen[ds.scene] = !sx.notesOpen[ds.scene]; R(); return true;
      case 'sc-lock': await flushAll(); sx.notesOpen[ds.scene] = false; sapi('scene/lock', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-unlock': sapi('scene/unlock', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-judge-skip': sapi('scene/judge-skip', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-dismiss': { const reason = prompt('Why is it intentional? (kept in the Bible)', 'We know, it’s intentional'); if (reason === null) return true; sapi('scene/dismiss', { draft: d.id, scene: ds.scene, idx: Number(ds.idx), edit: !!ds.edit, reason }); return true; }
      case 'sc-pacing': sx.notesOpen[ds.scene] = true; sapi('scene/pacing', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-pacing-x': sapi('scene/pacing-clear', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-flash': { e.preventDefault(); const el = app.querySelector(`[data-block="${ds.block}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } return true; }
      case 'sc-breakdown': { const r = await sapi('scene/breakdown', { draft: d.id, scene: ds.scene }); if (r.ok && placeOf()[0] !== 'shots') { scrollToScene(ds.scene, 'shots'); go('shots'); } return true; }
      case 'sc-send-bs': {
        await flushAll();
        const r = await sapi('scene/send-brainstorm', { draft: d.id, scene: ds.scene, type: ds.type, blocks: ds.type === 'dialogue' && sx.sel.scene === ds.scene ? sx.sel.ids : [] });
        if (r.session) { sx.notice = { html: `A Brainstorm session is ready, loaded with the scene. <a href="#p/${esc(pid)}/brainstorm/s/${esc(r.session)}">Open it ›</a>` }; R(); }
        return true;
      }
      case 'sc-pull': { const r = await sapi('draft/pull', { from: d.id, scene: ds.scene, into: ds.into }); if (r.ok) toast(`Pulled into ${draftLabel(state.drafts[ds.into])}`); return true; }

      // lines
      case 'sc-ins': sx.insert = { scene: ds.scene, key: ds.key2 }; R(); return true;
      case 'sc-ins-close': sx.insert = null; R(); return true;
      case 'sc-block-add': { const after = ds.after === 'top' ? null : ds.after; addBlockAfter(ds.scene, after, ds.type, ds.type === 'heading' ? { intExt: 'INT.' } : undefined); return true; }
      case 'sc-slash-type': {
        sx.slash = null;
        dropPending(`block:${ds.block}`);
        app.querySelectorAll(`[data-block="${ds.block}"] [data-field]`).forEach((f) => { if (f.value === '/') f.value = ''; });
        await sapi('block/type', { draft: d.id, scene: ds.scene, block: ds.block, type: ds.type });
        for (const k of Object.keys(local)) if (k.startsWith(ds.block + ':')) delete local[k];
        sx.focusNext = { block: ds.block, type: ds.type, field: { heading: 'location', dialogue: 'character' }[ds.type] || 'text' };
        R(); return true;
      }
      case 'sc-block-del': sapi('block/delete', { draft: d.id, scene: ds.scene, block: ds.block }); return true;
      case 'sc-alt-use': sapi('alt/use', { draft: d.id, scene: ds.scene, block: ds.block }); return true;
      case 'sc-alt-remove': sapi('alt/remove', { draft: d.id, scene: ds.scene, block: ds.block }); return true;
      case 'sc-sel': {
        const sc = d.scenes[ds.scene]; if (!sc) return true;
        if (sx.sel.scene !== ds.scene) sx.sel = { scene: ds.scene, ids: [], last: null };
        if (e.shiftKey && sx.sel.last) {
          const ids = sc.blocks.map((x) => x.id); const a = ids.indexOf(sx.sel.last), z = ids.indexOf(ds.block);
          sx.sel.ids = [...new Set([...sx.sel.ids, ...ids.slice(Math.min(a, z), Math.max(a, z) + 1)])];
        } else sx.sel.ids = sx.sel.ids.includes(ds.block) ? sx.sel.ids.filter((x) => x !== ds.block) : [...sx.sel.ids, ds.block];
        sx.sel.ids = sc.blocks.map((x) => x.id).filter((id) => sx.sel.ids.includes(id));
        sx.sel.last = ds.block; sx.focusScene = ds.scene;
        if (sx.gen.open && sx.sel.ids.length) sx.gen.input = { draft: d.id, scene: sx.sel.scene, blocks: [...sx.sel.ids], refine: null };
        R(); return true;
      }
      case 'sc-sel-clear': sx.sel = { scene: null, ids: [], last: null }; R(); return true;

      // AI options
      case 'sc-gen-open-sel': openGen({ draft: d.id, scene: sx.sel.scene, blocks: [...sx.sel.ids], refine: null }); return true;
      case 'sc-gen-close': { const j = myGen(); if (j) await sapi(j.result ? 'gen/done' : 'gen/clear', { job: j.id }); sx.gen.open = false; sx.gen.input = null; sx.trying = null; sx.sel = { scene: null, ids: [], last: null }; R(); return true; }
      case 'sc-gen-ctl': sx.gen.ctl = !sx.gen.ctl; R(); return true;
      case 'sc-gen-twist': sx.gen.twist = ds.tw; R(); return true;
      case 'sc-gen-go': {
        const g = sx.gen; if (!g.input) return true;
        await flushAll();
        const cur = myGen();
        g.ctl = false;
        sapi('gen', { draft: g.input.draft, scene: g.input.scene, blocks: g.input.blocks, refine: g.input.refine, from: g.input.from || (cur?.applied ? cur.id : undefined), personality: g.personality, custom: g.custom, twist: g.twist, ask: g.ask });
        return true;
      }
      case 'sc-gen-try': {
        await flushAll();
        const r = await sapi('gen/apply', { job: ds.job, option: ds.opt === 'original' ? 'original' : Number(ds.opt), mode: 'replace' });
        if (r.ok) {
          sx.sel = { scene: null, ids: [], last: null };
          sx.trying = r.ids?.length ? r.ids : null;
          setTimeout(() => { const el = r.ids?.[0] && app.querySelector(`[data-block="${r.ids[0]}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
        }
        return true;
      }
      case 'sc-gen-alt': sapi('gen/apply', { job: ds.job, option: Number(ds.opt), mode: 'alt' }); return true;
      case 'sc-gen-done': sx.trying = null; sx.gen.input = null; sx.gen.open = false; sapi('gen/done', { job: ds.job }); R(); return true;
      case 'sc-gen-refine': { const j = job(ds.job); const o = j?.result?.options[Number(ds.opt)]; if (!o) return true; sx.gen.input = { draft: j.draft, scene: j.scene, blocks: j.applied?.ids || j.blocks, refine: o.blocks, from: j.id }; sx.gen.ctl = true; R(); return true; }

      // shots
      case 'sc-shot-add': sapi('shot/add', { draft: d.id, scene: ds.scene }); return true;
      case 'sc-shot-approve': sapi('shot/approve', { draft: d.id, scene: ds.scene, shot: ds.shot, yes: ds.yes === '1' }); return true;
      case 'sc-shot-approve-all': sapi('shot/approve', { draft: d.id, scene: ds.scene, all: true }); return true;
      case 'sc-shot-del': if (confirm('Delete this shot?')) sapi('shot/delete', { draft: d.id, scene: ds.scene, shot: ds.shot }); return true;
      case 'sc-shot-up': sapi('shot/move', { draft: d.id, scene: ds.scene, shot: ds.shot, dir: -1 }); return true;
      case 'sc-shot-down': sapi('shot/move', { draft: d.id, scene: ds.scene, shot: ds.shot, dir: 1 }); return true;
      case 'sc-shot-more': sx.shotMore[ds.shot] = !sx.shotMore[ds.shot]; R(); return true;
      case 'sc-cover-edit': sx.coverEdit = ds.shot || null; R(); return true;
      case 'sc-cover-tick': {
        const sc = d.scenes[ds.scene]; const s = sc.shots.find((x) => x.id === ds.shot);
        const set = new Set(s.blocks); if (b.checked) set.add(ds.block); else set.delete(ds.block);
        sapi('shot/update', { draft: d.id, scene: ds.scene, shot: ds.shot, patch: { blocks: sc.blocks.map((x) => x.id).filter((id) => set.has(id)) } });
        return true;
      }

      // drafts & versions
      case 'sc-open-draft': setDraft(ds.draft); go(ds.to || (sx.lastScript === 'home' ? 'write' : sx.lastScript)); return true;
      case 'sc-draft-versions': sx.draftOpen[ds.draft] = !sx.draftOpen[ds.draft]; R(); return true;
      case 'sc-fork': { const name = prompt('Name your draft:', `${me}’s draft`); if (!name) return true; const r = await sapi('draft/fork', { from: ds.draft, v: ds.v ? Number(ds.v) : null, name }); if (r.ok) { setDraft(r.id); sx.viewVersion = null; go('write'); toast('You are in your own draft now'); } return true; }
      case 'sc-make-main': {
        const sum = await getJSON(`promo?draft=${encodeURIComponent(ds.draft)}`);
        const lines = [`Make “${state.drafts[ds.draft].name}” the Main draft?`, '',
          sum.changed.length ? `Changed: ${sum.changed.join(', ')}` : '', sum.added.length ? `New: ${sum.added.join(', ')}` : '', sum.dropped.length ? `Dropped: ${sum.dropped.join(', ')}` : '',
          !sum.changed.length && !sum.added.length && !sum.dropped.length ? 'The script is the same.' : '', 'The old Main stays in History.'].filter((l, i) => l || i === 1);
        if (confirm(lines.join('\n'))) sapi('draft/make-main', { draft: ds.draft });
        return true;
      }
      case 'sc-cmp-main': sx.compare.a = `${state.mainId}:`; sx.compare.b = `${ds.draft}:`; go('history', 'compare'); runCompare(); return true;
      case 'sc-view-version': {
        const k = { draft: ds.draft, v: Number(ds.v), data: null };
        if (sx.viewVersion?.draft === k.draft && sx.viewVersion?.v === k.v) { sx.viewVersion = null; R(); return true; }
        sx.viewVersion = k; R();
        k.data = await getJSON(`version?draft=${encodeURIComponent(k.draft)}&v=${k.v}`); R(); return true;
      }
      case 'sc-close-version': sx.viewVersion = null; R(); return true;
      case 'sc-restore': if (confirm(`Restore version ${ds.v}? Your open sesh is saved first, so nothing is lost.`)) { await sapi('draft/restore', { draft: ds.draft, v: Number(ds.v) }); sx.viewVersion = null; R(); } return true;
      case 'sc-cmp-go': runCompare(); return true;
      case 'sc-cmp-now': sx.compare.a = `${ds.draft}:${ds.v}`; sx.compare.b = `${ds.draft}:`; go('history', 'compare'); runCompare(); return true;

      // bible
      case 'sc-import': sapi('import', { card: ds.card }); return true;
      case 'sc-import-logline': { const r = await sapi('import', { card: ds.card, logline: true, again: true }); if (r.ok) toast('Logline updated'); return true; }
      case 'sc-fact-edit': sx.factEdit = ds.id; sx.factMove = null; sx.focusSel = `[data-factedit="${ds.id}"]`; R(); return true;
      case 'sc-fact-new': sx.factNew = ds.scene; sx.focusSel = `[data-factnew="${ds.scene}"]`; R(); return true;
      case 'sc-fact-move': sx.factMove = sx.factMove === ds.id ? null : ds.id; R(); return true;
      case 'sc-fact-review': sx.factReview = !sx.factReview; R(); return true;
      case 'sc-fact-del': sapi('fact/delete', { id: ds.id }); return true;
      case 'sc-fact-ok': sapi('fact/confirm', { id: ds.id }); return true;
    }
    return true;
  }

  function onInput(e) {
    if (!inScript()) return false;
    const t = e.target;
    if (t.tagName === 'TEXTAREA') autosize(t);
    if (t.dataset.field) {
      const c = blockCtx(t);
      if (t.value === '/' && t.dataset.field !== 'paren') { sx.slash = c.block; queueEdit('block', c, t.dataset.field, '/', 50); R(); return true; }
      if (sx.slash === c.block) { sx.slash = null; R(); }
      queueEdit('block', c, t.dataset.field, t.value); return true;
    }
    if (t.dataset.stitle) { queueEdit('title', { draft: D().id, scene: t.dataset.stitle }, 'title', t.value, 500); return true; }
    if (t.dataset.pfield) { queueEdit('project', {}, t.dataset.pfield, t.value, 500); return true; }
    if (t.dataset.seshtitle) { queueEdit('sesh', { sesh: t.dataset.seshtitle }, 'title', t.value, 600); return true; }
    if (t.dataset.shotf) { queueEdit('shot', { draft: D().id, scene: t.dataset.scene, shot: t.dataset.shot }, t.dataset.shotf, t.value, 400); return true; }
    if (t.dataset.genfield) { sx.gen[t.dataset.genfield] = t.value; return true; }
    if (t.dataset.ndname) { sx.ndName = t.value; return true; }
    if (t.dataset.factedit) { local[`${t.dataset.factedit}:fact`] = t.value; return true; }
    return false;
  }

  function onKey(e) {
    if (!inScript()) return false;
    const t = e.target;
    if (e.key === 'Escape') {
      if (t.dataset.factedit) { delete local[`${t.dataset.factedit}:fact`]; sx.factEdit = null; R(); return true; }
      if (t.dataset.factnew) { sx.factNew = null; R(); return true; }
      if (t.dataset.dname && sx.renaming) { t.value = state.drafts[t.dataset.dname]?.name || t.value; sx.renaming = null; R(); return true; }
      if (t.dataset.ndname) { sx.newDraft = false; R(); return true; }
      if (sx.slash || sx.insert) { sx.slash = null; sx.insert = null; R(); return true; }
      if (sx.keys) { sx.keys = false; R(); return true; }
      return false;
    }
    if (e.isComposing) return false;
    if (e.key === 'Enter' && t.dataset.factedit) { e.preventDefault(); saveFact(t); return true; }
    if (e.key === 'Enter' && t.dataset.factnew) { e.preventDefault(); saveNewFact(t); return true; }
    if (e.key === 'Enter' && t.dataset.seshtitle) { e.preventDefault(); flush(`sesh:${t.dataset.seshtitle}`); t.blur(); return true; }
    if (e.key === 'Enter' && (t.dataset.stitle || t.dataset.dname)) { e.preventDefault(); t.blur(); return true; }
    if (t.dataset.addchar && e.key === 'Enter') { e.preventDefault(); const v = t.value.trim(); if (v) { t.value = ''; sapi('character/add', { name: v }); } return true; }
    if (!t.dataset.field) return false;
    const c = blockCtx(t);
    const d = D(); const sc = d.scenes[c.scene]; if (!sc) return false;
    const blk = sc.blocks.find((x) => x.id === c.block); if (!blk) return false;
    const field = t.dataset.field;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { // new line below (a dialogue gets the other speaker)
      e.preventDefault(); flushAll();
      const next = { heading: 'action', action: 'action', dialogue: 'dialogue', transition: 'heading', note: 'action' }[blk.type];
      const who = next === 'dialogue' ? nextSpeaker(sc, blk.id) : '';
      addBlockAfter(sc.id, blk.id, next, next === 'heading' ? { intExt: 'INT.' } : who ? { character: who } : undefined);
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) { // Enter = done with this line; Shift+Enter = a line break
      e.preventDefault();
      const el = t.closest('.blk');
      const need = blk.type === 'dialogue' && field !== 'line' ? 'line' : blk.type === 'heading' && field === 'intExt' ? 'location' : null;
      const target = need && el.querySelector(`[data-field="${need}"]`);
      if (target && !target.value.trim()) { target.focus(); return true; }
      flush(`block:${blk.id}`).then(() => {
        t.blur();
        el.classList.remove('done'); void el.offsetWidth; el.classList.add('done');
        setTimeout(() => el.classList.remove('done'), 900);
      });
      return true;
    }
    if (e.key === 'Backspace') {
      const fields = [...t.closest('.blk').querySelectorAll('[data-field]')].filter((f) => f.tagName !== 'SELECT');
      if (fields.every((f) => !f.value)) {
        e.preventDefault();
        const i = sc.blocks.indexOf(blk); const prev = sc.blocks[i - 1];
        dropPending(`block:${blk.id}`);
        sapi('block/delete', { draft: d.id, scene: sc.id, block: blk.id }).then(() => {
          if (prev) { sx.focusNext = { block: prev.id, field: { heading: 'time', action: 'text', dialogue: 'line', transition: 'text', note: 'text' }[prev.type] }; R(); }
        });
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- listeners the shell doesn't route
  app.addEventListener('change', async (e) => {
    if (PI.route().section !== 'script') return;
    const t = e.target;
    if (t.dataset.psendscene) { sx.psendscene[t.dataset.psendscene] = t.value; return; }
    if (!inScript()) return;
    const act = t.dataset.act;
    if (act === 'sc-gen-pers') { sx.gen.personality = t.value; return R(); }
    if (act === 'sc-cmp-pick') { sx.compare[t.dataset.side] = t.value; sx.compare.data = null; return R(); }
    if (act === 'sc-pull-v' && t.value) { const into = t.value; t.value = ''; const r = await sapi('draft/pull', { from: t.dataset.from, v: Number(t.dataset.v), scene: t.dataset.scene, into }); if (r.ok) toast(`Pulled into ${draftLabel(state.drafts[into])}`); return; }
    if (act === 'sc-import-dlg' && t.value) { const scene = t.value; t.value = ''; const r = await sapi('import', { card: t.dataset.card, scene, again: true }); if (r.ok) toast('Lines added'); return; }
    if (act === 'sc-cover-tick') return;
    if (t.dataset.field && t.tagName === 'SELECT') { const c = blockCtx(t); queueEdit('block', c, t.dataset.field, t.value, 0); }
    if (t.dataset.dname) sapi('draft/rename', { draft: t.dataset.dname, name: t.value });
    if (t.dataset.factmove) { const f = state.facts.find((x) => x.id === t.dataset.factmove); sx.factMove = null; sapi('fact/edit', { id: f.id, fact: f.fact, scene: t.value || null }); R(); }
  });

  // presence, and saving on leaving a field
  let presTimer = null; let lastPres = '';
  app.addEventListener('focusin', (e) => {
    if (!inScript()) return;
    const t = e.target;
    const blk = t.closest?.('[data-block]');
    const scn = t.closest?.('section[data-scene]');
    if (!scn) return;
    clearTimeout(presTimer);
    const key = `${D().id}|${scn.dataset.scene}|${blk?.dataset.block || ''}`;
    if (scn.dataset.scene !== sx.focusScene && placeOf()[0] === 'write') { sx.focusScene = scn.dataset.scene; setTimeout(R, 0); }
    if (key !== lastPres) { lastPres = key; sapi('presence', { draft: D().id, scene: scn.dataset.scene, block: blk?.dataset.block || null }); }
  });
  app.addEventListener('focusout', (e) => {
    if (!state?.started) return;
    const t = e.target;
    if (t.dataset?.field) { const c = blockCtx(t); flush(`block:${c.block}`); }
    if (t.dataset?.stitle) flush(`title:${t.dataset.stitle}`);
    if (t.dataset?.shotf) flush(`shot:${t.dataset.shot}`);
    if (t.dataset?.pfield) flush('project:project');
    if (t.dataset?.seshtitle) flush(`sesh:${t.dataset.seshtitle}`);
    if (t.dataset?.factedit && sx.factEdit === t.dataset.factedit) saveFact(t);
    if (t.dataset?.factnew && sx.factNew === t.dataset.factnew) saveNewFact(t);
    if (t.dataset?.dname && sx.renaming === t.dataset.dname) { sx.renaming = null; setTimeout(R, 0); } // its change event already saved it
    clearTimeout(presTimer);
    const p0 = pid;
    presTimer = setTimeout(() => { lastPres = ''; if (inScript() && pid === p0) sapi('presence', { draft: D().id }); }, 1500);
  });

  // drag & drop: lines within and between scenes, scenes in the outline and on the Board, lines onto the AI panel
  let drag = null;
  app.addEventListener('dragstart', (e) => {
    if (!inScript()) return;
    const el = e.target.closest?.('[data-drag]');
    if (!el) return;
    sx.dragging = true;
    if (el.dataset.drag === 'blocks') {
      const sid = el.dataset.scene, bid = el.dataset.block;
      drag = { kind: 'blocks', scene: sid, ids: sx.sel.scene === sid && sx.sel.ids.includes(bid) ? sx.sel.ids : [bid] };
      app.classList.add('dragging', 'dragging-lines');
    } else { drag = { kind: 'scene', scene: el.dataset.scene }; app.classList.add('dragging', 'dragging-scenes'); }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(drag));
  });
  app.addEventListener('dragend', () => {
    if (!drag && !sx.dragging) return;
    drag = null; sx.dragging = false;
    app.classList.remove('dragging', 'dragging-lines', 'dragging-scenes');
    app.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
    if (sx.pendingRender) { sx.pendingRender = false; R(); }
  });
  function dropSpot(e) {
    if (!drag) return null;
    if (drag.kind === 'blocks') {
      const g = e.target.closest('[data-drop="gen"]');
      if (g) return { el: g, type: 'gen' };
      const b = e.target.closest('.spage .blk[data-block]');
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
    if (s.type === 'gen') { sx.dragging = false; openGen({ draft: d.id, scene: dr.scene, blocks: d.scenes[dr.scene].blocks.map((x) => x.id).filter((id) => dr.ids.includes(id)), refine: null }); return; }
    if (s.type === 'line') {
      await flushAll();
      const dst = d.scenes[s.scene];
      const rest = dst.blocks.filter((x) => !dr.ids.includes(x.id));
      const i = rest.findIndex((x) => x.id === s.target);
      const after = s.before ? (i > 0 ? rest[i - 1].id : null) : s.target;
      sapi('block/reorder', { draft: d.id, scene: dr.scene, toScene: s.scene !== dr.scene ? s.scene : undefined, ids: dr.ids, after });
      return;
    }
    const isFloat = d.floating.includes(dr.scene);
    if (s.type === 'tray') { if (!isFloat) sapi('scene/unplace', { draft: d.id, scene: dr.scene }); return; }
    let after;
    if (s.type === 'order') after = d.order.filter((x) => x !== dr.scene).at(-1) || null;
    else {
      if (d.floating.includes(s.target)) return;
      const o = d.order.filter((x) => x !== dr.scene);
      const i = o.indexOf(s.target);
      after = s.before ? (i > 0 ? o[i - 1] : null) : s.target;
    }
    sapi(isFloat ? 'scene/place' : 'scene/move', { draft: d.id, scene: dr.scene, after });
  });

  PI.sections.script = { chrome, body, post, onClick, onKey, onInput, onState };
})();
