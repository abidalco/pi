// Brainstorm — the section. Draws inside the shell (app.js): the pill stays, the centre of the top bar shows the
// stages, the right side the bot's voice and who's in the room. The chat reads like a page; the cards sit beside it.
(() => {
  const { esc, md, ic, plural, ago, toast, api, menu, mi, menuBtn, ui, TYPE } = window.PI;
  const bui = { open: {}, popen: {}, pv: {}, pfilter: 'all', psendscene: {}, drafts: {}, newCard: null, newCardText: '', fold: {}, chatCount: {}, offlineOpen: false, histOpen: null, seedShown: {}, newType: 'idea', topic: '', seed: '', seedOpen: false, custom: '' };
  const tpl = (C, s) => C.templates[s.type];
  const majority = (s) => Math.floor(s.participants.length / 2) + 1;
  const persName = (C, s) => (s.personality.key === 'custom' ? s.personality.custom || 'Custom' : C.personalities[s.personality.key].name);
  const MINI_ICON = { flip: 'refresh', yesand: 'plus', worst: 'skull', wildcard: 'dice' };
  const base = (ctx) => `#p/${esc(ctx.pid)}/brainstorm`;
  const sessionOf = (ctx) => ctx.B?.session || null;
  const onBoard = (ctx) => /\/board$/.test(ctx.r.sub || '');
  // the one-gesture vote, as the client sees it (mirrors readiness() on the server)
  const thumbsOf = (s, id) => s.thumbs?.[id] || [];
  const readiness = (s, id) => { const n = thumbsOf(s, id).length, need = majority(s); if (n >= need) return { state: 'ready', n, need }; if (s.winner === id) return { state: 'ready', n, need, picked: true }; return { state: 'open', n, need }; };
  const judgeMark = (s, c) => { const v = s.verdicts[c.id]; if (!v) return c.status === 'candidate' ? '<span class="vm wait" title="the Judge is checking it">…</span>' : ''; return v.verdict === 'ok' ? `<span class="vm ok" title="${esc(v.note || 'consistent')}">${ic('check', 's')}</span>` : v.verdict === 'warn' ? `<span class="vm warn" title="${esc(v.note)}">?</span>` : `<span class="vm bad" title="${esc(v.note)}">${ic('x', 's')}</span>`; };
  const sapi = (ctx, sid, act, data) => api(`/api/projects/${ctx.pid}/session/${sid}/${act}`, data);
  const initials = (n) => esc(String(n).slice(0, 1).toUpperCase());
  // a session sent from a scene in the script: the way back, and where its promotion will go
  const originLine = (ctx, s) => {
    const o = s.origin;
    if (o?.section !== 'script') return '';
    const where = o.gone ? 'a scene that’s no longer in the script' : `${o.num ? `sc. ${o.num} ` : ''}${esc(o.title)}${o.draftName && o.draftName !== 'Main' ? ` <span class="muted">(${esc(o.draftName)})</span>` : ''}`;
    return `<div class="origin" data-key="origin">${ic('script', 's')}<span>From the script: ${o.gone ? where : `<a href="#p/${esc(ctx.pid)}/script/write/${esc(o.draft)}:${esc(o.scene)}">${where}</a>`}</span><span class="muted">· ${s.type === 'scene' || s.type === 'dialogue' ? 'what’s promoted here goes back into that scene' : 'it started from that scene'}</span></div>`;
  };

  // ---------------------------------------------------------------- chrome: what the top bar shows for this section
  function chrome(ctx) {
    const { r, B, C } = ctx;
    if (!B) return { title: 'Brainstorm' };
    const s = sessionOf(ctx);
    if (r.session && s) {
      const live = s.status === 'live';
      const board = onBoard(ctx);
      const cands = ctx.B.cards.filter((c) => c.status === 'candidate').length;
      const roomBtn = `<a class="icon roombtn ${board ? 'on' : ''}" href="${base(ctx)}/s/${esc(s.id)}${board ? '' : '/board'}" title="${board ? 'back to the chat' : 'the Board: the cards, the Judge’s marks, the votes'}" data-key="boardbtn">${ic('columns')}${cands && !board ? `<span class="rbadge">${cands}</span>` : ''}</a>`;
      const right = `${s.botBusy ? '<span class="aistat" data-key="aistat">thinking…</span>' : ''}${live && !board ? voicePill(ctx, s) : ''}${roomBtn}`;
      const people = `<span class="people" data-key="people">${s.participants.map((n) => { const st = s.round ? (s.round.answers[n] ? 'ok' : 'wait') : ''; return `<span class="av ${n === ctx.me ? 'me' : ''} ${st}" title="${esc(n)}${n === ctx.me ? ' (you)' : ''}${st === 'wait' ? ' · still to answer' : st === 'ok' ? ' · answered' : ''}">${initials(n)}</span>`; }).join('')}</span>${live && !s.participants.includes(ctx.me) ? '<button class="small" data-act="bs-join">Join</button>' : ''}`;
      const more = [];
      if (live && s.phase === 'play') more.push('<div class="msep"></div>', mi('bs-wrap', 'lock', 'Wrap up the session…'));
      if (live && s.phase === 'wrapping') more.push('<div class="mnote">Wrapping up: the bot is writing the recap</div>');
      return { title: board ? `${s.topic} · Board` : s.topic, left: board ? `<a class="back" href="${base(ctx)}/s/${esc(s.id)}" data-key="back" title="back to the chat">${ic('back', 's')}<span class="bl">Chat</span></a>` : '', center: stageSegs(ctx, s), right, people, more, viewClass: s.status === 'lobby' || board ? '' : 'view-session', viewKey: `s-${s.id}-${board ? 'board' : s.status === 'lobby' ? 'lobby' : 'live'}` };
    }
    const sub0 = (r.sub || '').split('/')[0]; // promoted/<card> opens that card
    const tab = (k, label) => `<a href="${base(ctx)}${k ? `/${k}` : ''}" class="seg ${sub0 === k ? 'on' : ''}">${label}</a>`;
    const past = B.sessions.filter((x) => x.status === 'closed').length;
    const toSend = (B.promoted || []).filter((c) => !c.landed).length;
    return { title: sub0 === 'promoted' ? 'Promoted' : 'Brainstorm', center: `${tab('', 'Sessions')}${tab('promoted', `Promoted${toSend ? ` <span class="badge" title="${plural(toSend, 'card')} to send">${toSend}</span>` : ''}`)}${tab('history', `History${past ? ` <span class="badge">${past}</span>` : ''}`)}`, viewKey: sub0 || 'home' };
  }

  function stageSegs(ctx, s) {
    const t = tpl(ctx.C, s);
    const lobby = s.status === 'lobby', closed = s.status === 'closed';
    return t.stages.map((st, i) => {
      const cls = `${lobby ? 'dim' : i === s.stage ? 'on' : i < s.stage ? 'done' : 'todo'}${closed ? ' frozen' : ''}`;
      const can = !lobby && !closed && i !== s.stage;
      return `<button class="seg ${cls}" data-act="${can ? 'bs-stage-to' : 'noop'}" data-to="${i}" title="${esc(st.name)} · ${esc(st.goal)}${can ? (i > s.stage ? ' · click to move on' : ' · click to go back') : ''}"><span class="sn">${esc(st.name)}</span><span class="sni">${i + 1}</span></button>`;
    }).join('');
  }

  function voicePill(ctx, s) {
    const items = ['<div class="mlabel">The bot’s voice</div>',
      ...Object.values(ctx.C.personalities).map((p) => mi('bs-voice', '', `<span>${esc(p.name)}${s.personality.key === p.key ? ' <span class="msub">· now</span>' : ''}</span><span class="msub">${esc(p.vibe)}</span>`, { key: p.key }, `v ${s.personality.key === p.key ? 'cur' : ''}`))];
    return `<div class="menuwrap" data-key="voice"><button class="voicebtn ${ui.menu === 'voice' ? 'on' : ''}" data-act="menu" data-menu="voice" title="the bot’s voice · click to switch">${ic('mic', 's')}<span class="vn">${esc(persName(ctx.C, s))}</span>${ic('chevron', 'chev')}</button>${menu('voice', items, 'right voice')}</div>`;
  }

  // ---------------------------------------------------------------- body
  function body(ctx) {
    const { r, B } = ctx;
    if (!B) return '<div class="loading">…</div>';
    if (r.session) { const s = sessionOf(ctx); if (!s) return `<main class="room"><div class="empty">No such session. <a href="${base(ctx)}">Back to the sessions ›</a></div></main>`; return onBoard(ctx) ? boardView(ctx, s) : s.status === 'lobby' ? lobbyView(ctx, s) : sessionView(ctx, s); }
    if (r.sub === 'history') return historyView(ctx);
    const [sub0, cid] = (r.sub || '').split('/');
    if (sub0 === 'promoted') {
      if (cid && bui.pjump !== cid) { bui.pjump = cid; bui.popen[cid] = true; bui.pfilter = 'all'; bui.pscroll = cid; } // from the Script: “Edit in Brainstorm”
      return promotedView(ctx);
    }
    return homeView(ctx);
  }

  function homeView(ctx) {
    const { B, C } = ctx;
    const t = C.templates[bui.newType];
    const live = B.sessions.filter((s) => s.status !== 'closed');
    return `<main class="bhome" data-key="bhome">
      <section class="newsesh" data-key="new">
        <nav class="segs">${Object.values(C.templates).map((x) => `<button class="seg ${x.key === bui.newType ? 'on' : ''}" data-act="bs-type" data-type="${x.key}" title="${esc(x.blurb)}">${ic(TYPE[x.key], 's')}${esc(x.name)}</button>`).join('')}</nav>
        <div class="blurb">${esc(t.blurb)} ${t.stages.map((st) => esc(st.name)).join(' → ')} → <b>${esc(t.promotesTo)}</b></div>
        <form class="topicrow" data-act="bs-create"><input data-key="topic" data-bui="topic" placeholder="What are we brainstorming? A title or a few words" value="${esc(bui.topic)}" maxlength="120" autocomplete="off"><button class="primary">Create</button></form>
        <button class="link seedtoggle" data-act="bs-seed-toggle">${ic('chevron', 's')} paste what you already have${!bui.seedOpen && bui.seed ? ' <span class="tag">added</span>' : ''}</button>
        ${bui.seedOpen ? `<textarea class="seedbox auto" data-key="seed" data-bui="seed" rows="4" placeholder="A synopsis, a logline, notes, half a scene… the bot starts from it instead of from zero.">${esc(bui.seed)}</textarea>` : ''}
      </section>
      <div class="lbl">${ic('pulse')}<span>Live now</span></div>
      <div class="rows">${live.length ? live.map((s) => { const st = tpl(C, s).stages[s.stage]; return `<a class="row" href="${base(ctx)}/s/${esc(s.id)}" data-key="sr-${s.id}">${ic(TYPE[s.type] || 'tag')}<span class="tt"><b>${esc(s.topic)}</b><span class="muted small">${esc(tpl(C, s).name)} · ${s.participants.map(esc).join(', ') || esc(s.createdBy)}${s.origin?.title ? ` · from sc. ${s.origin.num ?? '–'} ${esc(s.origin.title)}` : ''}${s.status === 'live' ? ` · ${esc(st.name)} · ${plural(s.cards, 'card')}` : ''}${s.botBusy ? ' · the bot is thinking' : ''}</span></span><span class="live ${s.status === 'live' ? 'on' : ''}"><span class="dot ${s.status === 'live' ? '' : 'off'}"></span>${s.status === 'lobby' ? 'lobby' : 'live'}</span></a>`; }).join('') : '<div class="quiet">Nothing live right now.</div>'}</div>
      ${B.botOnline ? '' : '<div class="attn static" style="margin-top:18px"><span class="info">The bot is off · sessions still work, it answers when it’s started (<code>npm run bot</code>)</span></div>'}
    </main>`;
  }

  function lobbyView(ctx, s) {
    const { C } = ctx;
    const joined = s.participants.includes(ctx.me);
    return `<main class="lobbyview" data-key="lobby-${s.id}">
      ${originLine(ctx, s)}
      <div><div class="lbl">${ic('users')}<span>Who’s here</span></div>
        <div class="chips big">${s.participants.map((p) => `<span class="chip ${p === ctx.me ? 'me' : ''}">${esc(p)}</span>`).join('')}${joined ? '' : '<button class="chip" data-act="bs-join">+ Join</button>'}</div></div>
      <div><div class="lbl">${ic('mic')}<span>The bot’s voice</span></div>
        <div class="chips">${Object.values(C.personalities).map((p) => `<button class="chip ${s.personality.key === p.key ? 'on' : ''}" data-act="bs-voice" data-key2="${p.key}" title="${esc(p.vibe)} · good for ${esc(p.goodFor).toLowerCase()}">${esc(p.name)}</button>`).join('')}</div>
        ${s.personality.key === 'custom' ? `<input class="custominput" data-key="custom" data-bui="custom" data-act-enter="bs-voice-custom" placeholder="describe the bot in one line, Enter" value="${esc(s.personality.custom || bui.custom)}" maxlength="300">` : ''}</div>
      <div>
        <button class="primary startbtn" data-act="bs-start">Start</button>
        ${ctx.B.botOnline ? '' : '<div class="attn static" style="padding-left:2px;margin-top:6px"><span class="info">The bot is off · it joins the moment it’s started</span></div>'}
      </div>
      ${s.seed ? `<div style="width:100%"><button class="link seedline" data-act="bs-seed-show" data-id="${s.id}">${ic('chevron', 's')} starting from what ${esc(s.createdBy)} pasted</button>${bui.seedShown[s.id] ? `<div class="seedpre">${esc(s.seed)}</div>` : ''}</div>` : ''}
    </main>`;
  }

  function sessionView(ctx, s) {
    return `<div class="sesh" data-key="sesh-${s.id}">
      <aside class="cardcol" data-key="cardcol">${cardsColumn(ctx, s)}</aside>
      <main class="chatcol" data-key="chatcol">
        ${originLine(ctx, s) ? `<div class="originwrap" data-key="originwrap">${originLine(ctx, s)}</div>` : ''}
        ${s.status === 'closed' ? `<div class="closedline" data-key="closedline"><div class="attn static">${ic('lock', 's')}<span class="info">Wrapped up${s.closedAt ? ` on ${new Date(s.closedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''} · read-only now. The cards still open to read${s.recap ? '; the recap is at the bottom' : ''}.</span>${s.recap ? '<span class="grow"></span><button class="link" data-act="bs-to-recap">Recap ↓</button>' : ''}</div></div>` : ''}
        ${s.status === 'live' && !ctx.B.botOnline ? offlineLine() : ''}
        <div class="chat" data-key="chat"><div class="chatin" data-key="chatin">${chatHtml(ctx, s)}</div></div>
        ${s.status === 'live' ? composer(ctx, s) : ''}
      </main>
    </div>`;
  }

  function offlineLine() {
    return `<div class="offline" data-key="offline"><button class="attn" data-act="bs-offline-toggle"><span class="info">The bot is off · what you say waits for it</span><span class="chev">${bui.offlineOpen ? '▴' : '▾'}</span></button>
      ${bui.offlineOpen ? '<div class="notes"><div class="nrow">In a second terminal, in <code>pi-production/</code>: <code>npm run bot</code> (a Claude Code session plays the bot) or <code>npm run auto</code> (headless).</div><div class="nrow muted">Nothing is lost: it answers everything that queued, in order.</div></div>' : ''}</div>`;
  }

  function chatHtml(ctx, s) {
    const { B, C } = ctx;
    const msgs = B.messages;
    const closed = s.status === 'closed';
    const r = s.round;
    const iAnswered = !!(r && r.answers[ctx.me]);
    const lastBotIdx = msgs.map((m) => m.kind).lastIndexOf('bot');
    let prevAuthor = null;
    const out = msgs.map((m, i) => {
      if (m.kind === 'system') { prevAuthor = null; return `<div class="m m-sys" data-key="m-${m.id}">${md(m.text)}</div>`; }
      const first = m.author !== prevAuthor;
      prevAuthor = m.author;
      if (m.kind === 'bot') {
        const isQuestion = r && m.id === r.questionMsg;
        const picksLive = !closed && m.picks?.length && (isQuestion ? !iAnswered : (!r && i === lastBotIdx && i === msgs.length - 1));
        const picks = !m.picks?.length ? '' : picksLive
          ? `<div class="picks">${m.picks.map((p) => `<button class="pick" data-act="bs-pick" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>`
          : `<div class="offered">offered${m.picks.map((p) => `<i>·</i>${esc(p)}`).join('')}</div>`;
        return `<div class="m m-bot ${first ? 'first' : ''}" data-key="m-${m.id}">${first ? `<div class="mw">${esc(persName(C, s))}</div>` : ''}<div class="mt">${md(m.text)}</div>${picks}</div>`;
      }
      if (m.hidden && m.author !== ctx.me) return `<div class="m m-user hidden ${first ? 'first' : ''}" data-key="m-${m.id}">${first ? `<div class="mw">${esc(m.author)}</div>` : ''}<div class="mt">answered</div></div>`;
      return `<div class="m m-user ${m.author === ctx.me ? 'me' : ''} ${first ? 'first' : ''}" data-key="m-${m.id}">${first ? `<div class="mw">${esc(m.author)}${m.author === ctx.me ? ' · you' : ''}</div>` : ''}<div class="mt">${md(m.text)}${m.hidden ? ' <span class="lock">hidden until everyone’s in</span>' : ''}</div></div>`;
    });
    if (s.botBusy) out.push(`<div class="m m-bot thinking first" data-key="m-thinking"><div class="mw">${esc(persName(C, s))}</div><div class="mt">thinking…</div></div>`);
    if (s.recap) out.push(`<div class="recap" data-key="recap"><div class="rh">Recap</div>${md(s.recap)}</div>`);
    if (!msgs.length) out.push('<div class="empty center" data-key="m-empty">Nothing said yet.</div>');
    return out.join('');
  }

  function composer(ctx, s) {
    const { C } = ctx;
    const r = s.round;
    const iAnswered = !!(r && r.answers[ctx.me]);
    const missing = r ? s.participants.filter((p) => !r.answers[p]) : [];
    const placeholder = r ? (iAnswered ? 'you answered — add more, or wait' : r.blind ? 'your answer · hidden until everyone’s in' : 'your answer')
      : s.phase === 'wrapping' ? 'the bot is writing the recap…' : 'say something, or drop a few words…';
    const roundLine = !r ? '' : `<div class="attn static roundline" data-key="round"><span class="info">${r.blind ? 'Blind round' : 'Round'}</span><i>·</i>
      ${s.participants.map((p) => `<span class="who ${r.answers[p] ? 'ok' : ''} ${p === ctx.me ? 'me' : ''}">${esc(p)} ${r.answers[p] ? '✓' : '…'}</span>`).join('<i>·</i>')}
      ${missing.length && iAnswered ? `<span class="grow"></span><button class="link" data-act="bs-round-close">go without ${missing.length === 1 ? esc(missing[0]) : 'them'}</button>` : ''}</div>`;
    // the one mini-round that isn't on a card: a labelled button, called in one click (Flip it, Yes and, Worst idea are on each card's ⋯)
    const wild = Object.values(C.miniRounds).find((x) => x.target === 'session');
    return `<div class="composer" data-key="composer"><div class="cin">${roundLine}
      <div class="crow">
        ${s.phase === 'play' && wild ? `<button class="wildbtn" data-act="bs-mini" data-round="${wild.key}" title="${esc(wild.name)}: the bot throws in one unrelated thing (an object, a place, a genre) and asks how the story swallows it. Flip it, Yes and, Worst idea are on each card’s ⋯">${ic(MINI_ICON[wild.key], 's')}<span>${esc(wild.name)}</span></button>` : ''}
        <textarea class="auto" rows="1" data-key="input" data-composer="${s.id}" placeholder="${placeholder}" maxlength="4000">${esc(bui.drafts[s.id] || '')}</textarea>
        <button class="icon send" data-act="bs-send" title="send (Enter)">${ic('send')}</button>
      </div></div></div>`;
  }

  // ---------------------------------------------------------------- cards
  function tree(section, all) {
    const inSection = new Set(section.map((c) => c.id));
    const kids = (id) => all.filter((c) => c.parent === id && inSection.has(c.id)).sort((a, b) => a.ts - b.ts);
    const out = [];
    const walk = (c, under) => { out.push({ c, under }); for (const k of kids(c.id)) walk(k, true); };
    for (const c of section) if (!c.parent || !inSection.has(c.parent)) walk(c, false);
    return out;
  }
  function cardsColumn(ctx, s) {
    const cards = ctx.B.cards;
    const closed = s.status === 'closed';
    const promoted = cards.filter((c) => c.status === 'promoted');
    const active = cards.filter((c) => c.status === 'active' || c.status === 'candidate');
    const parked = cards.filter((c) => c.status === 'parked');
    const discarded = cards.filter((c) => c.status === 'discarded');
    const f = bui.fold[s.id] || {};
    const total = cards.length - discarded.length;
    const list = (sec) => tree(sec, cards).map(({ c, under }) => kard(ctx, s, c, under)).join('');
    return `${strip(ctx, s)}
      <div class="khead" data-key="khead"><span class="mlabel">${plural(total, 'card')}</span>${total ? `<button class="link small" data-act="bs-cards-fold">${cards.some((c) => bui.open[c.id]) ? 'fold all' : 'open all'}</button>` : ''}<span class="grow"></span>${closed || s.phase === 'wrapping' ? '' : `<button class="icon ${bui.newCard === s.id ? 'on' : ''}" data-act="bs-card-new" title="add a card">${ic('plus')}</button>`}</div>
      ${bui.newCard === s.id && !closed && s.phase !== 'wrapping' ? `<div class="kadd" data-key="kadd"><input data-key="newcard" data-newcard="${s.id}" placeholder="a card in your own words · Enter" maxlength="120" value="${esc(bui.newCardText)}"><button class="ghost small" data-act="bs-card-new-x">×</button></div>` : ''}
      ${list(promoted)}
      ${active.length ? list(active) : total ? '' : '<div class="empty small" data-key="k-empty">Everything the room says lands here as a card.</div>'}
      ${parked.length ? `<div class="fold" data-key="fold-parked"><button class="link" data-act="bs-fold" data-sec="parked">Parked · ${parked.length} ${f.parked ? '▾' : '›'}</button>${f.parked ? list(parked) : ''}</div>` : ''}
      ${discarded.length ? `<div class="fold" data-key="fold-discarded"><button class="link" data-act="bs-fold" data-sec="discarded">Discarded · ${discarded.length} ${f.discarded ? '▾' : '›'}</button>${f.discarded ? list(discarded) : ''}</div>` : ''}`;
  }

  function strip(ctx, s) {
    if (s.phase === 'wrapping') return '<div class="strip" data-key="strip"><div class="shd"><span class="st">Wrapping up</span><span class="muted">· the bot is writing the recap</span></div></div>';
    return '';
  }

  function fieldsHtml(c) {
    const entries = Object.entries(c.fields || {}).filter(([, v]) => v !== '' && v != null);
    if (!entries.length) return '';
    return `<dl>${entries.map(([k, v]) => `<dt>${esc(k).replace(/_/g, ' ')}</dt><dd>${md(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))}</dd>`).join('')}</dl>`;
  }

  function landedLine(ctx, c) {
    const l = c.status === 'promoted' && ctx.B.landings?.[c.id];
    return l ? window.PI.landedLink(ctx.pid, l) : '';
  }
  // what you can do with a card, as small buttons inside it (the panel and the Board share these)
  function cardActs(ctx, s, c) {
    const { C } = ctx;
    const closed = s.status === 'closed';
    const play = !closed && s.phase === 'play';
    const act = (a, icon, label, data = {}, cls = '') => `<button class="kact ${cls}" data-act="${a}" data-card="${c.id}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${icon ? ic(icon, 's') : ''}${label}</button>`;
    const minis = play && (c.status === 'active' || c.status === 'candidate') ? Object.values(C.miniRounds).filter((x) => x.target === 'card').map((x) => act('bs-mini', MINI_ICON[x.key], esc(x.name), { round: x.key })) : [];
    const acts = [];
    if (c.status === 'candidate' && play) {
      const r = readiness(s, c.id);
      const th = thumbsOf(s, c.id);
      const mine = th.includes(ctx.me);
      const v = s.verdicts[c.id];
      acts.push(act('bs-thumb', 'thumb', mine ? 'Your 👍 · take it back' : '👍 Vote for it', {}, mine ? 'on' : ''));
      if (r.state === 'ready') acts.push(act('bs-promote', 'send', r.picked ? 'Promote the bot’s pick' : v?.verdict === 'block' ? 'Promote anyway' : 'Promote', {}, 'go'));
      if (v?.verdict === 'warn' && !v.dismissed) acts.push(act('bs-dismiss', '', 'we know, it’s intentional'));
      acts.push(act('bs-status', 'back', 'Pull it back', { status: 'active' }), ...minis);
    } else if (c.status === 'active' && play) acts.push(act('bs-status', 'star', 'Nominate it', { status: 'candidate' }), ...minis, act('bs-status', 'pause', 'Park it', { status: 'parked' }), act('bs-status', 'trash', 'Discard', { status: 'discarded' }, 'danger'));
    else if ((c.status === 'parked' || c.status === 'discarded') && play) acts.push(act('bs-status', 'back', 'Back to the table', { status: 'active' }));
    return acts.filter(Boolean);
  }
  // the votes and the Judge's note on a nominated card, in one line. The count decides Promote; the note only advises.
  const judgeClass = (s, id) => { const v = s.verdicts[id]; return v?.verdict === 'block' ? 'j-block' : v?.verdict === 'warn' && !v.dismissed ? 'j-warn' : ''; };
  function voteLine(ctx, s, c) {
    if (c.status !== 'candidate') return '';
    const r = readiness(s, c.id);
    const th = thumbsOf(s, c.id);
    const v = s.verdicts[c.id];
    const judge = !v ? `<span class="faint">${ctx.B.botOnline ? 'the Judge is reading it…' : 'the Judge reads it when the bot is back'}</span>`
      : v.verdict === 'ok' ? `Judge: ${esc(v.note || 'consistent')}` : v.verdict === 'warn' ? `Judge asks: ${esc(v.note)}${v.dismissed ? ' <span class="muted">· intentional, logged</span>' : ''}` : `Judge: contradiction · ${esc(v.note)}`;
    const votes = `${th.length ? `👍 ${th.map(esc).join(', ')}` : 'no votes yet'} · ${r.n} of ${r.need}${r.picked ? ' · the bot’s pick' : r.state === 'ready' ? ' · ready' : ''}`;
    return `<div class="vline r-${r.state} ${judgeClass(s, c.id)}"><span>${judge}</span><span class="muted">${votes}</span></div>`;
  }
  function kard(ctx, s, c, under = false) {
    const closed = s.status === 'closed';
    const open = !!bui.open[c.id];
    const credit = c.sparkedBy ? `${esc(c.sparkedBy)}${c.author === 'bot' ? ' <span class="faint" title="written down by the bot">· bot</span>' : ''}` : c.author === 'bot' ? 'bot' : esc(c.author);
    const parent = c.parent && ctx.B.cards.find((x) => x.id === c.parent);
    const play = !closed && s.phase === 'play';
    const th = thumbsOf(s, c.id);
    const star = closed ? '' : c.status === 'candidate' ? (play ? `<button class="icon star on" data-act="bs-status" data-card="${c.id}" data-status="active" title="nominated · click to pull back">${ic('star', 's')}</button>` : '') : c.status === 'active' && play ? `<button class="icon star" data-act="bs-status" data-card="${c.id}" data-status="candidate" title="nominate it: the room votes 👍, the Judge adds a note">${ic('star', 's')}</button>` : '';
    const tags = `${c.alternate ? '<span class="tag">alternate</span>' : ''}${c.status === 'promoted' ? `<span class="tag tint">→ ${esc(c.promotedTo.replace(/\s*\(.*\)$/, ''))}</span>` : ''}`;
    const count = c.status === 'candidate' && th.length ? `<span class="kcount" title="${esc(th.join(', '))}">${ic('thumb', 's')}${th.length}</span>` : '';
    const acts = cardActs(ctx, s, c);
    const footer = c.status === 'promoted' ? `<div class="kfoot">Promoted to ${esc(c.promotedTo)} · <a href="${base(ctx)}/promoted" data-act="bs-ptab" data-card="${c.id}">${ctx.B.landings?.[c.id] ? 'edit it in Promoted' : 'clean it and send it on in Promoted'} ›</a></div>`
      : acts.length ? `<div class="kacts">${acts.join('')}</div>` : '';
    return `<div class="kard ${c.status} ${under ? 'child' : ''} ${open ? 'open' : ''} ${c.status === 'candidate' ? `r-${readiness(s, c.id).state} ${judgeClass(s, c.id)}` : ''}" data-key="k-${c.id}">
      <div class="krow">
        <button class="kt" data-act="bs-card-toggle" data-card="${c.id}" title="${open ? 'fold it' : 'open it'}" aria-expanded="${open}">${judgeMark(s, c)}<span class="ktt">${esc(c.title)}</span>${tags}${count}</button>
        ${closed ? '' : `<div class="ktools">${star}${open ? '' : `<button class="icon" data-act="bs-card-toggle" data-card="${c.id}" title="open it: its options are inside">${ic('more', 's')}</button>`}</div>`}
      </div>
      ${open ? `<div class="kbody">${parent && !under ? `<div class="kparent">↳ on “${esc(parent.title)}”</div>` : ''}${c.note ? `<div class="knote">${md(c.note)}</div>` : ''}${fieldsHtml(c)}${voteLine(ctx, s, c)}<div class="kmeta"><span>${credit}</span></div>${landedLine(ctx, c)}${footer}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- the Board: the cards only, big; where you compare and vote, live or later
  function boardView(ctx, s) {
    const cards = ctx.B.cards;
    const closed = s.status === 'closed';
    const byStatus = (st) => cards.filter((c) => c.status === st);
    const cands = byStatus('candidate'), promoted = byStatus('promoted'), active = byStatus('active'), parked = byStatus('parked'), discarded = byStatus('discarded');
    const f = bui.fold[`${s.id}:board`] || {};
    const tiles = (list, cls = '') => tree(list, cards).map(({ c, under }) => tile(ctx, s, c, under)).join('');
    const sect = (icon, label, n, body, sub = '') => `<section class="bsect"><div class="lbl">${ic(icon)}<span>${label}</span><span class="muted">${n}</span>${sub ? `<span class="muted small">· ${sub}</span>` : ''}</div>${body}</section>`;
    const need = majority(s);
    return `<main class="bboard" data-key="board-${s.id}">
      ${s.tied.length && !s.winner ? `<div class="attn static"><span class="info">Everyone voted and nothing has ${need} of ${s.participants.length}: the bot is asking its tiebreak question in the chat.</span></div>` : ''}
      ${cands.length ? sect('star', 'Nominated', cands.length, `<div class="tiles">${tiles(cands)}</div>`, closed ? '' : `${need} of ${s.participants.length} 👍 light up Promote · the Judge adds a note`) : closed ? '' : sect('star', 'Nominated', 0, `<div class="quiet">Nothing nominated. ☆ a card on the table, then vote 👍.</div>`)}
      ${promoted.length ? sect('check', 'Promoted', promoted.length, `<div class="tiles">${tiles(promoted)}</div>`, `cleaned and sent on in <a href="${base(ctx)}/promoted">Promoted</a>`) : ''}
      ${active.length ? sect('grid', 'On the table', active.length, `<div class="tiles">${tiles(active)}</div>`) : ''}
      ${parked.length ? `<div class="fold" data-key="bfold-parked"><button class="link" data-act="bs-fold" data-sec="parked" data-scope="board">Parked · ${parked.length} ${f.parked ? '▾' : '›'}</button>${f.parked ? `<div class="tiles">${tiles(parked)}</div>` : ''}</div>` : ''}
      ${discarded.length ? `<div class="fold" data-key="bfold-discarded"><button class="link" data-act="bs-fold" data-sec="discarded" data-scope="board">Discarded · ${discarded.length} ${f.discarded ? '▾' : '›'}</button>${f.discarded ? `<div class="tiles">${tiles(discarded)}</div>` : ''}</div>` : ''}
      ${!cards.length ? '<div class="empty center">No cards yet. Everything the room says lands here as a card.</div>' : ''}
    </main>`;
  }
  function tile(ctx, s, c, under) {
    const closed = s.status === 'closed';
    const credit = c.sparkedBy ? `${esc(c.sparkedBy)}${c.author === 'bot' ? ' · bot' : ''}` : c.author === 'bot' ? 'bot' : esc(c.author);
    const parent = c.parent && ctx.B.cards.find((x) => x.id === c.parent);
    const r = c.status === 'candidate' ? readiness(s, c.id) : null;
    const th = thumbsOf(s, c.id);
    const acts = closed ? [] : cardActs(ctx, s, c);
    return `<div class="tile ${c.status} ${under ? 'child' : ''} ${r ? `r-${r.state} ${judgeClass(s, c.id)}` : ''}" data-key="t-${c.id}">
      <div class="thead">${judgeMark(s, c)}<b>${esc(c.title)}</b>${c.alternate ? '<span class="tag">alternate</span>' : ''}${c.status === 'promoted' ? `<span class="tag tint">→ ${esc(c.promotedTo.replace(/\s*\(.*\)$/, ''))}</span>` : ''}</div>
      ${parent && !under ? `<div class="kparent">↳ on “${esc(parent.title)}”</div>` : ''}
      ${c.note ? `<div class="knote">${md(c.note)}</div>` : ''}${fieldsHtml(c)}
      ${c.status === 'candidate' ? `<div class="tvotes">${th.length ? th.map((n) => `<span class="av ${n === ctx.me ? 'me' : ''}" title="${esc(n)}">${initials(n)}</span>`).join('') : '<span class="muted small">no votes yet</span>'}<span class="muted small">${r.n} of ${r.need}${r.picked ? ' · the bot’s pick' : ''}</span></div>${voteLine(ctx, s, c)}` : ''}
      ${landedLine(ctx, c)}
      <div class="tfoot"><span class="muted small">${credit}</span>${acts.length ? `<div class="kacts">${acts.join('')}</div>` : ''}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- Promoted: every promoted card, cleaned here, then sent on
  const TYPES_PL = { idea: 'Ideas', arc: 'Arcs', character: 'Characters', scene: 'Scenes', dialogue: 'Dialogue' };
  const pv = (cid, f, server) => bui.pv[`${cid}:${f}`] ?? server ?? '';
  const asText = (v) => (Array.isArray(v) ? v.join('\n') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
  function promotedView(ctx) {
    const { B, C } = ctx;
    const all = B.promoted || [];
    const f = bui.pfilter || 'all';
    const types = Object.keys(TYPES_PL).filter((t) => all.some((c) => c.type === t));
    const list = all.filter((c) => f === 'all' || c.type === f);
    const toSend = list.filter((c) => !c.landed), sent = list.filter((c) => c.landed);
    const chip = (k, label, n) => `<button class="seg ${f === k ? 'on' : ''}" data-act="bs-pfilter" data-f="${k}">${label} <span class="pnum">${n}</span></button>`;
    return `<main class="promo" data-key="promo">
      <div class="phd"><h1>Promoted</h1><p class="muted">What the team decided on, from every session. Clean a card here, then send it on: it lands in the script or the Bible.</p></div>
      ${types.length > 1 ? `<nav class="segs pfilters" data-key="pfilters">${chip('all', 'All', all.length)}${types.map((t) => chip(t, TYPES_PL[t], all.filter((c) => c.type === t).length)).join('')}</nav>` : ''}
      ${toSend.length ? `<div class="lbl">${ic('send')}<span>To send</span><span class="muted">${toSend.length}</span></div><div class="plist" data-key="pl-send">${toSend.map((c) => pcard(ctx, c)).join('')}</div>` : ''}
      ${sent.length ? `<div class="lbl">${ic('check')}<span>Sent</span><span class="muted">${sent.length}</span></div><div class="plist" data-key="pl-sent">${sent.map((c) => pcard(ctx, c)).join('')}</div>` : ''}
      ${!all.length ? '<div class="empty">Nothing promoted yet. In a session: star a card, the room votes 👍, and it lands here to be cleaned.</div>' : ''}
    </main>`;
  }
  function pcard(ctx, c) {
    const { C, B } = ctx;
    const open = !!bui.popen[c.id];
    const t = C.templates[c.type];
    const keys = [...new Set([...(t?.fields || []), ...Object.keys(c.fields || {})])];
    const loose = c.type === 'dialogue' && !(c.origin?.section === 'script' && !c.origin.gone);
    const field = (f, label, multi = true) => `<label class="pf"><span>${label}</span>${multi ? `<textarea class="auto" rows="1" data-pedit="${f}" data-card="${c.id}" data-key="pe-${c.id}-${f}">${esc(pv(c.id, f, f === 'note' ? c.note : asText(c.fields?.[f.slice(2)])))}</textarea>` : `<input data-pedit="${f}" data-card="${c.id}" data-key="pe-${c.id}-${f}" value="${esc(pv(c.id, f, c.title))}" maxlength="120">`}</label>`;
    return `<div class="pc ${open ? 'open' : ''}" data-key="pc-${c.id}">
      <button class="prow" data-act="bs-popen" data-card="${c.id}" aria-expanded="${open}">${ic(TYPE[c.type] || 'tag')}<span class="pt">${esc(pv(c.id, 'title', c.title))}</span><span class="pmeta">${esc(t?.name || c.type)} · from “${esc(c.topic)}”${c.sparkedBy ? ` · ${esc(c.sparkedBy)}` : ''}</span><span class="grow"></span>${c.landed ? '<span class="tag tint">sent</span>' : '<span class="tag">to send</span>'}${ic('chevron', 's pchev')}</button>
      ${open ? `<div class="ped" data-key="ped-${c.id}">
        ${field('title', 'Title', false)}
        ${field('note', 'Note')}
        ${keys.map((k) => field(`f:${k}`, esc(k.replace(/_/g, ' ')))).join('')}
        <div class="pfoot">
          <div class="pwhere">${c.landed ? `${window.PI.landedLink(ctx.pid, c.landed)}<span class="muted small">Editing here doesn’t change what was sent; send it again if it should.</span>` : c.origin?.title && !c.origin.gone ? `<span class="muted small">${ic('script', 's')} from sc. ${c.origin.num ?? '–'} ${esc(c.origin.title)}: it goes back there as an alternate</span>` : ''}</div>
          <div class="pacts"><a class="small" href="${base(ctx)}/s/${esc(c.session)}">Its session ›</a>
            ${loose ? `<select class="small" data-psendscene="${c.id}">${B.scenes?.length ? `<option value="">pick the scene…</option>${B.scenes.map((x) => `<option value="${esc(x.id)}" ${bui.psendscene[c.id] === x.id ? 'selected' : ''}>${x.num} ${esc(x.title)}</option>`).join('')}` : '<option value="">no script yet</option>'}</select>` : ''}
            <button class="primary small" data-act="bs-psend" data-card="${c.id}">${c.landed ? 'Send again' : esc(loose ? 'Send its lines' : c.send)}</button></div>
        </div>
      </div>` : ''}
    </div>`;
  }
  // edits: kept locally while typing, saved a moment after you stop
  const ptimers = {};
  function queuePEdit(ctx, cid, f, v) {
    bui.pv[`${cid}:${f}`] = v;
    clearTimeout(ptimers[cid]);
    ptimers[cid] = setTimeout(() => flushPEdits(ctx.pid, cid), 600);
  }
  async function flushPEdits(pid, cid) {
    clearTimeout(ptimers[cid]); delete ptimers[cid];
    const mine = Object.entries(bui.pv).filter(([k]) => k.startsWith(`${cid}:`));
    if (!mine.length) return;
    const body = { fields: {} };
    for (const [k, v] of mine) { const f = k.slice(cid.length + 1); if (f === 'title') body.title = v; else if (f === 'note') body.note = v; else body.fields[f.slice(2)] = v; }
    const r = await api(`/api/projects/${pid}/promoted/${cid}/edit`, body);
    if (r.ok) for (const [k, v] of mine) if (bui.pv[k] === v) delete bui.pv[k];
  }

  // ---------------------------------------------------------------- history
  function historyView(ctx) {
    const { B, C } = ctx;
    const past = B.sessions.filter((s) => s.status === 'closed').sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
    return `<main class="room" data-key="history">
      <div class="slist">${past.length ? past.map((s) => {
        const open = bui.histOpen === s.id;
        return `<div class="srow2 ${open ? 'cur' : ''}" data-key="hr-${s.id}" data-act="bs-hist-open" data-id="${s.id}">${ic(TYPE[s.type] || 'tag')}
          <span class="stt"><b>${esc(s.topic)}</b><span class="muted small">${esc(tpl(C, s).name)} · ${s.participants.map(esc).join(', ')} · ${s.closedAt ? new Date(s.closedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · ${plural(s.cards, 'card')}</span></span>
          <span class="chev">${open ? '▴' : '▾'}</span></div>
          ${open ? `<div class="sdetail" data-key="hd-${s.id}">${s.recap ? `<div><div class="mlabel">Recap</div><div class="recaptext">${md(s.recap)}</div></div>` : '<div class="muted small">No recap.</div>'}<div><a href="${base(ctx)}/s/${esc(s.id)}" class="small">Open the whole session ›</a></div></div>` : ''}`;
      }).join('') : '<div class="empty">No past sessions yet. A session lands here when it’s wrapped up.</div>'}</div>
    </main>`;
  }

  // ---------------------------------------------------------------- after a render: keep the chat at the bottom
  function post(ctx) {
    const s = sessionOf(ctx);
    const chat = document.querySelector('.chat');
    if (chat && s) {
      const n = ctx.B.messages.length;
      const prev = bui.chatCount[s.id];
      const atBottom = bui.atBottom !== false;
      const inner = chat.scrollHeight > chat.clientHeight + 2; // wide: the chat scrolls; narrow: the page does
      if (atBottom || prev === undefined || n !== prev || s.botBusy) {
        if (inner) chat.scrollTop = chat.scrollHeight;
        else if (n !== prev && prev !== undefined) chat.lastElementChild?.lastElementChild?.scrollIntoView({ block: 'end' });
      }
      bui.chatCount[s.id] = n;
      chat.onscroll = () => { bui.atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80; };
    }
    if (bui.pscroll) { const el = document.querySelector(`[data-key="pc-${CSS.escape(bui.pscroll)}"]`); bui.pscroll = null; el?.scrollIntoView({ block: 'center' }); }
    if (bui.focus) { const el = document.querySelector(bui.focus); bui.focus = null; if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); } }
  }

  // ---------------------------------------------------------------- actions (acts start with bs-)
  async function send(ctx) {
    const s = sessionOf(ctx);
    const ta = document.querySelector('[data-composer]');
    const text = (ta?.value || '').trim();
    if (!text || !s || s.status !== 'live') return;
    ta.value = ''; bui.drafts[s.id] = '';
    await sapi(ctx, s.id, 'message', { text });
  }
  async function addCard(ctx) {
    const inp = document.querySelector('[data-newcard]');
    const title = (inp?.value || '').trim();
    const s = sessionOf(ctx);
    if (!title || !s) { bui.newCard = null; bui.newCardText = ''; return window.PI.render(); }
    bui.newCardText = ''; inp.value = '';
    await api(`/api/projects/${ctx.pid}/card`, { session: s.id, title });
    bui.focus = '[data-newcard]';
  }

  async function onClick(e, b, ctx) {
    const act = b.dataset.act;
    if (!act?.startsWith('bs-')) return false;
    const ds = b.dataset;
    const s = sessionOf(ctx);
    const R = window.PI.render;
    switch (act) {
      case 'bs-type': bui.newType = ds.type; R(); return true;
      case 'bs-seed-toggle': bui.seedOpen = !bui.seedOpen; if (bui.seedOpen) bui.focus = '[data-bui="seed"]'; R(); return true;
      case 'bs-join': await sapi(ctx, ctx.r.session, 'join'); return true;
      case 'bs-voice': {
        const key = ds.key || ds.key2;
        if (key === 'custom') {
          if (s.status === 'lobby') { bui.focus = '[data-bui="custom"]'; await sapi(ctx, s.id, 'personality', { key: 'custom', custom: s.personality.custom || bui.custom }); return true; }
          const line = prompt('Describe the bot in one line:', s.personality.custom || bui.custom || ''); if (!line) return true;
          bui.custom = line; await sapi(ctx, s.id, 'personality', { key: 'custom', custom: line }); return true;
        }
        await sapi(ctx, s.id, 'personality', { key }); return true;
      }
      case 'bs-start': await sapi(ctx, ctx.r.session, 'start'); return true;
      case 'bs-seed-show': bui.seedShown[ds.id] = !bui.seedShown[ds.id]; R(); return true;
      case 'bs-offline-toggle': bui.offlineOpen = !bui.offlineOpen; R(); return true;
      case 'bs-send': await send(ctx); return true;
      case 'bs-pick': await sapi(ctx, s.id, 'message', { text: ds.text }); return true;
      case 'bs-round-close': await sapi(ctx, s.id, 'round-close'); return true;
      case 'bs-stage-to': { const to = Number(ds.to); let cur = s.stage; while (cur !== to) { const dir = to > cur ? 1 : -1; const r = await sapi(ctx, s.id, 'stage', { dir }); if (!r.ok) break; cur += dir; } return true; }
      case 'bs-mini': await sapi(ctx, s.id, 'mini', { round: ds.round, card: ds.card || undefined }); return true;
      case 'bs-wrap': if (confirm('Wrap up? The bot posts a recap and the session becomes read-only.')) await sapi(ctx, s.id, 'wrap'); return true;
      case 'bs-card-new': bui.newCard = bui.newCard === s.id ? null : s.id; if (bui.newCard) bui.focus = '[data-newcard]'; R(); return true;
      case 'bs-card-new-x': bui.newCard = null; bui.newCardText = ''; R(); return true;
      case 'bs-fold': { const f = (bui.fold[ds.scope === 'board' ? `${s.id}:board` : s.id] ||= {}); f[ds.sec] = !f[ds.sec]; R(); return true; }
      case 'bs-status': await api(`/api/projects/${ctx.pid}/card/${ds.card}/status`, { status: ds.status }); return true;
      case 'bs-thumb': await api(`/api/projects/${ctx.pid}/card/${ds.card}/thumb`); return true;
      case 'bs-promote': { const r = await sapi(ctx, s.id, 'promote', { card: ds.card }); if (r.ok) toast('Promoted · it waits in the Promoted tab'); return true; }
      case 'bs-dismiss': await api(`/api/projects/${ctx.pid}/card/${ds.card}/dismiss-flag`, { reason: 'We know, it’s intentional' }); return true;
      case 'bs-hist-open': bui.histOpen = bui.histOpen === ds.id ? null : ds.id; R(); return true;
      case 'bs-pfilter': bui.pfilter = ds.f; R(); return true;
      case 'bs-popen': bui.popen[ds.card] = !bui.popen[ds.card]; if (!bui.popen[ds.card]) flushPEdits(ctx.pid, ds.card); R(); return true;
      case 'bs-ptab': bui.popen[ds.card] = true; return false; // the link does the rest
      case 'bs-psend': {
        await flushPEdits(ctx.pid, ds.card);
        const c = (ctx.B.promoted || []).find((x) => x.id === ds.card);
        const loose = c?.type === 'dialogue' && !(c.origin?.section === 'script' && !c.origin.gone);
        if (loose && !bui.psendscene[ds.card]) { toast('pick the scene its lines go into'); return true; }
        if (c?.landed && !confirm(`Send “${c.title}” again? ${c.type === 'scene' || c.type === 'dialogue' ? 'It lands again as a new alternate; what was sent before stays where it is.' : 'It updates what it sent before.'}`)) return true;
        const r = await api(`/api/projects/${ctx.pid}/promoted/${ds.card}/send`, { scene: bui.psendscene[ds.card] || undefined });
        if (r.ok) toast(r.landed?.say || 'Sent');
        return true;
      }
      case 'bs-to-recap': document.querySelector('.recap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
      case 'bs-card-toggle': bui.open[ds.card] = !bui.open[ds.card]; R(); return true;
      case 'bs-cards-fold': { const all = ctx.B.cards.map((c) => c.id); const anyOpen = all.some((id) => bui.open[id]); for (const id of all) bui.open[id] = !anyOpen; R(); return true; }
    }
    return false;
  }
  function onKey(e, ctx) {
    const t = e.target;
    if (e.key === 'Enter' && t.dataset?.pedit === 'title') { e.preventDefault(); flushPEdits(ctx.pid, t.dataset.card); t.blur(); return true; }
    if (e.key === 'Escape') {
      if (t.dataset?.newcard !== undefined) { bui.newCard = null; bui.newCardText = ''; window.PI.render(); return true; }
      return false;
    }
    if (e.isComposing) return false;
    if (e.key === 'Enter' && t.dataset?.composer && !e.shiftKey) { e.preventDefault(); send(ctx); return true; }
    if (e.key === 'Enter' && t.dataset?.newcard !== undefined) { e.preventDefault(); addCard(ctx); return true; }
    if (e.key === 'Enter' && t.dataset?.actEnter === 'bs-voice-custom') { e.preventDefault(); const v = t.value.trim(); if (!v) { toast('describe the bot in one line'); return true; } bui.custom = v; sapi(ctx, ctx.r.session, 'personality', { key: 'custom', custom: v }); t.blur(); return true; }
    return false;
  }
  async function onSubmit(e, ctx) {
    const f = e.target.closest('[data-act="bs-create"]');
    if (!f) return false;
    e.preventDefault();
    const r = await api(`/api/projects/${ctx.pid}/session`, { type: bui.newType, topic: bui.topic, seed: bui.seed });
    if (r.ok) { bui.topic = ''; bui.seed = ''; bui.seedOpen = false; location.hash = `${base(ctx)}/s/${r.id}`; }
    return true;
  }
  function onInput(e, ctx) {
    const t = e.target;
    if (t.dataset.pedit && t.dataset.card) { queuePEdit(ctx, t.dataset.card, t.dataset.pedit, t.value); return true; }
    if (t.dataset.psendscene) { bui.psendscene[t.dataset.psendscene] = t.value; return true; }
    if (t.dataset.bui) { bui[t.dataset.bui] = t.value; return true; }
    if (t.dataset.composer) { bui.drafts[t.dataset.composer] = t.value; return true; }
    if (t.dataset.newcard !== undefined) { bui.newCardText = t.value; return true; }
    return false;
  }

  window.PI.sections.brainstorm = { chrome, body, post, onClick, onKey, onSubmit, onInput };
})();
