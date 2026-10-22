// π brainstorm demo — vanilla client. State arrives whole over SSE; we render from it.
(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  let state = null;
  let me = localStorage.getItem('pi.name') || '';
  let viewKey = '';
  const ui = { newType: 'idea', topic: '', seed: '', customText: '', showParked: false, showDiscarded: false, chatCount: {} };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const field = (k) => esc(k).replace(/_/g, ' ');
  const $ = (sel) => app.querySelector(sel);
  let toastTimer;
  const toast = (t) => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.hidden = true), 2600); };

  async function api(path, data = {}) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who: me, ...data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error || 'error');
    return j;
  }

  // ---------------------------------------------------------------- live
  const es = new EventSource('/events');
  es.onmessage = (e) => { state = JSON.parse(e.data); render(); };
  es.onerror = () => toast('connection lost — is the server running?');
  window.addEventListener('hashchange', render);

  const route = () => { const m = location.hash.match(/^#s\/(.+)$/); return m ? { view: 'session', id: m[1] } : { view: 'home' }; };
  const sessionsSorted = () => Object.values(state.sessions).sort((a, b) => ({ live: 0, lobby: 1, closed: 2 }[a.status] - { live: 0, lobby: 1, closed: 2 }[b.status]) || b.createdAt - a.createdAt);
  const cardsOf = (sid) => Object.values(state.cards).filter((c) => c.session === sid).sort((a, b) => b.ts - a.ts);
  const tpl = (s) => state.templates[s.type];
  const majority = (s) => Math.floor(s.participants.length / 2) + 1;
  const botPill = (s) => {
    if (s?.botBusy) return '<span class="pill bot-busy">🤖 thinking…</span>';
    if (state.botOnline) return '<span class="pill bot-on">🤖 bot online</span>';
    return '<span class="pill bot-off">🤖 bot offline</span>';
  };
  const persName = (s) => s.personality.key === 'custom' ? `✏️ ${s.personality.custom || 'Custom'}` : `${state.personalities[s.personality.key].emoji} ${state.personalities[s.personality.key].name}`;

  // ---------------------------------------------------------------- render
  function render() {
    if (!state) return;
    if (!me) { viewKey = 'gate'; return renderGate(); }
    const r = route();
    if (r.view === 'home') { viewKey = 'home'; return renderHome(); }
    const s = state.sessions[r.id];
    if (!s) { location.hash = ''; return; }
    if (s.status === 'lobby') { viewKey = `lobby:${s.id}`; return renderLobby(s); }
    const key = `live:${s.id}`;
    if (viewKey !== key) { viewKey = key; app.innerHTML = sessionSkeleton(); bindComposer(s); }
    renderSession(s);
  }

  function renderGate() {
    app.innerHTML = `<div class="gate"><h1>π · Brainstorm</h1><div class="muted">Team demo. What should the others see you as?</div>
      <form id="gate"><input id="gname" placeholder="your name" autofocus maxlength="40"><button class="primary">Enter</button></form></div>`;
    $('#gate').onsubmit = (e) => { e.preventDefault(); const v = $('#gname').value.trim(); if (!v) return; me = v; localStorage.setItem('pi.name', v); render(); };
  }

  function topBar() {
    return `<header class="top"><a href="#" class="brand">π production system <span class="muted">· Brainstorming demo</span></a>
      <div class="small">you are <b>${esc(me)}</b> <button class="ghost small" data-act="rename">change</button></div></header>`;
  }

  function renderHome() {
    const sessions = sessionsSorted();
    const promoted = Object.values(state.cards).filter((c) => c.status === 'promoted').sort((a, b) => b.promotedAt - a.promotedAt);
    const groups = {};
    for (const c of promoted) (groups[c.promotedTo] ||= []).push(c);
    const t = state.templates[ui.newType];
    app.innerHTML = `${topBar()}<main class="home">
      <div class="botline">${botPill()} <span class="muted small">${state.botOnline ? 'a Claude Code terminal is playing the bot.' : 'in another terminal: <code>npm run bot</code> (in pi-brainstorm/). Sessions still work, the bot just stays quiet.'}</span></div>

      <h2>New session</h2>
      <div class="newform">
        <div class="types">${Object.values(state.templates).map((x) => `<button class="type ${x.key === ui.newType ? 'on' : ''}" data-act="type" data-type="${x.key}">
          <div class="t-name">${x.emoji} ${x.name}</div><div class="t-stages">${x.stages.map((st) => st.name).join(' → ')}</div></button>`).join('')}</div>
        <div class="small muted">${esc(t.blurb)} Promotes to <b>${esc(t.promotesTo)}</b>.</div>
        <input id="topic" placeholder="Topic — a title, or just a few keywords: cat, heist, rain, sad??" value="${esc(ui.topic)}" maxlength="120">
        <textarea id="seed" rows="3" placeholder="Paste what you already have (optional): a synopsis, a logline, notes, a half-written scene… The bot starts from it instead of from zero.">${esc(ui.seed)}</textarea>
        <div class="row"><button class="primary" data-act="create">Create session → lobby</button><span class="small muted">anyone can create one; the team joins in the lobby</span></div>
      </div>

      <h2>Sessions</h2>
      <div class="sessions">${sessions.length ? sessions.map((s) => {
        const n = cardsOf(s.id).length;
        return `<a class="item" href="#s/${s.id}"><span style="font-size:22px">${tpl(s).emoji}</span>
          <span class="topic">${esc(s.topic)}<div class="sub">${tpl(s).name} · ${s.participants.map(esc).join(', ') || 'nobody yet'} · ${n} card${n === 1 ? '' : 's'}${s.status === 'live' ? ` · ${tpl(s).stages[s.stage].icon} ${esc(tpl(s).stages[s.stage].name)}` : ''}</div></span>
          <span class="pill ${s.status}">${s.status}</span></a>`;
      }).join('') : '<div class="empty">No sessions yet.</div>'}</div>

      <h2>📖 Promoted</h2>
      <div class="bible">${promoted.length ? Object.entries(groups).map(([target, cards]) => `<div class="group"><h3>→ ${esc(target)}</h3>${cards.map((c) => `<div class="pcard"><b>${esc(c.title)}</b> <span class="muted small">· from “${esc(state.sessions[c.session]?.topic || '')}”</span>${c.note ? `<div class="small">${md(c.note)}</div>` : ''}${fieldsHtml(c)}</div>`).join('')}</div>`).join('')
        : '<div class="empty">Nothing promoted yet. Promoted cards land here, grouped by where they went (the Story Bible, in miniature).</div>'}</div>

      ${state.exceptions.length ? `<h2>⚠️ Intentional exceptions</h2><div class="excs">${state.exceptions.map((x) => `<div class="exc"><b>${esc(state.cards[x.card]?.title || x.card)}</b> — ${esc(x.note)} <span class="muted">· dismissed by ${esc(x.who)}: “${esc(x.reason)}”</span></div>`).join('')}</div>` : ''}

      <div style="margin-top:40px"><button class="ghost small danger" data-act="reset">reset demo</button></div>
    </main>`;
    $('#topic').oninput = (e) => (ui.topic = e.target.value);
    $('#seed').oninput = (e) => (ui.seed = e.target.value);
  }

  function renderLobby(s) {
    const t = tpl(s);
    const joined = s.participants.includes(me);
    app.innerHTML = `<header class="top"><div><a href="#" class="muted small" style="text-decoration:none">← sessions</a> &nbsp; <span class="brand">${t.emoji} ${esc(s.topic)}</span> <span class="pill lobby">lobby</span></div><div class="small">you are <b>${esc(me)}</b></div></header>
    <main class="lobby">
      <div class="typebox"><b>${t.emoji} ${t.name}</b> — ${esc(t.blurb)}<div class="small muted" style="margin-top:6px">${t.stages.map((st) => `${st.icon} ${esc(st.name)}`).join(' → ')} &nbsp;→&nbsp; promotes to <b>${esc(t.promotesTo)}</b></div></div>
      ${s.seed ? `<div class="seedbox"><b>Starting from what ${esc(s.createdBy)} pasted:</b>\n${esc(s.seed)}</div>` : ''}

      <h3>Who's here</h3>
      <div class="chips">${s.participants.map((p) => `<span class="chip ${p === me ? 'me' : ''}">${esc(p)}</span>`).join('')} ${joined ? '' : '<button data-act="join">Join</button>'}</div>
      <div class="small muted" style="margin-top:6px">Majority = ${majority(s)} of ${s.participants.length}. Open this page in another window with another name to add a teammate.</div>

      <h3>Bot personality <span class="muted small">— switchable mid-session</span></h3>
      <div class="pers">${Object.values(state.personalities).map((p) => `<button class="per ${s.personality.key === p.key ? 'on' : ''}" data-act="pers" data-key="${p.key}">
        <div class="p-name">${p.emoji} ${esc(p.name)}</div><div class="p-vibe">${esc(p.vibe)}</div><div class="p-vibe">Good for: ${esc(p.goodFor)}</div></button>`).join('')}</div>
      ${s.personality.key === 'custom' ? `<div style="display:flex;gap:8px;margin-top:8px"><input id="custom" placeholder="Describe the bot in one line" value="${esc(s.personality.custom || ui.customText)}" maxlength="300"><button data-act="pers-custom">Set</button></div>` : ''}

      <div class="start">
        <button class="primary" data-act="start">▶ Start session</button>
        ${botPill()}
        ${state.botOnline ? '' : '<span class="small muted">You can start without the bot; it answers once <code>npm run bot</code> is running.</span>'}
      </div>
    </main>`;
    const c = $('#custom'); if (c) c.oninput = (e) => (ui.customText = e.target.value);
  }

  function sessionSkeleton() {
    return `<div class="session"><header id="hdr" class="hdr"></header><div id="banner"></div>
      <div class="body"><section class="left"><div id="progress" class="progress"></div><div id="chat" class="chat"></div>
        <div class="composer"><div id="round" class="round"></div><div id="mini" class="mini"></div><div class="row"><textarea id="input" rows="1" placeholder="type or drop keywords…"></textarea><button id="send" class="primary" data-act="send">Send</button></div><div id="hint" class="hint"></div></div>
      </section><aside id="cards" class="cards"></aside></div></div>`;
  }

  function bindComposer() {
    const input = $('#input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });
  }

  async function send() {
    const s = state.sessions[route().id];
    const input = $('#input');
    const text = input.value.trim();
    if (!text || !s || s.status !== 'live') return;
    input.value = ''; input.style.height = 'auto';
    await api(`/api/session/${s.id}/message`, { text });
  }

  function renderSession(s) {
    const t = tpl(s);
    const closed = s.status === 'closed';
    const cards = cardsOf(s.id);
    const msgs = state.messages[s.id] || [];

    $('#hdr').innerHTML = `<a href="#" class="back">← sessions</a><span class="title">${t.emoji} ${esc(s.topic)}</span><span class="muted small">${t.name}</span>
      <div class="chips">${s.participants.map((p) => `<span class="chip ${p === me ? 'me' : ''}">${esc(p)}</span>`).join('')}</div><div class="grow"></div>
      ${closed ? '<span class="pill closed">closed · read-only</span>' : `<select id="pers" title="bot personality">${Object.values(state.personalities).map((p) => `<option value="${p.key}" ${s.personality.key === p.key ? 'selected' : ''}>${p.emoji} ${esc(p.key === 'custom' && s.personality.custom ? s.personality.custom : p.name)}</option>`).join('')}</select>`}
      ${botPill(s)}`;
    const sel = $('#pers');
    if (sel) sel.onchange = async () => {
      const key = sel.value;
      if (key === 'custom') { const line = prompt('Describe the bot in one line:', s.personality.custom || ''); if (!line) { sel.value = s.personality.key; return; } return api(`/api/session/${s.id}/personality`, { key, custom: line }); }
      api(`/api/session/${s.id}/personality`, { key });
    };

    $('#banner').innerHTML = closed ? '' : !state.botOnline ? '<div class="banner">🤖 The bot is offline. In another terminal: <code>npm run bot</code>. Your messages queue up and it answers when it arrives.</div>'
      : s.phase === 'tiebreak' ? '<div class="banner ok">🎲 Tiebreak: answer the bot’s questions in the chat. It picks a result; you still approve it.</div>' : '';

    const stageName = t.stages[s.stage];
    $('#progress').innerHTML = `<button class="ghost" data-act="stage" data-dir="-1" title="back a stage" ${closed || s.stage === 0 ? 'disabled' : ''}>⏪</button>
      <div class="stages">${t.stages.map((st, i) => `<div class="stage ${i < s.stage ? 'done' : i === s.stage ? 'current' : ''}" title="${esc(st.goal)}">${st.icon} ${esc(st.name)}</div>`).join('')}</div>
      <button class="ghost" data-act="stage" data-dir="1" title="next stage" ${closed || s.stage === t.stages.length - 1 ? 'disabled' : ''}>▶</button>
      <span class="count">${cards.filter((c) => c.status !== 'discarded').length} cards</span>`;

    // chat
    const chat = $('#chat');
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
    const lastBotIdx = msgs.map((m) => m.kind).lastIndexOf('bot');
    const lastIdx = msgs.length - 1;
    const r = s.round;
    const iAnswered = !!(r && r.answers[me]);
    chat.innerHTML = msgs.map((m, i) => {
      if (m.kind === 'system') return `<div class="msg sys">${md(m.text)}</div>`;
      const isQuestion = r && m.id === r.questionMsg;
      const picksLive = !closed && m.picks?.length && (isQuestion ? !iAnswered : (!r && i === lastBotIdx && i === lastIdx));
      const picks = m.picks?.length ? `<div class="picks ${picksLive ? '' : 'old'}">${m.picks.map((p) => `<button data-act="${picksLive ? 'pick' : 'noop'}" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : '';
      if (m.kind === 'bot') return `<div class="msg bot"><div class="av">🤖</div><div class="bubble">${md(m.text)}${picks}</div></div>`;
      if (m.hidden && m.author !== me) return `<div class="msg user hidden"><div class="name">${esc(m.author)}</div><div class="bubble">🔒 answered</div></div>`;
      return `<div class="msg user ${m.author === me ? 'me' : ''}"><div class="name">${esc(m.author)}</div><div class="bubble">${md(m.text)}${m.hidden ? '<div class="lock">🔒 hidden until everyone’s in</div>' : ''}</div></div>`;
    }).join('')
      + (s.botBusy ? '<div class="msg bot typing"><div class="av">🤖</div><div class="bubble">thinking…</div></div>' : '')
      + (s.recap ? `<div class="recap"><div class="h">📋 Recap</div>${md(s.recap)}</div>` : '');
    const prev = ui.chatCount[s.id] || 0;
    if (atBottom || msgs.length !== prev || s.botBusy) chat.scrollTop = chat.scrollHeight;
    ui.chatCount[s.id] = msgs.length;

    // composer
    $('#mini').innerHTML = closed || s.phase !== 'play' ? '' : Object.values(state.miniRounds).filter((r) => r.target === 'session').map((r) => `<button data-act="mini" data-round="${r.key}" title="${esc(r.rule)}">${r.emoji} ${esc(r.name)}</button>`).join('')
      + `<span class="small muted">· ➕ yes-and, 🔄 flip and 💀 worst live on each card</span>`;
    const input = $('#input');
    input.disabled = closed; $('#send').disabled = closed;
    if (r) {
      const missing = s.participants.filter((p) => !r.answers[p]);
      $('#round').innerHTML = `<span class="r-label">${r.blind ? '🔒 blind round' : '🔁 round'} · everyone answers, then the bot</span>
        <span class="chips">${s.participants.map((p) => `<span class="chip ${r.answers[p] ? 'ok' : 'wait'}">${esc(p)} ${r.answers[p] ? '✓' : '…'}</span>`).join('')}</span>
        ${missing.length && iAnswered ? '<button class="ghost small" data-act="round-close">go without them</button>' : ''}`;
      input.placeholder = iAnswered ? 'you answered — add more if you like, or wait' : r.blind ? 'your answer — hidden until everyone’s in' : 'your answer';
    } else {
      $('#round').innerHTML = '';
      input.placeholder = closed ? 'session closed' : s.phase === 'tiebreak' ? 'answer the bot’s tiebreak question…' : s.phase === 'judging' ? 'answer the ⚠️ question, or wait for the judge…' : 'type or drop keywords…';
    }
    $('#hint').textContent = closed ? '' : `Enter to send · Shift+Enter for a new line · ${persName(s)}`;

    // cards panel
    $('#cards').innerHTML = cardsPanel(s, cards);
  }

  function fieldsHtml(c) {
    const entries = Object.entries(c.fields || {}).filter(([, v]) => v !== '' && v != null);
    if (!entries.length) return '';
    return `<dl>${entries.map(([k, v]) => `<dt>${field(k)}</dt><dd>${md(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))}</dd>`).join('')}</dl>`;
  }

  function cardHtml(s, c, opts = {}) {
    const closed = s.status === 'closed';
    const counts = {};
    for (const r of Object.values(c.reactions)) counts[r] = (counts[r] || 0) + 1;
    const mine = c.reactions[me];
    const credit = c.sparkedBy ? `✦ ${esc(c.sparkedBy)}${c.author === 'bot' ? ' <span title="written down by the bot">🤖</span>' : ''}` : c.author === 'bot' ? '🤖 bot' : `✦ ${esc(c.author)}`;
    const canAct = !closed && s.phase === 'play';
    let actions = '';
    const play = canAct && (c.status === 'active' || c.status === 'candidate') && s.phase === 'play'
      ? `<span class="c-play">${Object.values(state.miniRounds).filter((r) => r.target === 'card').map((r) => `<button class="ghost" data-act="mini" data-round="${r.key}" data-card="${c.id}" title="${esc(r.rule)}">${r.emoji} ${esc(r.name)}</button>`).join('')}</span>` : '';
    const parent = c.parent && state.cards[c.parent];
    if (canAct && c.status === 'active') actions = `<button data-act="status" data-card="${c.id}" data-status="candidate">⭐ candidate</button><button data-act="status" data-card="${c.id}" data-status="parked">park</button><button class="ghost" data-act="status" data-card="${c.id}" data-status="discarded">discard</button>`;
    else if (!closed && c.status === 'candidate' && (s.phase === 'play' || s.phase === 'judging' || s.phase === 'vote')) actions = `<button data-act="status" data-card="${c.id}" data-status="active">pull back</button>`;
    else if (canAct && (c.status === 'parked' || c.status === 'discarded')) actions = `<button data-act="status" data-card="${c.id}" data-status="active">↩ back to active</button>`;
    return `<div class="card ${c.status} ${opts.winner ? 'winner' : ''} ${parent ? 'child' : ''}">
      ${parent ? `<div class="c-parent">↳ on “${esc(parent.title)}”</div>` : ''}
      <div class="c-title"><span>${esc(c.title)}</span>${c.alternate ? '<span class="tag alt">alternate</span>' : ''}${c.status === 'promoted' ? `<span class="tag">→ ${esc(c.promotedTo)}</span>` : ''}</div>
      ${c.note ? `<div class="c-note">${md(c.note)}</div>` : ''}${fieldsHtml(c)}
      <div class="c-meta"><span>${credit}</span><span class="reacts">${state.reactions.map((r) => `<button class="${mine === r ? 'mine' : ''}" data-act="react" data-card="${c.id}" data-value="${r}" ${closed ? 'disabled' : ''}>${r}${counts[r] ? ' ' + counts[r] : ''}</button>`).join('')}</span></div>
      ${opts.extra || ''}${actions || play ? `<div class="c-actions">${actions}${play}</div>` : ''}</div>`;
  }

  function cardsPanel(s, cards) {
    const closed = s.status === 'closed';
    const cands = cards.filter((c) => c.status === 'candidate');
    const active = cards.filter((c) => c.status === 'active');
    const parked = cards.filter((c) => c.status === 'parked');
    const discarded = cards.filter((c) => c.status === 'discarded');
    const promoted = cards.filter((c) => c.status === 'promoted');
    let board = '';
    if (closed) board = '';
    else if (s.phase === 'play') board = cands.length
      ? `<div class="phase">${cands.length} candidate${cands.length > 1 ? 's' : ''} ready.</div>${cands.map((c) => cardHtml(s, c)).join('')}<button class="primary" data-act="call-vote">⚖️ Call the vote</button> <span class="hint">judge → ${cands.length > 1 ? 'vote → ' : ''}approval (${majority(s)} of ${s.participants.length})</span>`
      : '<div class="hint">Pitch board. Mark a card ⭐ candidate to put it here, then call the vote.</div>';
    else if (s.phase === 'judging') board = `<div class="phase">⚖️ Continuity Judge is checking…</div>${cands.map((c) => {
      const v = s.verdicts[c.id];
      let extra = '<div class="verdict">⏳ waiting for the judge</div>';
      if (v) {
        const icon = { ok: '✅', warn: '⚠️', block: '❌' }[v.verdict];
        let act = '';
        if (v.verdict === 'warn' && !v.dismissed) act = `<div class="v-actions"><button data-act="dismiss" data-card="${c.id}">We know, it’s intentional</button><span class="small muted">or answer it in the chat</span></div>`;
        if (v.verdict === 'warn' && v.dismissed) act = `<div class="small muted">dismissed as intentional by ${esc(v.dismissedBy)} · logged</div>`;
        if (v.verdict === 'block') act = `<div class="v-actions"><button data-act="status" data-card="${c.id}" data-status="active">pull back & fix</button><span class="small muted">or argue in the chat; the judge can re-check</span></div>`;
        extra = `<div class="verdict ${v.verdict}">${icon} ${esc(v.note) || (v.verdict === 'ok' ? 'consistent' : '')}${act}</div>`;
      }
      return cardHtml(s, c, { extra });
    }).join('')}`;
    else if (s.phase === 'vote') {
      const n = Object.keys(s.votes).length;
      board = `<div class="phase">🗳️ Vote — ${n} of ${s.participants.length} voted.</div>${cands.map((c) => {
        const votes = Object.entries(s.votes).filter(([, v]) => v === c.id).map(([k]) => k);
        const extra = `<div class="v-actions" style="margin-top:8px"><button class="${s.votes[me] === c.id ? 'on' : ''}" data-act="vote" data-card="${c.id}">${s.votes[me] === c.id ? '✓ your vote' : 'vote'}</button> <span class="small muted">${votes.length ? votes.map(esc).join(', ') : ''}</span></div>`;
        return cardHtml(s, c, { extra });
      }).join('')}${n ? '<button class="ghost small" data-act="close-vote">close the vote now</button>' : ''}`;
    } else if (s.phase === 'tiebreak') board = `<div class="phase">🎲 Tiebreak between ${s.tied.length} — answer the bot in the chat.</div>${cands.map((c) => cardHtml(s, c, { winner: s.tied.includes(c.id) })).join('')}`;
    else if (s.phase === 'approval') {
      const w = state.cards[s.winner];
      const yes = Object.values(s.approvals).filter(Boolean).length;
      const mineA = s.approvals[me];
      board = `<div class="phase">👍 Approval — ${yes} of ${majority(s)} needed.</div>${w ? cardHtml(s, w, { winner: true, extra: `<div class="v-actions" style="margin-top:8px"><button class="${mineA === true ? 'on' : ''}" data-act="approve" data-yes="1">👍 Approve</button><button class="${mineA === false ? 'on' : ''}" data-act="approve" data-yes="0">👎 Not yet</button> <span class="small muted">${Object.entries(s.approvals).map(([k, v]) => `${esc(k)} ${v ? '👍' : '👎'}`).join(' · ')}</span></div>` }) : ''}
        ${cands.filter((c) => c.id !== s.winner).map((c) => cardHtml(s, c)).join('')}`;
    } else if (s.phase === 'wrapping') board = '<div class="phase">📋 The bot is writing the recap…</div>';

    return `${board ? `<div class="board">${board}</div>` : ''}
      ${promoted.length ? `<div class="ph">Promoted</div>${promoted.map((c) => cardHtml(s, c)).join('')}` : ''}
      <div class="ph">Idea cards <span>${active.length}</span></div>
      ${active.length ? active.map((c) => cardHtml(s, c)).join('') : '<div class="empty small">Nothing yet. Everything the team says becomes a card here.</div>'}
      ${!closed ? `<div class="addcard"><input id="newcard" placeholder="add your own card…" maxlength="120"><button data-act="add-card">＋</button></div>` : ''}
      ${parked.length ? `<div class="ph"><button class="ghost small" data-act="toggle" data-sec="showParked">${ui.showParked ? '▾' : '▸'} Parked <span>${parked.length}</span></button></div>${ui.showParked ? parked.map((c) => cardHtml(s, c)).join('') : ''}` : ''}
      ${discarded.length ? `<div class="ph"><button class="ghost small" data-act="toggle" data-sec="showDiscarded">${ui.showDiscarded ? '▾' : '▸'} Discarded <span>${discarded.length}</span></button></div>${ui.showDiscarded ? discarded.map((c) => cardHtml(s, c)).join('') : ''}` : ''}
      ${!closed && s.phase === 'play' ? `<div class="wrapline"><button class="ghost small" data-act="wrap">🔒 Wrap up session</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- actions
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const sid = route().id;
    const s = state.sessions[sid];
    switch (act) {
      case 'noop': return;
      case 'rename': { const v = prompt('Your name:', me); if (v && v.trim()) { me = v.trim().slice(0, 40); localStorage.setItem('pi.name', me); render(); } return; }
      case 'type': ui.newType = b.dataset.type; return renderHome();
      case 'create': {
        const r = await api('/api/session', { type: ui.newType, topic: ui.topic, seed: ui.seed });
        if (r.ok) { ui.topic = ''; ui.seed = ''; location.hash = `#s/${r.id}`; }
        return;
      }
      case 'reset': if (confirm('Reset the whole demo? Sessions, cards and promotions are deleted.')) { await api('/api/reset'); location.hash = ''; } return;
      case 'join': return api(`/api/session/${sid}/join`);
      case 'pers': {
        if (b.dataset.key === 'custom' && !ui.customText && !s.personality.custom) { await api(`/api/session/${sid}/personality`, { key: 'custom', custom: '' }); return; }
        return api(`/api/session/${sid}/personality`, { key: b.dataset.key, custom: ui.customText || s.personality.custom });
      }
      case 'pers-custom': { const v = $('#custom')?.value.trim(); if (!v) return toast('describe the bot in one line'); ui.customText = v; return api(`/api/session/${sid}/personality`, { key: 'custom', custom: v }); }
      case 'start': return api(`/api/session/${sid}/start`);
      case 'send': return send();
      case 'pick': return api(`/api/session/${sid}/message`, { text: b.dataset.text });
      case 'stage': return api(`/api/session/${sid}/stage`, { dir: Number(b.dataset.dir) });
      case 'mini': return api(`/api/session/${sid}/mini`, { round: b.dataset.round, card: b.dataset.card || undefined });
      case 'round-close': return api(`/api/session/${sid}/round-close`);
      case 'react': return api(`/api/card/${b.dataset.card}/react`, { value: b.dataset.value });
      case 'status': return api(`/api/card/${b.dataset.card}/status`, { status: b.dataset.status });
      case 'dismiss': return api(`/api/card/${b.dataset.card}/dismiss-flag`, { reason: 'We know, it’s intentional' });
      case 'call-vote': return api(`/api/session/${sid}/call-vote`);
      case 'vote': return api(`/api/session/${sid}/vote`, { card: b.dataset.card });
      case 'close-vote': return api(`/api/session/${sid}/close-vote`);
      case 'approve': return api(`/api/session/${sid}/approve`, { yes: b.dataset.yes === '1' });
      case 'wrap': if (confirm('Wrap up? The bot posts a recap and the session becomes read-only.')) return api(`/api/session/${sid}/wrap`); return;
      case 'add-card': { const inp = $('#newcard'); const title = inp?.value.trim(); if (!title) return; inp.value = ''; return api('/api/card', { session: sid, title }); }
      case 'toggle': ui[b.dataset.sec] = !ui[b.dataset.sec]; return render();
    }
  });
  app.addEventListener('keydown', (e) => { if (e.target.id === 'newcard' && e.key === 'Enter') { e.preventDefault(); e.target.nextElementSibling.click(); } });
})();
