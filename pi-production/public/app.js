// π production system — vanilla client. The home page is the projects; a project opens on #p/<id>
// with its four sections as tabs (Brainstorm · References · Script · Production); the pill is the project itself. State arrives whole over SSE and every render is morphed into the DOM
// (keyed by data-key) so a focused field, its caret and open menus survive other people's changes.
// Sections (Brainstorm, later Script) register themselves on window.PI.sections and draw inside the shell.
(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  let S = null; // { projects, overview, brainstorm, config, botOnline }

  // ?as=Name gives one tab its own identity (to play two people in one browser)
  const asParam = new URLSearchParams(location.search).get('as');
  if (asParam) sessionStorage.setItem('pi.production.name', asParam.trim().slice(0, 40));
  let me = sessionStorage.getItem('pi.production.name') || localStorage.getItem('pi.name') || '';

  const ui = { menu: null, creating: false, newName: '', joined: new Set(), focus: null, edit: null, parts: {}, top: false };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const day = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const hm = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const initials = (n) => esc(String(n).slice(0, 1).toUpperCase());
  // history lines imported from the old demos start with an emoji; the app speaks in words
  const clean = (t) => String(t || '').replace(/^(?:[\p{Extended_Pictographic}\u2190-\u21ff\u2900-\u297f\u2b00-\u2bff\uff0b\u2702-\u27bf\ufe0f\u200d]+\s*)+/u, '');
  // where a promoted card landed (lib/script.mjs land()): a link into the script's scene or the Bible's tab
  const landedHref = (pid, l) => (!l ? '' : l.section === 'references' && l.ref ? `#p/${pid}/references/${l.kind || 'characters'}/${l.ref}` : l.section === 'script' && l.scene ? `#p/${pid}/script/write/${l.draft}:${l.scene}` : l.section === 'bible' ? `#p/${pid}/script/bible/${{ facts: 'facts', character: 'characters' }[l.what] || 'notes'}` : '');
  const landedText = (l) => (!l ? '' : l.state === 'used' ? `Used in ${l.place || 'the script'}.` : l.state === 'removed' ? `Set aside${l.place ? ` (it waited in ${l.place})` : ''}.` : l.say || (l.how ? `${l.how[0].toUpperCase()}${l.how.slice(1)}.` : ''));
  const landedLink = (pid, l) => { const t = landedText(l); if (!t) return ''; const h = landedHref(pid, l); return h ? `<a class="landed" href="${h}">${ic('check', 's')}${esc(t)}</a>` : `<span class="landed">${ic('check', 's')}${esc(t)}</span>`; };
  let toastTimer;
  const toast = (t) => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.hidden = true), 3200); };

  // ---------------------------------------------------------------- icons (inline SVG, 24-grid, strokes)
  const ICONS = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    spark: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2"/><circle cx="12" cy="12" r="3"/>',
    script: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bulb: '<path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.7.6-1.2 1.5-1.5 2.5h-4c-.3-1-.8-1.9-1.5-2.5z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    clapper: '<path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 11 3.3 8.4A1 1 0 0 1 4 7.2l13.5-3.6a1 1 0 0 1 1.2.7L19.4 7M7 10.2l2.4-3.6M12 8.9l2.4-3.6"/>',
    message: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
    tag: '<path d="M12 3H5a2 2 0 0 0-2 2v7l9.3 9.3a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1"/>',
    thumb: '<path d="M7 10v11H4V10zM7 10l4.4-7a1.8 1.8 0 0 1 3.3 1.1L14 10h5a2 2 0 0 1 2 2.4l-1.5 6.9a2 2 0 0 1-2 1.7H7"/>',
    flame: '<path d="M12 22c4.4 0 7-2.9 7-7 0-3-1.6-5.2-3.5-7-.3 2-1.2 3-2.5 3.5.5-3-1-6-4-8.5 0 3-1.5 4.5-3 6.5S4 12.5 4 15c0 4.1 3.6 7 8 7z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
    skull: '<path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.3 4.9 3.3 6.3V19a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2v-2.7A8 8 0 0 0 12 2z"/><circle cx="9" cy="11" r="1.3"/><circle cx="15" cy="11" r="1.3"/><path d="M10.5 16.5h3"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    scale: '<path d="M12 3v18M4 7h16M6 7l-3 7a4 4 0 0 0 6 0zM18 7l-3 7a4 4 0 0 0 6 0zM8 21h8"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    sparkle: '<path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z"/><path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    columns: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="11" rx="1.5"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v1a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7M12 12v5"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    refs: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l2.5 2.5M14.5 8.5 17 11"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    wave: '<path d="M3 12h1.5M7 9v6M10.5 5v14M14 8v8M17.5 10.5v3M21 12h-.5"/>',
    play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
    playpause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    merge: '<path d="M6 3v6a6 6 0 0 0 6 6h6M6 21v-6M15 12l3 3-3 3"/>',
  };
  const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const TYPE = { idea: 'bulb', arc: 'compass', character: 'user', scene: 'clapper', dialogue: 'message' };
  // the project's four sections, as tabs; the Overview opens from the project's pill
  const SECTIONS = [
    { key: 'brainstorm', name: 'Brainstorm', icon: 'spark' },
    { key: 'references', name: 'References', icon: 'refs' },
    { key: 'script', name: 'Script', icon: 'script' },
    { key: 'production', name: 'Production', icon: 'film' },
  ];
  const STAGES = [['brainstorm', 'Brainstorm'], ['references', 'References'], ['script', 'Script'], ['production', 'Production']];
  const COLORS = [['#1b36a8', 'cobalt'], ['#0b6b78', 'teal'], ['#0f6b4a', 'forest'], ['#5b2a86', 'plum'], ['#8a1c3a', 'wine'], ['#a3401f', 'rust'], ['#8a6100', 'ochre'], ['#2b2b2e', 'graphite']];
  const DEFAULT_COLOR = COLORS[0][0];
  const colorOf = (p) => p.color || DEFAULT_COLOR;

  // the mark: a flat pie, one wedge per stage of the pipeline, each filled as far as that stage has come
  function pie(progress = {}, color = DEFAULT_COLOR, size = 56) {
    const N = STAGES.length, R = 28, c = 28;
    const xy = (a) => { const r = ((a - 90) * Math.PI) / 180; return [(c + R * Math.cos(r)).toFixed(2), (c + R * Math.sin(r)).toFixed(2)]; };
    const wedge = (a0, a1, fill) => { if (a1 - a0 <= 0.01) return ''; const [x0, y0] = xy(a0), [x1, y1] = xy(a1); return `<path d="M${c} ${c}L${x0} ${y0}A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}Z" fill="${fill}"/>`; };
    let body = '';
    STAGES.forEach(([k], i) => {
      const a0 = (i * 360) / N, a1 = ((i + 1) * 360) / N;
      const f = Math.max(0, Math.min(1, Number(progress[k]) || 0));
      body += wedge(a0, a1, 'var(--pie-off)') + wedge(a0, a0 + (a1 - a0) * f, color);
    });
    const title = STAGES.map(([k, n]) => `${n} ${Math.round((progress[k] || 0) * 100)}%`).join(' · ');
    const ring = `<circle cx="${c}" cy="${c}" r="${R - 0.75}" fill="none" stroke="${color}" stroke-width="1.5" opacity=".9"/>`;
    return `<svg class="pie" viewBox="0 0 56 56" width="${size}" height="${size}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}${ring}</svg>`;
  }

  async function api(path, data = {}) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who: me, ...data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error || 'error');
    return j;
  }

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
      if (key) { match = keyed.get(key) || null; keyed.delete(key); if (match && match.tagName !== nk.tagName) { match.remove(); match = null; } }
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
    if (tag === 'svg' || tag === 'SVG') { if (from.innerHTML !== to.innerHTML) from.innerHTML = to.innerHTML; return; }
    morphChildren(from, to);
  }

  // ---------------------------------------------------------------- routes + live
  const route = () => {
    const m = location.hash.match(/^#p\/([^/]+)(?:\/([a-z]+)(?:\/(.*))?)?$/);
    if (!m) return { place: 'home' };
    const section = m[2] || 'overview';
    const sub = m[3] || '';
    const sm = sub.match(/^s\/([a-z0-9]+)/);
    return { place: 'project', id: m[1], section, sub, session: sm ? sm[1] : null };
  };
  let es = null, esKey = '';
  function connect() {
    const r = route();
    const section = ['script', 'references', 'production'].includes(r.section) ? r.section : ''; // big states: only their own tabs get them
    const key = `${me}|${r.id || ''}|${r.session || ''}|${section}`;
    if (es && esKey === key) return;
    es?.close(); esKey = key;
    es = new EventSource(`/events?who=${encodeURIComponent(me)}&project=${encodeURIComponent(r.id || '')}&session=${encodeURIComponent(r.session || '')}&section=${section}`);
    es.onmessage = (e) => {
      S = JSON.parse(e.data);
      const sec = PI.sections[route().section];
      if (sec?.onState && sec.onState(S, ctxOf()) === false) return; // e.g. mid-drag: the section renders when it's done
      render();
    };
    es.onerror = () => toast('connection lost — is the server running?');
    if (r.id && !ui.joined.has(r.id)) { ui.joined.add(r.id); api(`/api/projects/${r.id}/join`); } // opening a project puts you in it
  }
  window.addEventListener('hashchange', () => { ui.menu = null; ui.creating = false; ui.edit = null; ui.top = true; if (me) connect(); render(); });

  // ---------------------------------------------------------------- render
  const menu = (id, items, cls = '') => (ui.menu === id ? `<div class="menu ${cls}" data-key="m-${id}">${items.filter(Boolean).join('')}</div>` : '');
  const mi = (act, icon, label, data = {}, cls = '') => `<button class="mi ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${icon ? ic(icon, 's') : ''}${label}</button>`;
  const menuBtn = (id, icon = 'more', title = 'more', cls = '') => `<button class="icon ${cls} ${ui.menu === id ? 'on' : ''}" data-act="menu" data-menu="${id}" title="${title}">${ic(icon)}</button>`;
  const more = (extra = []) => `<div class="menuwrap" data-key="more">${menuBtn('more')}${menu('more', [mi('rename', 'user', `You are <b>${esc(me)}</b> · change`), ...extra], 'right')}</div>`;
  const ctxOf = () => { const r = route(); return { r, S, P: S?.overview?.project, O: S?.overview, B: S?.brainstorm, C: S?.config, SC: S?.script, SCC: S?.scriptConfig, me, pid: r.id }; };

  function render() {
    if (!me) return renderGate();
    if (!S) return;
    const r = route();
    let html;
    if (r.place === 'project') {
      if (S.overview?.missing) { location.hash = ''; return; }
      if (!S.overview || S.overview.project.id !== r.id) return; // the stream for this project is still connecting
      app.style.setProperty('--tint', colorOf(S.overview.project));
      const sec = PI.sections[r.section];
      if (sec) {
        const ctx = ctxOf();
        const c = sec.chrome(ctx) || {};
        document.title = `π · ${S.overview.project.name} · ${c.title || r.section}`;
        html = topBar(S.overview, r.section, c) + `<div class="view ${c.viewClass || ''}" data-key="view-${r.section}-${c.viewKey || ''}">${sec.body(ctx)}</div>`;
      } else {
        document.title = `π · ${S.overview.project.name}`;
        html = topBar(S.overview, 'overview', {}) + `<div class="view" data-key="view-overview">${overviewPage(S.overview)}</div>`;
      }
    } else {
      document.title = 'π · Projects';
      app.style.setProperty('--tint', DEFAULT_COLOR);
      html = homeView();
    }
    const y = ui.top ? 0 : window.scrollY;
    ui.top = false;
    morph(app, html);
    window.scrollTo(0, y);
    if (r.place === 'project') PI.sections[r.section]?.post?.(ctxOf());
    if (ui.focus) { const el = app.querySelector(ui.focus); ui.focus = null; if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); } }
  }

  function renderGate() {
    app.innerHTML = `<div class="gate"><div class="pi">π</div><h1>Who are you?</h1><div class="sub">The name the others will see.</div>
      <form id="gate"><input id="gname" placeholder="your name" autofocus maxlength="40"><button class="primary">Enter</button></form></div>`;
    app.querySelector('#gate').onsubmit = (e) => {
      e.preventDefault();
      const v = app.querySelector('#gname').value.trim(); if (!v) return;
      me = v; localStorage.setItem('pi.name', v); if (asParam) sessionStorage.setItem('pi.production.name', v);
      app.innerHTML = '<div class="loading">connecting…</div>'; connect();
    };
  }

  // the shell's header. Row 1: π · the project (pill: Overview, other projects) · the four sections · people ⋯
  // Row 2: the section's own controls (its left · its tabs · its right side), as each section's chrome() gives them.
  function topBar(O, section, c) {
    const P = O.project;
    const sec = SECTIONS.find((s) => s.key === section) || null;
    // the other projects, each opening in the section you're in now (a session or a scene doesn't carry over)
    const r = route();
    const [p1, p2] = (r.sub || '').split('/');
    const same = r.section === 'script' && ['write', 'board', 'shots', 'promoted', 'history', 'bible'].includes(p1) ? `/script/${p1}${['promoted', 'history', 'bible'].includes(p1) && p2 && !p2.includes(':') ? `/${p2}` : ''}`
      : r.section === 'brainstorm' ? `/brainstorm${['history', 'promoted'].includes(p1) ? `/${p1}` : ''}`
      : r.section === 'references' ? `/references${['characters', 'props', 'locations'].includes(p1) ? `/${p1}` : ''}`
      : r.section === 'production' ? `/production${p1 === 'sound' ? '/sound' : ''}`
      : '';
    const busy = (x) => x.pulse.liveSessions.length || x.pulse.openSeshes.length;
    const projects = S.projects.map((x) => x.id === P.id
      ? `<span class="mi proj cur">${pie(x.pulse.progress, colorOf(x), 18)}<span class="pjn">${esc(x.name)}</span><span class="msub">here</span></span>`
      : `<a class="mi proj" href="#p/${esc(x.id)}${same}" data-act="go">${pie(x.pulse.progress, colorOf(x), 18)}<span class="pjn">${esc(x.name)}</span>${busy(x) ? '<span class="dot" title="something is live"></span>' : ''}</a>`);
    const people = c.people !== undefined ? c.people : `<span class="people" data-key="people">${O.people.map((p) => `<span class="av ${p.name === me ? 'me' : ''}" title="${esc(p.name)}${p.name === me ? ' (you)' : ''}">${initials(p.name)}</span>`).join('')}</span>`;
    const tabs = SECTIONS.map((s) => `<a class="tab ${s.key === section ? 'on' : ''}" href="#p/${esc(P.id)}/${s.key}" data-act="go" data-key="tab-${s.key}" title="${esc(s.name)}">${ic(s.icon)}<span class="tl2">${esc(s.name)}</span></a>`).join('');
    const row1 = `<header class="top" data-key="top">
        <div class="tl"><a class="logo" href="#" title="all projects">π</a>
          <div class="menuwrap" data-key="pill"><button class="pill ${ui.menu === 'sections' ? 'on' : ''}" data-act="menu" data-menu="sections" title="${esc(P.name)}: the overview, other projects">${pie(O.pulse.progress, colorOf(P), 22)}<span class="pn">${esc(P.name)}</span>${ic('chevron', 'chev')}</button>
          ${menu('sections', [`<a class="mi ${section === 'overview' ? 'cur' : ''}" href="#p/${esc(P.id)}" data-act="go">${ic('grid', 's')}Overview</a>`, '<div class="msep"></div>', `<div class="mlabel">Projects${sec ? ` <span class="mlsub">· opens in ${esc(sec.name)}</span>` : ''}</div>`, ...projects, `<a class="mi" href="#" data-act="go">${ic('grid', 's')}All projects</a>`], 'pillmenu')}</div></div>
        <nav class="tabs" data-key="tabs">${tabs}</nav>
        <div class="tr">${people}${more([
          ...(c.more || []),
          '<div class="msep"></div>',
          mi('edit-open', 'edit', 'Edit name & colour', { id: P.id }),
          `<a class="mi" href="/api/projects/${esc(P.id)}/export" data-act="noop">${ic('download', 's')}Export the project (JSON)</a>`,
          `<a class="mi" href="#" data-act="go">${ic('back', 's')}All projects</a>`,
          '<div class="msep"></div>',
          mi('delete', 'trash', 'Delete this project…', { id: P.id, name: P.name }, 'danger'),
        ])}</div>
      </header>`;
    const row2 = sec ? `<div class="sub" data-key="sub"><div class="sl">${c.left || ''}</div><nav class="segs" data-key="segs">${c.center || ''}</nav><div class="sr">${c.right || ''}</div></div>` : '';
    return `<div class="head" data-key="head">${row1}${row2}</div>`;
  }

  // ---------------------------------------------------------------- home: the projects
  function pulseBits(p) {
    const bits = [];
    const live = p.pulse.liveSessions.length;
    const rounds = p.pulse.liveSessions.filter((s) => s.roundOpen).length;
    if (live) bits.push(`${plural(live, 'brainstorm')} live${rounds ? `, ${rounds === 1 ? 'a round' : `${rounds} rounds`} waiting` : ''}`);
    if (p.pulse.lobbies) bits.push(`${p.pulse.lobbies} about to start`);
    if (p.pulse.openSeshes.length) bits.push('a script sesh open');
    if (p.pulse.pendingJobs) bits.push('waiting for the bot');
    return bits;
  }
  function cardHtml(p) {
    const bits = pulseBits(p);
    const menuId = `card:${p.id}`;
    const last = p.pulse.lastEvent;
    return `<div class="card" role="link" tabindex="0" data-act="open" data-id="${esc(p.id)}" data-key="pc-${esc(p.id)}" style="--tint:${esc(colorOf(p))}">
      ${pie(p.pulse.progress, colorOf(p))}
      <div><div class="cname">${esc(p.name)}</div>${p.logline ? `<div class="cline muted" style="margin-top:4px">${esc(p.logline)}</div>` : ''}</div>
      <div class="cline">${bits.length ? '<span class="dot"></span>' : ''}<span>${bits.length ? bits.join(' · ') : 'quiet'}</span></div>
      <div class="cfoot"><span class="minis">${p.people.map((n) => `<span class="mini" title="${esc(n)}">${initials(n)}</span>`).join('')}</span><span>${last ? `${last.who ? `${esc(last.who)} ` : ''}${esc(clean(last.text))} · ${ago(last.ts)}` : `started ${ago(p.created_at)}`}</span></div>
      <div class="cmenu menuwrap ${ui.menu === menuId ? 'open' : ''}">${menuBtn(menuId)}
        ${menu(menuId, [mi('edit-open', 'edit', 'Edit name & colour', { id: p.id }), `<a class="mi" href="/api/projects/${esc(p.id)}/export" data-act="noop">${ic('download', 's')}Export (JSON)</a>`, '<div class="msep"></div>', mi('delete', 'trash', 'Delete this project…', { id: p.id, name: p.name }, 'danger')], 'right')}</div>
    </div>`;
  }
  function homeView() {
    const n = S.projects.length;
    const newCard = ui.creating
      ? `<form class="card newform" data-act="create" data-key="newcard"><div class="lbl2">A new project</div><input data-newname placeholder="Name the film" value="${esc(ui.newName)}" maxlength="80" autocomplete="off"><div class="acts"><button class="primary">Create</button><button type="button" class="ghost" data-act="create-x">Cancel</button></div></form>`
      : `<button class="card new" data-act="create-open" data-key="newcard"><span class="plus">${ic('plus', 'l')}</span><span>New project</span></button>`;
    return `<div class="head" data-key="head"><header class="top" data-key="top"><div class="tl"><a class="logo" href="#">π</a><span class="roomname">Projects</span></div><nav class="tabs"></nav><div class="tr">${more()}</div></header></div>
      <div class="view" data-key="view-home"><main class="home">
        <div class="hhead"><div><h1>Projects</h1><div class="sub">${n ? `${plural(n, 'film')} in the making` : 'Each film is a project: its own brainstorm, script and bible, in one folder.'}</div></div></div>
        <div class="grid">${S.projects.map(cardHtml).join('')}${newCard}</div>
      </main></div>`;
  }

  // ---------------------------------------------------------------- a project: the overview
  function editor(P) {
    const e = ui.edit;
    return `<section class="editor" data-key="editor">
      <div class="erow"><label>Name</label><input data-edit="name" value="${esc(e.name)}" maxlength="80"></div>
      <div class="erow"><label>Logline</label><input data-edit="logline" value="${esc(e.logline)}" maxlength="300" placeholder="one line, if there is one yet"></div>
      <div class="erow"><label>Colour</label><div class="swatches">${COLORS.map(([hex, n]) => `<button type="button" class="sw ${e.color === hex ? 'on' : ''}" data-act="edit-color" data-color="${hex}" style="--sw:${hex}" title="${n}"><span></span></button>`).join('')}</div></div>
      <div class="eacts"><button class="primary" data-act="edit-save">Save</button><button class="ghost" data-act="edit-x">Cancel</button><span class="grow"></span><span class="muted small">${pie(S.overview.pulse.progress, e.color, 28)} how it will look</span></div>
    </section>`;
  }

  // the parts of a project's page: one quiet row each, opened on click (which ones are open is remembered per project)
  const partsKey = (pid) => `pi.overview.open.${pid}`;
  const openParts = (pid) => { if (!ui.parts[pid]) { let v = null; try { v = JSON.parse(localStorage.getItem(partsKey(pid)) || 'null'); } catch {} ui.parts[pid] = new Set(Array.isArray(v) ? v : []); } return ui.parts[pid]; };
  function togglePart(pid, key) {
    const set = openParts(pid);
    if (set.has(key)) set.delete(key); else set.add(key);
    try { localStorage.setItem(partsKey(pid), JSON.stringify([...set])); } catch {}
    render();
  }
  const part = (pid, key, icon, title, summary, body, link = '', live = false) => {
    const open = openParts(pid).has(key);
    return `<section class="part ${open ? 'open' : ''}" data-key="part-${key}" id="part-${key}">
      <div class="phead" data-act="part-toggle" data-part="${key}" role="button" tabindex="0" aria-expanded="${open}">
        ${ic(icon)}<span class="pt">${title}</span>${live ? '<span class="dot"></span>' : ''}<span class="psum">${summary}</span><span class="grow"></span>${link ? `<a class="h2link" href="${link}" data-act="noop">Open ›</a>` : ''}${ic('chevron', 's pchev')}
      </div>
      ${open ? `<div class="pbody">${body}</div>` : ''}
    </section>`;
  };

  function overviewPage(O) {
    const P = O.project;
    const pr = O.pulse.progress;
    const last = O.events[0];
    const stageline = STAGES.map(([k, n]) => `<span class="stg ${pr[k] >= 1 ? 'done' : pr[k] > 0 ? 'on' : ''}"><i></i>${n}${pr[k] > 0 && pr[k] < 1 ? ` <em>${Math.round(pr[k] * 100)}%</em>` : ''}</span>`).join('');
    return `<section class="hero" data-key="hero">
        <div class="heromark">${pie(pr, colorOf(P), 96)}</div>
        <div class="herob">
          <h1>${esc(P.name)}</h1>
          ${P.logline ? `<p class="lead">${esc(P.logline)}</p>` : '<p class="lead faint">No logline yet.</p>'}
          <div class="stages">${stageline}</div>
          <div class="herometa"><span class="people">${O.people.map((p) => `<span class="av ${p.name === me ? 'me' : ''}" title="${esc(p.name)}">${initials(p.name)}</span>`).join('')}</span><span class="muted small">${O.people.map((p) => esc(p.name)).join(', ')} · started ${day(P.created_at)}${last ? ` · last ${ago(last.ts)}` : ''}</span></div>
        </div>
      </section>
      ${ui.edit ? editor(P) : ''}
      <main class="page" data-key="page">${overviewBody(O)}</main>`;
  }

  function overviewBody(O) {
    const P = O.project;
    const pid = P.id;
    const sc = O.script;
    const bs = `#p/${esc(pid)}/brainstorm`;
    const liveN = O.sessions.filter((s) => s.status === 'live').length;
    const rounds = O.sessions.filter((s) => s.roundOpen).length;
    const sess = O.sessions.map((s) => `<a class="row" href="${bs}/s/${esc(s.id)}">${ic(TYPE[s.type] || 'tag')}<span class="tt"><b>${esc(s.topic)}</b><span class="muted small">${esc(s.type)} · ${s.participants.map(esc).join(', ') || '—'}${s.status === 'live' ? ` · stage ${s.stage + 1} · ${plural(s.cards, 'card')}${s.roundOpen ? ' · a round is open' : ''}` : ''}</span></span><span class="live ${s.status === 'live' ? 'on' : ''}"><span class="dot ${s.status === 'live' ? '' : 'off'}"></span>${s.status === 'live' ? 'live' : 'lobby'}</span></a>`).join('');
    const placed = sc ? sc.scenes.filter((x) => x.placed) : [];
    const locked = placed.filter((x) => x.locked).length;
    const scenes = sc ? sc.scenes.map((x, i) => `<a class="scn ${x.placed ? '' : 'unplaced'}" href="#p/${esc(pid)}/script/write/${esc(sc.draft)}:${esc(x.id)}"><span class="n">${x.placed ? i + 1 : '–'}</span><span class="t">${esc(x.title)}${x.locked ? ic('lock') : ''}</span><span class="m">${plural(x.blocks, 'line')}${x.shots ? ` · ${plural(x.shots, 'shot')}` : ''}</span></a>`).join('') : '';
    const last = O.events[0];
    return [
      part(pid, 'live', 'pulse', 'Live now',
        O.sessions.length ? `${plural(O.sessions.length, 'session')}${rounds ? ` · ${rounds === 1 ? 'a round' : `${rounds} rounds`} waiting` : ''}` : `nothing live${O.closedSessions ? ` · ${O.closedSessions} wrapped` : ''}`,
        sess ? `<div class="rows">${sess}</div>` : `<div class="quiet">Nothing is live. <a href="${bs}">Start a brainstorm ›</a></div>`, bs, liveN > 0),
      part(pid, 'script', 'script', 'Script',
        sc ? `${plural(placed.length, 'scene')} · ${locked} locked${sc.openSeshes.length ? ' · a sesh open' : ''}` : 'not started',
        sc ? `<div class="scenes">${scenes}</div><div class="muted small pnote">${plural(sc.versions, 'version')} of Main · ${plural(sc.drafts, 'draft')}${sc.openSeshes.length ? ` · sesh “${esc(sc.openSeshes[0].title)}” open` : ''}</div>` : `<div class="quiet">No script yet. <a href="#p/${esc(pid)}/script">Start it ›</a></div>`, `#p/${esc(pid)}/script`),
      part(pid, 'promoted', 'check', 'Promoted',
        O.promoted.length ? `${plural(O.promoted.length, 'card')}${O.promoted.some((c) => !c.landed) ? ` · ${O.promoted.filter((c) => !c.landed).length} to send` : ''}` : 'nothing yet',
        O.promoted.length ? O.promoted.map((c) => `<div class="pcard"><div class="pctop"><b>${esc(c.title)}</b><span class="tag tint">→ ${esc(c.promoted_to)}</span><span class="grow"></span><a class="muted small" href="#p/${esc(pid)}/brainstorm/s/${esc(c.session)}">from “${esc(c.topic)}”${c.sparked_by ? ` · ${esc(c.sparked_by)}` : ''}</a></div>${c.landed ? landedLink(pid, c.landed) : `<a class="landed" href="#p/${esc(pid)}/brainstorm/promoted">${ic('send', 's')}Waiting in Promoted, to clean and send</a>`}</div>`).join('') : '<div class="quiet">Nothing promoted yet.</div>', `#p/${esc(pid)}/brainstorm/promoted`),
      part(pid, 'references', 'refs', 'References',
        (() => { const R = O.references || {}; const n = (k) => (R[k] || []).length; const ok = ['character', 'prop', 'location'].reduce((t, k) => t + (R[k] || []).filter((x) => x.status === 'approved').length, 0); return n('character') + n('prop') + n('location') ? `${plural(n('character'), 'character')} · ${plural(n('prop'), 'prop')} · ${plural(n('location'), 'location')}${ok ? ` · ${ok} approved` : ''}` : 'nothing yet'; })(),
        ['character', 'prop', 'location'].some((k) => (O.references?.[k] || []).length) ? `<div class="chips">${['character', 'prop', 'location'].flatMap((k) => (O.references[k] || []).map((x) => `<a class="chip" href="#p/${esc(pid)}/references/${k}s/${esc(x.id)}">${esc(x.name)}${x.status === 'approved' ? ` ${ic('check', 's')}` : ''}</a>`)).join('')}</div>` : '<div class="quiet">Nothing yet.</div>', `#p/${esc(pid)}/references`),
      part(pid, 'bible', 'book', 'The Bible',
        `${plural(O.bible.facts, 'fact')} · ${plural(O.bible.characters.length, 'character')}`,
        `<div class="chips">${O.bible.characters.map((c) => `<span class="chip">${esc(c)}</span>`).join('') || '<span class="quiet">No characters yet.</span>'}</div>${O.bible.exceptions ? `<div class="muted small pnote">${plural(O.bible.exceptions, 'Judge note')} marked as intended</div>` : ''}`, sc ? `#p/${esc(pid)}/script/bible` : ''),
      part(pid, 'lately', 'clock', 'Lately',
        last ? `${last.who ? `${esc(last.who)} ` : ''}${esc(clean(last.text)).slice(0, 70)}${clean(last.text).length > 70 ? '…' : ''} · ${ago(last.ts)}` : 'nothing yet',
        O.events.length ? O.events.map((e) => `<div class="ev"><span class="t">${hm(e.ts)}</span><span class="s">${esc(e.section)}</span><span>${e.who ? `<b>${esc(e.who)}</b> ` : ''}${esc(clean(e.text))}</span></div>`).join('') : '<div class="quiet">Nothing yet.</div>'),
    ].join('');
  }

  // ---------------------------------------------------------------- actions
  app.addEventListener('click', async (e) => {
    if (ui.menu && !e.target.closest('.menuwrap')) { ui.menu = null; render(); }
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'FORM') return;
    const act = b.dataset.act;
    const ds = b.dataset;
    if (act === 'noop') return;
    if (act === 'menu') { e.stopPropagation(); ui.menu = ui.menu === ds.menu ? null : ds.menu; return render(); }
    if (b.classList.contains('mi')) { ui.menu = null; }
    const sec = PI.sections[route().section];
    if (sec?.onClick && (await sec.onClick(e, b, ctxOf()))) return;
    if (act === 'open') { if (e.target.closest('.cmenu')) return; location.hash = `#p/${ds.id}`; return; }
    if (act === 'go') { return render(); } // the link does the rest
    if (act === 'part-toggle') return togglePart(route().id, ds.part);
    if (act === 'create-open') { ui.creating = true; ui.focus = '[data-newname]'; return render(); }
    if (act === 'create-x') { ui.creating = false; ui.newName = ''; return render(); }
    if (act === 'rename') { const v = prompt('Your name:', me); if (v && v.trim()) { me = v.trim().slice(0, 40); localStorage.setItem('pi.name', me); if (sessionStorage.getItem('pi.production.name')) sessionStorage.setItem('pi.production.name', me); ui.joined.clear(); connect(); } return render(); }
    if (act === 'edit-open') {
      const P = S.projects.find((p) => p.id === ds.id) || S.overview?.project;
      ui.edit = { id: ds.id, name: P?.name || '', logline: P?.logline || '', color: P ? colorOf(P) : DEFAULT_COLOR };
      ui.focus = '[data-edit="name"]';
      if (route().id !== ds.id || route().section !== 'overview') { const keep = ui.edit; location.hash = `#p/${ds.id}`; ui.edit = keep; return; }
      return render();
    }
    if (act === 'edit-color') { ui.edit.color = ds.color; return render(); }
    if (act === 'edit-x') { ui.edit = null; return render(); }
    if (act === 'edit-save') {
      const ed = ui.edit; if (!ed) return;
      const r = await api(`/api/projects/${ed.id}/update`, { name: ed.name, logline: ed.logline, color: ed.color });
      if (r.ok) { ui.edit = null; toast('Saved'); render(); }
      return;
    }
    if (act === 'delete') {
      render();
      const typed = prompt(`Delete “${ds.name}”?\nIt moves to the trash folder, nothing is lost for good.\n\nType its name to confirm:`);
      if (typed === null) return;
      if (typed.trim() !== ds.name) return toast('The name didn’t match. Nothing was deleted.');
      const r = await api(`/api/projects/${ds.id}/delete`, { name: typed.trim() });
      if (r.ok) { toast(`“${ds.name}” moved to the trash`); if (route().id === ds.id) location.hash = ''; }
      return;
    }
    render();
  });
  app.addEventListener('keydown', (e) => {
    const t = e.target;
    const sec = PI.sections[route().section];
    if (sec?.onKey?.(e, ctxOf())) return;
    if (e.key === 'Enter' && t.dataset?.act === 'open') { e.preventDefault(); location.hash = `#p/${t.dataset.id}`; }
    if ((e.key === 'Enter' || e.key === ' ') && t.dataset?.act === 'part-toggle') { e.preventDefault(); togglePart(route().id, t.dataset.part); }
    if (e.key === 'Enter' && t.dataset?.edit !== undefined) { e.preventDefault(); app.querySelector('[data-act="edit-save"]')?.click(); }
    if (e.key === 'Escape' && t.dataset?.newname !== undefined) { ui.creating = false; ui.newName = ''; render(); }
    if (e.key === 'Escape' && t.dataset?.edit !== undefined) { ui.edit = null; render(); }
  });
  app.addEventListener('submit', async (e) => {
    const sec = PI.sections[route().section];
    if (sec?.onSubmit && (await sec.onSubmit(e, ctxOf()))) return;
    const f = e.target.closest('[data-act="create"]');
    if (!f) return;
    e.preventDefault();
    const name = ui.newName.trim();
    if (!name) return;
    const r = await api('/api/projects', { name });
    if (r.ok) { ui.newName = ''; ui.creating = false; location.hash = `#p/${r.id}`; }
  });
  app.addEventListener('input', (e) => {
    const t = e.target;
    const sec = PI.sections[route().section];
    if (sec?.onInput?.(e, ctxOf())) return;
    if (t.dataset.newname !== undefined) ui.newName = t.value;
    if (t.dataset.edit !== undefined && ui.edit) ui.edit[t.dataset.edit] = t.value;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.menu) { ui.menu = null; render(); } });

  // what sections can use
  window.PI = { esc, md, ic, plural, ago, hm, day, initials, toast, api, menu, mi, menuBtn, ui, route, render, clean, landedHref, landedText, landedLink, TYPE, sections: {}, me: () => me };
  if (me) connect(); else renderGate();
})();
