// References — the section. Characters · Props · Locations (row 2 of the header), each a gallery of cards; a card
// opens into its room: Look and its parts, Motion and Voice for a character; Object sheet · Scale · States for a prop;
// Layout · Elements · Texture · Light for a location. Generate opens a panel only when asked: 4 options, pick one,
// the rest are made from it. Nothing waits for approval: the owner's Approve locks a version, edits after it make the
// next one, and the shots made with the old one get a quiet Stale line in Production.
(() => {
  const PI = window.PI;
  const { esc, ic, plural, ago, toast, menu, mi, menuBtn } = PI;
  const ui = PI.ui;
  const app = document.getElementById('app');
  const R = () => PI.render();
  const KIND = { characters: 'character', props: 'prop', locations: 'location' };
  const PLURAL = { character: 'characters', prop: 'props', location: 'locations' };
  const ST = { draft: 'Draft', awaiting: 'Awaiting generation', generating: 'Generating', review: 'Review', approved: 'Approved', notused: 'Not used' };
  const SLOT = { front: 'Front', side: 'Side', back: 'Back', top: 'Top', scale: 'Next to a person', layout: 'Layout view' };
  const FIRST = { character: 'front', prop: 'front', location: 'layout' };
  const DEFAULT_EXPR = ['Neutral', 'Happy', 'Angry', 'Sad', 'Scared', 'Surprised'];

  let st = null, pid = null, me = '';
  const fresh = () => ({ attn: false, newForm: false, newName: '', adding: null, gen: null, variant: {}, paused: {}, addVar: null, focus: null });
  let rx = fresh();
  function sync(ctx) { st = ctx.S.refs; me = ctx.me; if (ctx.pid !== pid) { pid = ctx.pid; rx = fresh(); } }
  const base = () => `#p/${esc(pid)}/references`;
  const api = (act, data) => PI.api(`/api/projects/${pid}/refs/${act}`, data);
  const placeOf = () => { const [k, id, tab] = (PI.route().sub || '').split('/'); return { kind: KIND[k] || 'character', kindKey: KIND[k] ? k : 'characters', id: id || null, tab: tab || '' }; };
  const refOf = (id) => st?.refs.find((r) => r.id === id);
  const first = (r) => FIRST[r.kind];
  const v0 = (r) => r.variants[0];
  const vOf = (r) => r.variants.find((v) => v.id === rx.variant[r.id]) || v0(r);
  const status = (r, v = v0(r)) => (r.notUsed ? 'notused' : v.status);
  const stHtml = (k) => `<span class="st s-${k}"><i></i>${ST[k] || k}</span>`;
  const img = (x, alt = '') => (x ? `<img src="${esc(x.url)}" alt="${esc(alt)}" loading="lazy" draggable="false">` : '');
  const kindIcon = (k) => (k === 'character' ? 'user' : k === 'prop' ? 'key' : 'pin');
  const thumbOf = (r) => v0(r).images[first(r)] || null;
  const mthumb = (r) => `<span class="mthumb">${thumbOf(r) ? img(thumbOf(r)) : ic(kindIcon(r.kind), 's')}</span>`;
  const charByKey = (k) => st.refs.find((c) => c.kind === 'character' && c.keys.includes(k));

  // ---------------------------------------------------------------- typing: saved 600 ms after you stop, kept locally until then
  const loc = {}, timers = {};
  function edit(key, act, data) {
    loc[key] = data.value ?? data.text ?? data.line ?? data.delta;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(async () => { const v = loc[key]; await api(act, data); if (loc[key] === v) delete loc[key]; }, 600);
  }
  const lval = (key, server) => loc[key] ?? server ?? '';

  // ---------------------------------------------------------------- sound: one player for the whole app (Production → Sound uses it too)
  const audio = new Audio();
  const media = { playing: null };
  const fmt = (x) => `0:${String(Math.floor(x || 0)).padStart(2, '0')}`;
  audio.addEventListener('ended', () => { media.playing = null; R(); });
  function player(id, m, busy = false) {
    const on = media.playing === id;
    const peaks = m.peaks?.length ? m.peaks : Array.from({ length: 40 }, () => 0.3);
    return `<div class="player ${busy ? 'busy' : ''}" data-key="pl-${id}"><button class="play" data-act="rx-play" data-ref="${id}" data-url="${esc(m.url)}" data-dur="${m.dur || 0}" title="${on ? 'Pause' : 'Play'}" ${busy ? 'disabled' : ''}>${ic(on ? 'playpause' : 'play')}</button><div class="wave" data-act="rx-seek" data-ref="${id}" data-url="${esc(m.url)}" data-dur="${m.dur || 0}" data-wave="${id}">${peaks.map((p) => `<i style="height:${Math.max(6, Math.round(p * 100))}%"></i>`).join('')}</div><span class="ptime" data-ptime="${id}">${fmt(m.dur)}</span></div>`;
  }
  function play(id, url, dur, frac) {
    if (media.playing === id && frac === undefined) { audio.pause(); media.playing = null; return R(); }
    if (media.playing !== id || !audio.src.endsWith(url)) { audio.src = url; audio.currentTime = 0; }
    if (frac !== undefined && dur) audio.currentTime = Math.max(0, Math.min(0.98, frac)) * dur;
    media.playing = id;
    audio.play().catch(() => { media.playing = null; R(); toast('The browser held the sound back. Press play again.'); });
    R();
  }
  (function loop() {
    if (media.playing) {
      const p = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
      app.querySelectorAll(`[data-wave="${media.playing}"]`).forEach((w) => { const k = Math.round(p * w.children.length); [...w.children].forEach((b, i) => b.classList.toggle('past', i < k)); });
      app.querySelectorAll(`[data-ptime="${media.playing}"]`).forEach((el) => { el.textContent = fmt(audio.currentTime); });
    }
    app.querySelectorAll('video[data-clip]').forEach((vd) => { const bar = app.querySelector(`[data-cbar="${vd.dataset.clip}"]`); if (bar && vd.duration) bar.style.width = `${(vd.currentTime / vd.duration) * 100}%`; });
    requestAnimationFrame(loop);
  })();
  async function uploadFile(input) {
    const f = input.files?.[0]; if (!f) return;
    const q = new URLSearchParams({ ref: input.dataset.ref || '', variant: input.dataset.variant || '', slot: input.dataset.slot || '', kind: input.dataset.rxup, who: PI.me() });
    toast(`Uploading ${f.name}…`);
    const r = await fetch(`/api/projects/${PI.route().id}/refs/upload?${q}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f });
    const j = await r.json().catch(() => ({}));
    toast(r.ok ? 'Uploaded.' : j.error || 'The upload didn’t work.');
    input.value = '';
  }
  const upLabel = (cls, text, data) => `<label class="${cls}">${ic('upload', 's')}${text}<input type="file" hidden ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} accept="${data.rxup === 'motion' ? 'video/mp4,video/webm,image/gif' : data.rxup === 'voice' ? 'audio/*' : 'image/*'}"></label>`;
  PI.media = { player, play, fmt, audio, state: media, upLabel };

  // ---------------------------------------------------------------- chrome: row 2 of the header
  function chrome(ctx) {
    sync(ctx);
    if (!st) return { title: 'References', viewClass: 'rx' };
    const pl = placeOf();
    const n = { character: 0, prop: 0, location: 0 };
    st.refs.forEach((r) => n[r.kind]++);
    const seg = (k, label, kk) => `<a class="seg ${pl.kindKey === k ? 'on' : ''}" href="${base()}/${k}">${label} <span class="pnum">${n[kk]}</span></a>`;
    const making = st.refs.some((r) => r.variants.some((v) => v.busy.length) || r.voiceBusy);
    const thinking = st.refs.some((r) => r.describing || r.checking);
    const right = making ? '<span class="aistat" data-key="aistat">making images…</span>' : thinking ? `<span class="aistat" data-key="aistat">${st.botOnline ? 'the AI is filling in…' : 'waiting for the AI (it’s off)'}</span>` : '';
    const r = pl.id && refOf(pl.id);
    return { title: r ? r.name : 'References', center: `${seg('characters', 'Characters', 'character')}${seg('props', 'Props', 'prop')}${seg('locations', 'Locations', 'location')}`, right, viewClass: 'rx', viewKey: pl.id ? `room-${pl.id}` : `g-${pl.kind}` };
  }

  // ---------------------------------------------------------------- the gallery
  function attention(kind) {
    const items = [];
    for (const r of st.refs.filter((x) => x.kind === kind)) {
      const mine = !r.owner || r.owner === me;
      r.variants.forEach((v, i) => {
        const nm = i ? `${r.name} · ${v.name}` : r.name;
        if (v.status === 'awaiting' && mine) items.push([r, v, nm, `${v.range}, waiting to be generated`]);
        else if (v.status === 'review' && mine) items.push([r, v, nm, 'yours to approve']);
        else if (v.status === 'draft' && !i && !r.notUsed && !r.voice_only && mine) items.push([r, v, nm, 'no images yet']);
        if (v.changed) items.push([r, v, nm, `changed since v${v.version}`]);
        if (v.stale) items.push([r, v, nm, `${plural(v.stale, 'shot')} made with an older version`]);
      });
      if (r.check?.notes?.length) items.push([r, v0(r), r.name, 'the Judge has a note']);
      if (r.notUsed) items.push([r, v0(r), r.name, 'not in any placed scene now']);
    }
    if (!items.length) return '';
    const [, , n0, w0] = items[0];
    return `<button class="attn" data-act="rx-attn" data-key="attn"><span class="dot"></span><b>${plural(items.length, 'thing')} to look at</b><span>· ${esc(n0)}: ${esc(w0)}${items.length > 1 ? ` · and ${items.length - 1} more` : ''}</span>${ic('chevron', 'chev')}</button>${rx.attn ? `<div class="attnlist" data-key="attnlist">${items.map(([r, v, n, why], i) => `<a href="${base()}/${PLURAL[r.kind]}/${r.id}" data-act="rx-var" data-ref="${r.id}" data-v="${v.id}" data-key="at-${i}">${mthumb(r)}<b>${esc(n)}</b><span class="why">${esc(why)}</span></a>`).join('')}</div>` : ''}`;
  }
  function cardMenu(r) {
    const same = st.refs.filter((x) => x.kind === r.kind && x.id !== r.id);
    return [
      ...(st.projects.length ? ['<div class="mlabel">Copy to</div>', ...st.projects.map((x) => mi('rx-copy', 'copy', esc(x.name), { ref: r.id, to: x.id, name: x.name }))] : []),
      ...(same.length && r.kind !== 'prop' ? ['<div class="msep"></div>', '<div class="mlabel">The same as…</div>', ...same.slice(0, 12).map((x) => mi('rx-merge', 'merge', esc(x.name), { ref: r.id, into: x.id, name: x.name }))] : []),
      '<div class="msep"></div>', mi('rx-delete', 'trash', 'Delete…', { ref: r.id, name: r.name }, 'danger'),
    ];
  }
  function card(r) {
    const mid = `rxc:${r.id}`;
    const f = thumbOf(r);
    const thumb = r.voice_only ? `<div class="ph">${ic('wave')}</div><span class="vo tag">voice only</span>` : f ? img(f, r.name) : `<div class="ph">${ic(kindIcon(r.kind))}</div>`;
    const areas = r.parts.filter((x) => x.kind === 'area').length;
    const extra = r.variants.length > 1 ? `<span class="tag">+${plural(r.variants.length - 1, 'change')}</span>` : r.kind === 'location' && areas ? `<span class="tag">${plural(areas, 'area')}</span>` : '';
    const ai = (r.ai || []).length || (r.voice_ai || []).length ? '<span class="tag ai">AI-suggested</span>' : '';
    return `<div class="rc ${r.notUsed ? 'off' : ''}" data-act="rx-open" data-ref="${r.id}" data-key="rc-${r.id}" role="link" tabindex="0">
      <div class="frame">${thumb}</div>
      <div class="meta"><span class="nm">${esc(r.name)}</span><span class="ln">${esc(r.line || r.sourceText)}</span><span class="rrow">${stHtml(status(r))}<span class="grow"></span>${extra}${ai}</span></div>
      <div class="cmenu menuwrap ${ui.menu === mid ? 'open' : ''}">${menuBtn(mid)}</div>
      <div class="menuwrap cardmw">${menu(mid, cardMenu(r))}</div>
    </div>`;
  }
  function gallery(pl) {
    const list = st.refs.filter((r) => r.kind === pl.kind);
    const ph = pl.kind === 'character' ? 'Name' : pl.kind === 'prop' ? 'What is it?' : 'The place';
    const nf = rx.newForm ? `<form class="rc newform" data-key="newform" data-rxform="new"><div class="small muted">A new ${pl.kind}</div><input id="rx-new-name" data-rxnew placeholder="${ph}" value="${esc(rx.newName)}" maxlength="80" autocomplete="off"><div class="acts"><button class="primary small">Create</button><button type="button" class="ghost small" data-act="rx-new-x">Cancel</button></div></form>`
      : `<button class="rc new" data-act="rx-new" data-key="newcard"><span class="plus">${ic('plus', 'l')}</span><span>New ${pl.kind}</span></button>`;
    return `<main class="page" data-key="rx-gallery">${attention(pl.kind)}<div class="rgrid ${pl.kind === 'location' ? 'wide' : pl.kind === 'prop' ? 'props' : ''}" data-key="rgrid-${pl.kind}">${list.map(card).join('')}${nf}</div></main>`;
  }

  // ---------------------------------------------------------------- one card's room
  const partsOf = (r, kind) => r.parts.filter((x) => x.kind === kind);
  function slotHtml(r, v, slot, cls = '', label = SLOT[slot] || '') {
    const x = v.images[slot], busy = v.busy.includes(slot), batch = v.batches[slot];
    const lab = label ? `<span class="slab">${esc(label)}</span>` : '';
    const key = `sl-${v.id}-${slot}`;
    const d = { ref: r.id, variant: v.id, slot };
    const dd = `data-ref="${r.id}" data-variant="${v.id}" data-slot="${esc(slot)}"`;
    const up = (text) => upLabel('', text, { rxup: 'image', ...d });
    if (busy) return `<div class="slot working ${cls}" data-key="${key}">${lab}<div class="in">${slot === first(r) && !x ? 'Making 4 options…' : 'Making…'}</div></div>`;
    const waiting = batch ? `<button class="waiting" data-act="rx-gen-open" ${dd}>${plural(batch.images.length, 'option')} to pick from</button>` : '';
    if (x) return `<div class="slot ${cls}" data-key="${key}">${img(x)}${lab}${waiting}<div class="sacts"><button data-act="rx-fix" ${dd}>${ic('edit', 's')}Fix</button><button data-act="rx-gen" ${dd}>${ic('refresh', 's')}Redo</button>${up('Upload')}</div></div>`;
    const hasFirst = !!v.images[first(r)] || (v.startScene && !!v0(r).images[first(r)]);
    const fromWord = first(r) === 'layout' ? 'layout' : 'front';
    if (slot === first(r)) return `<div class="slot empty ${cls}" data-key="${key}">${lab}${waiting}<div class="in"><button class="small" data-act="rx-gen" ${dd}>${ic('sparkle', 's')}Generate</button><span>${v.startScene ? `from the Default ${fromWord}` : '4 options to pick from'}</span>${up('or upload your own')}</div></div>`;
    return `<div class="slot empty ${cls}" data-key="${key}">${lab}${waiting}<div class="in">${hasFirst ? `<button class="small ghost" data-act="rx-gen" ${dd}>${ic('sparkle', 's')}Generate</button>` : `<span>made from the ${fromWord}</span>`}${up('upload')}</div></div>`;
  }
  const fieldRow = (r, list, k, label, value, aiKeys) => {
    const key = `${r.id}:${list}:${k}`;
    return `<div class="fld" data-key="f-${key}"><div class="lb">${esc(label)}${aiKeys.includes(k) ? '<span class="tag ai">AI-suggested</span>' : ''}</div><textarea class="fv" rows="1" data-rxf="${k}" data-list="${list}" data-ref="${r.id}" placeholder="—">${esc(lval(key, value))}</textarea></div>`;
  };
  const fieldsHtml = (r) => `<div class="flds" data-key="flds-${r.id}">${st.config.fields[r.kind].map(([k, l]) => fieldRow(r, 'fields', k, l, r.fields?.[k], r.ai || [])).join('')}</div>`;
  function dirtyLine(r, v) {
    if (!v.changed) return '';
    return `<div class="dirty" data-key="dirty-${v.id}">${ic('alert', 's')}<span><b>${esc(r.name)}</b>${v.startScene ? ` · ${esc(v.name)}` : ''} changed since v${v.version}. Saving makes v${v.version + 1}${v.usedIn.length ? ` and marks ${plural(v.usedIn.length, 'shot')} Stale` : ''}.</span><span class="grow"></span><button class="small primary" data-act="rx-save" data-variant="${v.id}">Save as v${v.version + 1}</button><button class="small ghost" data-act="rx-undo" data-variant="${v.id}">Undo</button></div>`;
  }
  const judgeNote = (r) => (r.check?.notes?.length ? `<div class="judge" data-key="judge-${r.id}"><b>The Judge</b>${r.check.notes.map((n) => `<span>${esc(n)}</span>`).join('')}<span><button class="small ghost" data-act="rx-check-clear" data-ref="${r.id}">Dismiss</button></span></div>` : r.checking ? '<div class="judge" data-key="judge-wait"><span>The Judge is reading it against the Bible…</span></div>' : '');
  const srcLine = (r) => `<div class="srcline" data-key="src-${r.id}">${ic(r.source === 'brainstorm' ? 'spark' : r.source === 'hand' ? 'user' : r.source === 'copy' ? 'copy' : 'script', 's')}<span>${esc(r.sourceText)}</span>${r.describing ? `<span class="faint">· ${st.botOnline ? 'the AI is filling the blanks…' : 'the AI fills the blanks when it’s on'}</span>` : ''}</div>`;
  function usedLine(r, v) {
    const shots = v.usedIn.length ? v.usedIn.map((n) => `<a class="sn" href="#p/${esc(pid)}/production" data-act="go">${esc(n)}</a>`).join('') : '<span class="faint">no shots yet</span>';
    return `<div class="usedin" data-key="used-${r.id}"><span>Used in</span>${shots}<a class="vlink" href="${base()}/${PLURAL[r.kind]}/${r.id}/versions">${v.version ? `v${v.version} · ` : ''}Versions ${ic('history', 's')}</a></div>`;
  }
  function roomHead(r, v) {
    const vs = status(r, v);
    const varMenu = `rxv:${r.id}`, oMenu = `rxo:${r.id}`, rMenu = `rxr:${r.id}`;
    const approve = vs === 'review' ? (!r.owner || r.owner === me ? `<button class="small primary" data-act="rx-approve" data-variant="${v.id}">${ic('check', 's')}Approve</button>` : `<span class="waits">${esc(r.owner)} approves this one</span>`) : '';
    const showVar = !r.voice_only && (r.kind !== 'location' || r.variants.length > 1);
    const variants = showVar ? `<div class="menuwrap" data-key="varpill"><button class="varpill ${v.startScene ? 'alt' : ''}" data-act="menu" data-menu="${varMenu}">${esc(v.name)} <span class="${v.startScene ? '' : 'faint'}">· ${esc(v.range)}</span> ${ic('chevron', 'chev')}</button>
      ${menu(varMenu, ['<div class="mlabel">Lasting changes</div>', ...r.variants.map((x) => mi('rx-variant', '', `${esc(x.name)}<span class="msub">${esc(x.range)} · ${ST[status(r, x)]}</span>`, { ref: r.id, v: x.id }, x.id === v.id ? 'cur' : '')), '<div class="msep"></div>', mi('rx-addvar', 'plus', 'Add a lasting change…', { ref: r.id })])}</div>` : '';
    const more = [
      `<a class="mi" href="${base()}/${PLURAL[r.kind]}/${r.id}/versions">${ic('history', 's')}Versions</a>`,
      mi('rx-describe', 'sparkle', 'Fill the blanks (AI)', { ref: r.id }),
      mi('rx-check', 'scale', 'Ask the Judge', { ref: r.id }),
      r.kind === 'location' && r.variants.length < 2 ? mi('rx-addvar', 'plus', 'Add a lasting change…', { ref: r.id }) : '',
      v.startScene ? mi('rx-var-rename', 'edit', 'Rename this change…', { variant: v.id, name: v.name }) : '',
      v.startScene ? mi('rx-var-remove', 'trash', 'Remove this change', { variant: v.id, name: v.name }) : '',
      r.kind === 'character' ? mi('rx-face', r.voice_only ? 'user' : 'wave', r.voice_only ? 'Give them a face' : 'Make it a voice only', { ref: r.id, off: r.voice_only ? '' : '1' }) : '',
      '<div class="msep"></div>', ...cardMenu(r),
    ];
    return `<a class="backl" href="${base()}/${PLURAL[r.kind]}" data-key="back">${ic('back', 's')}${{ character: 'Characters', prop: 'Props', location: 'Locations' }[r.kind]}</a>
      <div class="rhead" data-key="rhead"><h1>${esc(r.name)}</h1>${stHtml(vs)}${variants}<span class="grow"></span>${approve}
        <div class="menuwrap" data-key="owner"><button class="owner" data-act="menu" data-menu="${oMenu}"><span class="mini ${r.owner === me ? 'me' : ''}">${esc((r.owner || '?').slice(0, 1).toUpperCase())}</span>${esc(r.owner || 'no owner')} · owner</button>${menu(oMenu, ['<div class="mlabel">Who approves it</div>', ...st.people.map((n) => mi('rx-owner', '', esc(n), { ref: r.id, n }, r.owner === n ? 'cur' : ''))], 'right')}</div>
        <div class="menuwrap" data-key="rmore">${menuBtn(rMenu)}${menu(rMenu, more.filter(Boolean), 'right')}</div>
        <div class="rsub"><input class="rline" data-rxline="${r.id}" value="${esc(lval(`${r.id}:line`, r.line))}" placeholder="${esc(r.sourceText)}" maxlength="120" title="the line under the name"></div>
      </div>${rx.addVar === r.id ? addVarForm(r) : ''}`;
  }
  function addVarForm(r) {
    return `<form class="dirty" style="background:var(--hover);color:var(--ink)" data-rxform="addvar" data-ref="${r.id}" data-key="addvar"><b>A lasting change</b>
      <input id="rx-var-name" name="name" placeholder="Name it: Cut cheek, Burned café…" maxlength="60" style="width:200px" autocomplete="off">
      <input name="delta" placeholder="What changes" maxlength="300" style="flex:1;min-width:200px" autocomplete="off">
      <select name="scene" style="font:inherit;padding:8px;border-radius:10px;border:1px solid var(--hair-2)"><option value="unplaced">from…</option>${st.scenes.map((s) => `<option value="${esc(s.id)}">sc. ${s.num} ${esc(s.title)}</option>`).join('')}</select>
      <button class="small primary">Add</button><button type="button" class="small ghost" data-act="rx-addvar-x">Cancel</button>
      <span class="small muted" style="width:100%">Lasting only: a scar, a haircut, ten years older. Wet, crying or muddy stay in the script.</span></form>`;
  }
  const roomTabs = (r, tabs, cur) => `<nav class="segs inroom" data-key="rtabs">${tabs.map(([k, n, c]) => `<a class="seg ${cur === k ? 'on' : ''}" href="${base()}/${PLURAL[r.kind]}/${r.id}${k === 'look' ? '' : `/${k}`}">${n}${c !== undefined ? ` <span class="pnum">${c}</span>` : ''}</a>`).join('')}</nav>`;
  function partTile(r, v, x) {
    const pm = `rxp:${x.id}`;
    const added = x.kind === 'expression' && !DEFAULT_EXPR.includes(x.name) && x.by ? `<div class="td">added by ${esc(x.by)}</div>` : '';
    return `<div class="ptile" data-key="pt-${x.id}">${slotHtml(r, v, `part:${x.id}`, '', '')}<div class="tn">${esc(x.name)}${x.data?.ai ? '<span class="tag ai">AI</span>' : ''}</div>${x.note ? `<div class="td">${esc(x.note)}</div>` : ''}${added}
      <div class="pmenu menuwrap ${ui.menu === pm ? 'open' : ''}">${menuBtn(pm)}${menu(pm, partMenu(x), 'right')}</div></div>`;
  }
  const partMenu = (x) => [mi('rx-part-rename', 'edit', 'Rename…', { part: x.id, name: x.name }), mi('rx-part-note', 'edit', x.kind === 'light' ? 'How it looks…' : 'Note…', { part: x.id, note: x.kind === 'light' ? x.data?.quality || '' : x.note || '' }), '<div class="msep"></div>', mi('rx-part-remove', 'trash', 'Remove', { part: x.id, name: x.name }, 'danger')];
  const addTile = (r, kind, ph, label) => `<div class="ptile add" data-key="add-${kind}">${rx.adding === kind ? `<div class="slot" style="border-style:solid">${ic('plus', 'l')}</div><input id="rx-add-${kind}" data-rxadd="${kind}" data-ref="${r.id}" placeholder="${esc(ph)}" maxlength="60" autocomplete="off">` : `<div class="slot" data-act="rx-add" data-kind="${kind}">${ic('plus', 'l')}</div><div class="tn faint">${esc(label)}</div>`}</div>`;
  const tiles = (r, v, kind, cls, ph, label) => `<div class="tiles ${cls}" data-key="tiles-${kind}">${partsOf(r, kind).map((x) => partTile(r, v, x)).join('')}${addTile(r, kind, ph, label)}</div>`;

  function characterRoom(r, tab) {
    const v = vOf(r);
    const tabs = r.voice_only ? [['look', 'Look'], ['voice', 'Voice']] : [['look', 'Look'], ['expressions', 'Expressions', partsOf(r, 'expression').length], ['outfits', 'Outfits', partsOf(r, 'outfit').length], ['motion', 'Motion'], ['voice', 'Voice']];
    const cur = tabs.some(([k]) => k === tab) ? tab : 'look';
    let body;
    if (cur === 'look' && r.voice_only) {
      body = `<div class="rbody" data-key="look-vo"><div class="voiceonly">${ic('wave')}<div><b>Heard, never seen.</b><br>${esc(r.name)} is only a voice in the script.</div><button class="small" data-act="rx-face" data-ref="${r.id}">${ic('user', 's')}Give them a face</button></div><div>${srcLine(r)}</div></div>`;
    } else if (cur === 'look') {
      const right = v.startScene ? variantFields(r, v) : `${fieldsHtml(r)}${dirtyLine(r, v)}${srcLine(r)}${judgeNote(r)}`;
      body = `<div class="rbody" data-key="look-${v.id}"><div class="sheet">${slotHtml(r, v, 'front', 'big')}${slotHtml(r, v, 'side')}${slotHtml(r, v, 'back')}</div><div>${right}</div></div>`;
    } else if (cur === 'expressions') body = tiles(r, v, 'expression', '', 'exhausted, disgusted…', 'Add an expression');
    else if (cur === 'outfits') body = tiles(r, v, 'outfit', 'outfits', 'work suit, pajamas, night out…', 'Add an outfit');
    else if (cur === 'motion') body = motionTab(r);
    else body = voiceTab(r);
    return `<main class="page" data-key="room-${r.id}">${roomHead(r, v)}${roomTabs(r, tabs, cur)}${body}${usedLine(r, v)}</main>`;
  }
  function variantFields(r, v) {
    const key = `${v.id}:delta`;
    const origin = v.origin?.by === 'judge' ? 'The Judge saw it when the scene was locked in Main' : `Added by ${v.origin?.by || 'someone'}`;
    return `<div class="flds" data-key="vflds-${v.id}">
      <div class="fld"><div class="lb">What changes</div><textarea class="fv" rows="2" data-rxdelta="${v.id}" placeholder="Same as Default, plus…">${esc(lval(key, v.delta))}</textarea></div>
      <div class="fld"><div class="lb">Everything else</div><div class="muted" style="padding-top:4px">As Default${v0(r).version ? ` (v${v0(r).version})` : ''}</div></div>
      <div class="fld"><div class="lb">Starts at</div><div><select class="fv" data-rxscene="${v.id}">${[{ id: 'unplaced', num: null, title: 'not placed yet' }, ...st.scenes].map((s) => `<option value="${esc(s.id)}" ${s.id === v.startScene ? 'selected' : ''}>${s.num ? `sc. ${s.num} ` : ''}${esc(s.title)}</option>`).join('')}</select><div class="small muted">and stays: later scenes use it, unless a shot picks otherwise. Moving the scene doesn’t move this.</div></div></div>
    </div>${dirtyLine(r, v)}<div class="srcline">${ic('sparkle', 's')}<span>${esc(origin)}</span></div>`;
  }
  function motionTab(r) {
    const mm = r.media.motion, paused = !!rx.paused[r.id];
    const upClip = (t) => upLabel('btn', t, { rxup: 'motion', ref: r.id });
    const isGif = mm && /\.gif$/i.test(mm.url);
    const clip = mm ? `<div class="clip ${paused ? 'paused' : ''}" data-key="clip-${r.id}">${isGif ? `<img src="${esc(mm.url)}" alt="">` : `<video src="${esc(mm.url)}" ${paused ? '' : 'autoplay'} muted loop playsinline data-clip="${r.id}" data-key="vid-${r.id}"></video>`}<span class="slab">Clip${mm.dur ? ` · ${Math.round(mm.dur)} s, loops` : ''}</span>${isGif ? '' : `<button class="cplay" data-act="rx-clip" data-ref="${r.id}" title="play / pause">${ic(paused ? 'play' : 'playpause')}</button>`}<div class="sacts">${upLabel('', 'Replace', { rxup: 'motion', ref: r.id })}</div><div class="cbar"><i data-cbar="${r.id}"></i></div></div>`
      : `<div class="clip empty" data-key="clip-${r.id}"><span class="slab">Clip</span><div class="in">${st.providers.video ? `<button class="small" data-act="rx-clip-make" data-ref="${r.id}">${ic('sparkle', 's')}Generate a clip</button>` : '<span>No video model is connected yet.</span>'}${upClip('Upload a clip')}</div></div>`;
    return `<div class="rbody" data-key="motion-${r.id}"><div>${clip}</div><div><div class="lb muted small" style="margin-bottom:8px">How ${esc(r.name)} moves</div><textarea class="fv prose" data-rxmotion="${r.id}" placeholder="Walk, posture, gestures, energy.">${esc(lval(`${r.id}:motion`, r.motion))}</textarea>
      ${mm?.stale ? `<div class="dirty">${ic('alert', 's')}<span>The clip was made with an older text.</span><span class="grow"></span>${upClip('Replace it')}</div>` : ''}<div class="srcline">${ic('film', 's')}<span>${mm ? `${mm.provider === 'upload' ? 'Uploaded' : 'Made'} by ${esc(mm.by || 'someone')} · ${ago(mm.ts)}` : 'The clip goes with this text.'}</span></div></div></div>`;
  }
  function voiceTab(r) {
    const vm = r.media.voice, line = r.voice?.sample || '';
    const sample = `<div class="sample" data-key="sample-${r.id}"><div class="lb muted small">Sample</div>${vm ? player(r.id, vm, r.voiceBusy) + (line ? `<div class="sline">${esc(line)}</div>` : '') : `<div class="faint small">${r.voiceBusy ? 'Making a sample…' : 'No sample yet.'}</div>`}
      ${vm?.stale ? `<div class="dirty">${ic('alert', 's')}<span>Made from an older description.</span></div>` : ''}
      <div class="smeta"><span>${vm ? `${vm.provider === 'upload' ? 'Uploaded' : 'Made in Sound'}, from this description.` : 'Samples are made in Sound, from this description.'}</span><span class="grow"></span><a class="btn" href="#p/${esc(pid)}/production/sound/${r.id}" data-act="go">${ic('wave', 's')}Open in Sound</a></div></div>`;
    return `<div class="rbody" data-key="voice-${r.id}"><div class="flds">${st.config.voice.map(([k, l]) => fieldRow(r, 'voice', k, l, r.voice?.[k], r.voice_ai || [])).join('')}</div><div>${sample}</div></div>`;
  }
  function propRoom(r, tab) {
    const v = vOf(r);
    const tabs = [['look', 'Object sheet'], ['scale', 'Scale'], ['states', 'States', partsOf(r, 'state').length]];
    const cur = tabs.some(([k]) => k === tab) ? tab : 'look';
    let body;
    if (cur === 'look') body = `<div class="rbody" data-key="plook-${v.id}"><div class="sheet props">${slotHtml(r, v, 'front', 'big')}${slotHtml(r, v, 'side')}${slotHtml(r, v, 'back')}${slotHtml(r, v, 'top')}<div></div></div><div>${v.startScene ? variantFields(r, v) : `${fieldsHtml(r)}${dirtyLine(r, v)}${srcLine(r)}${judgeNote(r)}`}</div></div>`;
    else if (cur === 'scale') body = `<div class="rbody" data-key="pscale"><div style="max-width:420px"><div class="sheet props" style="grid-template-columns:1fr">${slotHtml(r, v, 'scale')}</div></div><div><p class="muted small">So its size stays the same from shot to shot.</p></div></div>`;
    else body = tiles(r, v, 'state', '', 'new, broken, open, bloody…', 'Add a state');
    return `<main class="page" data-key="room-${r.id}">${roomHead(r, v)}${roomTabs(r, tabs, cur)}${body}${usedLine(r, v)}</main>`;
  }
  // a light source, drawn from its colour and kind (no image needed)
  function lightTile(x) {
    const l = x.data || {}, c = l.color || '#ffd38a', kind = l.kind || 'bulb';
    const id = `lg${x.id}`, gy = kind === 'glow' ? 100 : kind === 'flood' ? 18 : 46;
    const glyph = { bulb: `<path d="M50 0v36" stroke="#5a5a60" stroke-width="1.6"/><circle cx="50" cy="44" r="6" fill="${c}"/>`, window: `<rect x="28" y="26" width="44" height="40" rx="1" fill="${c}" fill-opacity=".25" stroke="#8d96ab" stroke-width="2"/><path d="M50 26v40M28 46h44" stroke="#8d96ab" stroke-width="1.6"/>`, lamp: `<path d="M44 100V40h12" stroke="#6a6a70" stroke-width="2.6" fill="none"/><circle cx="58" cy="42" r="4.5" fill="${c}"/>`, flood: `<rect x="40" y="12" width="20" height="8" rx="1" fill="${c}"/><path d="M50 20v80" stroke="#55555a" stroke-width="2"/>` }[kind] || '';
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="${id}" cx="50" cy="${gy}" r="${kind === 'glow' ? 80 : 46}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".45" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="#1c1d23"/><rect width="100" height="100" fill="url(#${id})"/>${glyph}</svg>`;
  }
  const AUTO_AT = [[176, 50], [60, 60], [270, 70], [120, 40], [220, 110], [40, 120]];
  function lightPlan(r, v) {
    const layout = v.images.layout || v0(r).images.layout;
    const glows = partsOf(r, 'light').flatMap((x, i) => (x.data?.at?.length ? x.data.at : [AUTO_AT[i % AUTO_AT.length]]).map(([X, Y]) => {
      const c = x.data?.color || '#ffd38a', rad = (x.data?.r || (x.data?.kind === 'glow' ? 140 : 70)) / 3.2;
      return `<span class="glow" style="left:${X / 3.2}%;top:${Y / 1.8}%;width:${rad * 2}%;aspect-ratio:1;background:radial-gradient(circle, ${c}e6 0%, ${c}59 38%, ${c}00 70%)"></span>`;
    }));
    return `<div class="lplan" data-key="lplan-${v.id}">${layout ? img(layout) : ''}<div class="dark"></div>${glows.join('')}</div>`;
  }
  function locationRoom(r, tab) {
    const v = vOf(r);
    const tabs = [['look', 'Layout'], ['elements', 'Elements', partsOf(r, 'element').length], ['texture', 'Texture', partsOf(r, 'texture').length], ['light', 'Light', partsOf(r, 'light').length]];
    const cur = tabs.some(([k]) => k === tab) ? tab : 'look';
    let body;
    if (cur === 'look') {
      const regs = (r.regulars || []).map(charByKey).filter(Boolean).map((c) => `<a class="reg" href="${base()}/characters/${c.id}" data-key="reg-${c.id}"><span class="face">${thumbOf(c) && !c.voice_only ? img(thumbOf(c)) : ic('user', 's')}</span>${esc(c.name)}</a>`).join('');
      const areas = `<div class="lbl2">Areas <span class="faint">· where scenes happen</span></div><div class="tiles areas" data-key="areas">${partsOf(r, 'area').map((x) => partTile(r, v, x)).join('')}${addTile(r, 'area', 'kitchen, counter…', 'Add an area')}</div>`;
      body = `<div class="rbody" data-key="llook-${v.id}"><div>${slotHtml(r, v, 'layout', 'wide')}${areas}</div>
        <div>${v.startScene ? variantFields(r, v) : `${fieldsHtml(r)}${dirtyLine(r, v)}${judgeNote(r)}`}
          ${r.heading ? `<div class="lbl2">From the script</div><div style="margin:6px 0 4px"><span class="script-h">${esc(r.heading)}</span></div><div class="muted small">The time of day comes from the script.</div>` : srcLine(r)}
          <div class="lbl2">Regulars</div>${regs ? `<div class="regs">${regs}</div>` : '<div class="faint small" style="margin-top:4px">Nobody yet.</div>'}</div></div>`;
    } else if (cur === 'elements') body = tiles(r, v, 'element', 'wide', 'a window, the counter, the tanks…', 'Add an element');
    else if (cur === 'texture') body = tiles(r, v, 'texture', '', 'brick, tiles, wet stone…', 'Add a texture');
    else {
      const rows = partsOf(r, 'light').map((x) => { const pm = `rxp:${x.id}`; return `<div class="lrow" data-key="lr-${x.id}"><div class="lt">${lightTile(x)}</div><div class="grow"><div class="tn">${esc(x.name)}${x.data?.ai ? ' <span class="tag ai">AI</span>' : ''}</div><div class="td">${esc(x.data?.quality || '—')}</div></div><div class="pmenu menuwrap ${ui.menu === pm ? 'open' : ''}">${menuBtn(pm)}${menu(pm, partMenu(x), 'right')}</div></div>`; }).join('');
      const add = rx.adding === 'light' ? `<input id="rx-add-light" data-rxadd="light" data-ref="${r.id}" placeholder="a neon sign, a fridge door…" maxlength="60" autocomplete="off" style="margin-top:10px">` : `<button class="small ghost" style="margin-top:10px" data-act="rx-add" data-kind="light">${ic('plus', 's')}Add a light</button>`;
      body = `<div class="rbody" data-key="light-${v.id}"><div>${lightPlan(r, v)}<p class="faint small" style="margin-top:10px">The place’s own light. Time of day and weather come from the script, on top of it.</p></div><div><div class="lb muted small" style="margin-bottom:4px">Sources</div>${rows || '<div class="faint small">No light sources yet.</div>'}${add}</div></div>`;
    }
    return `<main class="page" data-key="room-${r.id}">${roomHead(r, v)}${roomTabs(r, tabs, cur)}${body}${usedLine(r, v)}</main>`;
  }
  function versionsRoom(r) {
    const v = vOf(r);
    const list = [...v.versions].reverse();
    return `<main class="page" data-key="vroom-${r.id}"><a class="backl" href="${base()}/${PLURAL[r.kind]}/${r.id}">${ic('back', 's')}${esc(r.name)}</a>
      <div class="rhead"><h1>Versions</h1><span class="muted">${esc(r.name)}${v.startScene ? ` · ${esc(v.name)}` : ''}</span></div>
      <div class="vers">${v.changed ? `<div class="ver"><div class="vt">${img(v.images[first(r)])}</div><div><div class="vh"><b>Now</b><span class="muted small">changed since v${v.version}</span></div><div class="vd">Not saved as a version yet.</div></div></div>` : ''}
        ${list.length ? list.map((x) => `<div class="ver" data-key="ver-${x.n}"><div class="vt">${x.n === v.version && !v.changed ? img(v.images[first(r)]) : ''}</div><div><div class="vh"><b>v${x.n}</b><span class="muted small">${esc(x.by || '')} · ${ago(x.ts)}${x.n === v.version ? ' · current' : ''}</span></div><div class="vd">${x.n === 1 ? 'Approved.' : 'Saved after an edit; the version before is kept.'}</div></div></div>`).join('') : '<div class="muted">No versions yet. Approving makes v1.</div>'}
      </div></main>`;
  }

  // ---------------------------------------------------------------- Generate: the panel, when asked
  function genPanel() {
    const g = rx.gen; if (!g) return '';
    const r = refOf(g.ref); if (!r) return '';
    const v = r.variants.find((x) => x.id === g.variant) || v0(r);
    const busy = v.busy.includes(g.slot), batch = v.batches[g.slot];
    const part = g.slot.startsWith('part:') ? r.parts.find((x) => `part:${x.id}` === g.slot) : null;
    const label = part ? part.name : SLOT[g.slot] || g.slot;
    const shape = r.kind === 'location' && (g.slot === 'layout' || ['area', 'element'].includes(part?.kind)) ? 'wide' : r.kind === 'prop' || ['expression', 'texture', 'state'].includes(part?.kind) ? 'sq' : '';
    const opts = busy ? [0, 1, 2, 3].map((i) => `<div class="opt working" data-key="o-w${i}"></div>`).join('')
      : batch ? batch.images.map((x) => `<button class="opt" data-act="rx-pick" data-image="${x.id}" data-key="o-${x.id}">${img(x)}<span class="use">Use this</span></button>`).join('')
        : v.images[g.slot] ? `<div class="opt" style="cursor:default" data-key="o-cur">${img(v.images[g.slot])}</div>` : '';
    const isFirst = g.slot === first(r);
    const prov = st.providers.image === 'mock' ? 'Placeholder sketches: no image model is connected (PI_IMAGES=codex or openai to use one).' : st.providers.image === 'codex' ? (st.providers.imageWorkers ? 'Made with OpenAI images, on a ChatGPT subscription.' : 'No image terminal is online: run “npm run images”.') : 'Made with OpenAI images.';
    return `<aside class="genp ${shape}" data-key="genp">
      <div class="gh"><div class="grow"><div class="gt">${ic('sparkle', 's')} ${esc(label)} · ${esc(r.name)}${v.startScene ? ` · ${esc(v.name)}` : ''}</div><div class="gs">${busy ? 'Making 4 options…' : batch ? (isFirst ? 'Pick one. The rest are made from it.' : 'Pick one.') : 'Say what should change.'}</div></div><button class="icon" data-act="rx-gen-x" title="close">${ic('x')}</button></div>
      <div class="opts"><div class="ogrid">${opts}</div></div>
      <div class="gfrom">${esc(prov)}</div>
      <form class="gf" data-rxform="fix"><input id="rx-fix" data-rxfix placeholder="Fix: shorter hair, add a scar…" autocomplete="off"><button class="small" title="make 4 new options">${ic('refresh', 's')}</button></form>
    </aside>`;
  }

  // ---------------------------------------------------------------- the section's body
  function body(ctx) {
    sync(ctx);
    if (!st) return '<div class="loading">connecting…</div>';
    const pl = placeOf();
    if (pl.id) {
      const r = refOf(pl.id);
      if (!r) return `<main class="page"><a class="backl" href="${base()}/${pl.kindKey}">${ic('back', 's')}Back</a><p class="muted">That card isn’t here any more.</p></main>`;
      if (pl.tab === 'versions') return versionsRoom(r);
      return (r.kind === 'character' ? characterRoom(r, pl.tab) : r.kind === 'prop' ? propRoom(r, pl.tab) : locationRoom(r, pl.tab)) + genPanel();
    }
    return gallery(pl);
  }
  function post() {
    if (rx.focus) { const el = app.querySelector(rx.focus); rx.focus = null; if (el) el.focus(); }
    // a clip's play state survives re-renders
    app.querySelectorAll('video[data-clip]').forEach((vd) => { const want = !rx.paused[vd.dataset.clip]; if (want && vd.paused) vd.play().catch(() => {}); if (!want && !vd.paused) vd.pause(); });
  }

  // ---------------------------------------------------------------- actions
  const ask = (q, d = '') => { const v = prompt(q, d); return v === null ? null : v.trim(); };
  async function onClick(e, b, ctx) {
    const act = b.dataset.act, ds = b.dataset;
    if (!act?.startsWith('rx-')) return false;
    if (act === 'rx-open') { if (e.target.closest('.cmenu, .menu')) return true; const r = refOf(ds.ref); if (r) location.hash = `${base()}/${PLURAL[r.kind]}/${r.id}`; return true; }
    if (act === 'rx-attn') { rx.attn = !rx.attn; R(); return true; }
    if (act === 'rx-var') { rx.variant[ds.ref] = ds.v; return false; } // the link does the rest
    if (act === 'rx-variant') { rx.variant[ds.ref] = ds.v; R(); return true; }
    if (act === 'rx-new') { rx.newForm = true; rx.focus = '#rx-new-name'; R(); return true; }
    if (act === 'rx-new-x') { rx.newForm = false; rx.newName = ''; R(); return true; }
    if (act === 'rx-add') { rx.adding = ds.kind; rx.focus = `#rx-add-${ds.kind}`; R(); return true; }
    if (act === 'rx-addvar') { rx.addVar = ds.ref; rx.focus = '#rx-var-name'; R(); return true; }
    if (act === 'rx-addvar-x') { rx.addVar = null; R(); return true; }
    if (act === 'rx-gen' || act === 'rx-fix' || act === 'rx-gen-open') {
      rx.gen = { ref: ds.ref, variant: ds.variant, slot: ds.slot };
      if (act === 'rx-fix') rx.focus = '#rx-fix';
      R();
      if (act === 'rx-gen') { const r = await api('generate', { variant: ds.variant, slot: ds.slot }); if (r.error) rx.gen = null; }
      return true;
    }
    if (act === 'rx-gen-x') { rx.gen = null; R(); return true; }
    if (act === 'rx-pick') { rx.gen = null; R(); await api('pick', { image: ds.image }); return true; }
    if (act === 'rx-approve') { const r = await api('approve', { variant: ds.variant }); if (r.version) toast(`Approved as v${r.version}. Shots use it now.`); return true; }
    if (act === 'rx-save') { const r = await api('version/save', { variant: ds.variant }); if (r.version) toast(`Saved as v${r.version}. v${r.version - 1} is kept.`); return true; }
    if (act === 'rx-undo') { await api('version/undo', { variant: ds.variant }); toast('Back as it was.'); return true; }
    if (act === 'rx-owner') { await api('owner', { ref: ds.ref, owner: ds.n }); return true; }
    if (act === 'rx-face') { await api('face', { ref: ds.ref, off: !!ds.off }); return true; }
    if (act === 'rx-describe') { const r = await api('describe', { ref: ds.ref }); toast(r.already ? 'The AI already has that one.' : 'Asked the AI to fill the blanks.'); return true; }
    if (act === 'rx-check') { const r = await api('check', { ref: ds.ref }); toast(r.already ? 'The Judge is already reading it.' : 'The Judge will read it against the Bible.'); return true; }
    if (act === 'rx-check-clear') { await api('check/clear', { ref: ds.ref }); return true; }
    if (act === 'rx-copy') { const r = await PI.api(`/api/projects/${pid}/refs/copy`, { ref: ds.ref, to: ds.to }); if (r.ok) toast(`Copied into “${ds.name}”. The two now change on their own.`); return true; }
    if (act === 'rx-merge') { if (!confirm(`Merge into ${ds.name}? This card goes; its script names point to ${ds.name}.`)) return true; const r = await api('merge', { ref: ds.ref, into: ds.into }); if (r.id) location.hash = `${base()}/${placeOf().kindKey}/${r.id}`; return true; }
    if (act === 'rx-delete') { if (!confirm(`Delete ${ds.name}? The script won’t bring it back.`)) return true; await api('delete', { ref: ds.ref }); location.hash = `${base()}/${placeOf().kindKey}`; return true; }
    if (act === 'rx-var-rename') { const n = ask('Name this change:', ds.name); if (n) await api('variant/edit', { variant: ds.variant, name: n }); return true; }
    if (act === 'rx-var-remove') { if (!confirm(`Remove “${ds.name}”? Its images go with it.`)) return true; await api('variant/remove', { variant: ds.variant }); return true; }
    if (act === 'rx-part-rename') { const n = ask('Name:', ds.name); if (n) await api('part/edit', { part: ds.part, name: n }); return true; }
    if (act === 'rx-part-note') { const n = ask(ds.note !== undefined && b.textContent.includes('looks') ? 'How it looks (warm or cold, hard or soft, from where):' : 'Note:', ds.note); if (n !== null) await api('part/edit', { part: ds.part, note: n }); return true; }
    if (act === 'rx-part-remove') { if (!confirm(`Remove “${ds.name}”?`)) return true; await api('part/remove', { part: ds.part }); return true; }
    if (act === 'rx-play') { play(ds.ref, ds.url, Number(ds.dur), undefined); return true; }
    if (act === 'rx-seek') { const box = b.getBoundingClientRect(); play(ds.ref, ds.url, Number(ds.dur), (e.clientX - box.left) / box.width); return true; }
    if (act === 'rx-clip') {
      const vd = app.querySelector(`video[data-clip="${ds.ref}"]`); if (!vd) return true;
      if (vd.paused) vd.play().catch(() => {}); else vd.pause();
      rx.paused[ds.ref] = vd.paused;
      R(); return true;
    }
    if (act === 'rx-clip-make') { await api('clip', { ref: ds.ref }); return true; }
    return false;
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.rxf) { const k = `${t.dataset.ref}:${t.dataset.list}:${t.dataset.rxf}`; edit(k, 'field', { ref: t.dataset.ref, list: t.dataset.list, field: t.dataset.rxf, value: t.value }); return true; }
    if (t.dataset.rxmotion) { edit(`${t.dataset.rxmotion}:motion`, 'motion', { ref: t.dataset.rxmotion, text: t.value }); return true; }
    if (t.dataset.rxline) { edit(`${t.dataset.rxline}:line`, 'line', { ref: t.dataset.rxline, line: t.value }); return true; }
    if (t.dataset.rxdelta) { edit(`${t.dataset.rxdelta}:delta`, 'variant/edit', { variant: t.dataset.rxdelta, delta: t.value }); return true; }
    if (t.dataset.rxnew !== undefined) { rx.newName = t.value; return true; }
    return false;
  }
  function onKey(e) {
    const t = e.target;
    if (t.dataset?.rxadd) {
      if (e.key === 'Escape') { rx.adding = null; R(); return true; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = t.value.trim(); if (!name) return true;
        const kind = t.dataset.rxadd;
        rx.adding = null; R();
        api('part/add', { ref: t.dataset.ref, kind, name, note: kind === 'light' ? '' : '' });
        return true;
      }
    }
    if (t.dataset?.rxline !== undefined && e.key === 'Enter') { t.blur(); return true; }
    if (e.key === 'Escape' && rx.gen) { rx.gen = null; R(); return true; }
    if (e.key === 'Escape' && rx.newForm) { rx.newForm = false; R(); return true; }
    if (e.key === 'Enter' && t.dataset?.act === 'rx-open') { const r = refOf(t.dataset.ref); if (r) location.hash = `${base()}/${PLURAL[r.kind]}/${r.id}`; return true; }
    return false;
  }
  async function onSubmit(e) {
    const f = e.target.closest('[data-rxform]');
    if (!f) return false;
    e.preventDefault();
    if (f.dataset.rxform === 'new') {
      const name = rx.newName.trim(); if (!name) return true;
      const kind = placeOf().kind;
      const r = await api('new', { kind, name });
      if (r.id) { rx.newForm = false; rx.newName = ''; location.hash = `${base()}/${PLURAL[kind]}/${r.id}`; }
      return true;
    }
    if (f.dataset.rxform === 'fix') {
      const fix = f.querySelector('[data-rxfix]').value.trim();
      if (!fix || !rx.gen) return true;
      await api('generate', { variant: rx.gen.variant, slot: rx.gen.slot, fix });
      return true;
    }
    if (f.dataset.rxform === 'addvar') {
      const fd = new FormData(f);
      const r = await api('variant/add', { ref: f.dataset.ref, name: fd.get('name'), delta: fd.get('delta'), scene: fd.get('scene') });
      if (r.id) { rx.addVar = null; rx.variant[f.dataset.ref] = r.id; R(); }
      return true;
    }
    return false;
  }
  // file pickers and the variant's start scene: change events, which the shell doesn't forward
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (PI.route().section !== 'references' && PI.route().section !== 'production') return;
    if (t.matches('input[type="file"][data-rxup]')) uploadFile(t);
    if (t.dataset?.rxscene) api('variant/edit', { variant: t.dataset.rxscene, scene: t.value });
  });

  PI.sections.references = { chrome, body, post, onClick, onInput, onKey, onSubmit };
})();
