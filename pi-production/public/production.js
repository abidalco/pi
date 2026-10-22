// Production — the section. Row 2: Frames · Video · Sound · Cut (Video and Cut come later).
// Frames: every shot of Main with the references it uses, filled in on their own (who's in frame, with the variant for
// that scene; the place and area from the heading), props added by hand, and a quiet Stale line on a shot made with an
// older version of a reference (keep it, or move it on). The frames themselves come with the Image step.
// Sound: one voice sample per character, made from its Voice description in References.
(() => {
  const PI = window.PI;
  const { esc, ic, plural, toast, menu, mi } = PI;
  const ui = PI.ui;
  const R = () => PI.render();
  let pid = null, me = '', S = null;
  const sync = (ctx) => { pid = ctx.pid; me = ctx.me; S = ctx.S; };
  const base = () => `#p/${esc(pid)}/production`;
  const api = (act, data) => PI.api(`/api/projects/${pid}/refs/${act}`, data);
  const PLURAL = { character: 'characters', prop: 'props', location: 'locations' };
  const tabOf = () => { const [t, id] = (PI.route().sub || '').split('/'); return { tab: t === 'sound' ? 'sound' : 'frames', id: id || null }; };

  function chrome(ctx) {
    sync(ctx);
    const { tab } = tabOf();
    const seg = (k, label, dim) => (dim ? `<span class="seg dim" title="comes later">${label}</span>` : `<a class="seg ${tab === k ? 'on' : ''}" href="${base()}${k === 'frames' ? '' : `/${k}`}">${label}</a>`);
    const busy = (S.refs?.refs || []).some((r) => r.voiceBusy);
    return { title: tab === 'sound' ? 'Sound' : 'Production', center: `${seg('frames', 'Frames')}${seg('video', 'Video', true)}${seg('sound', 'Sound')}${seg('cut', 'Cut', true)}`, right: busy ? '<span class="aistat" data-key="aistat">making a voice…</span>' : '', viewClass: 'px', viewKey: tab };
  }

  // ---------------------------------------------------------------- frames
  const q = (c) => (c.pinned != null ? `kept on v${c.pinned}` : c.status === 'approved' ? `v${c.version}` : c.status === 'review' ? 'not approved yet' : c.status === 'awaiting' ? 'not generated yet' : 'no images yet');
  function chip(s, c) {
    const href = `#p/${esc(pid)}/references/${PLURAL[c.kind]}/${esc(c.ref)}`;
    const th = `<span class="th ${c.kind === 'character' ? '' : 'sq'}">${c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : ic(c.kind === 'character' ? 'user' : c.kind === 'prop' ? 'key' : 'pin', 's')}</span>`;
    const label = `${esc(c.name)}${c.variantName ? ` · ${esc(c.variantName)}` : ''}${c.area ? ` · ${esc(c.area.name)}` : ''}`;
    const vm = `pxv:${s.id}:${c.ref}`;
    const pick = c.kind !== 'location' && c.variants.length > 1 ? `<div class="menuwrap"><button class="rchip dashed" data-act="menu" data-menu="${vm}" title="which version of ${esc(c.name)} this shot uses">${ic('chevron', 's')}</button>${menu(vm, ['<div class="mlabel">This shot uses</div>', mi('px-variant', '', `By the scene <span class="msub">automatic</span>`, { shot: s.id, scene: s.scene, ref: c.ref, draft: s.draft, variant: '' }, !c.override ? 'cur' : ''), ...c.variants.map((x) => mi('px-variant', '', `${esc(x.name)} <span class="msub">${esc(x.range)}</span>`, { shot: s.id, scene: s.scene, ref: c.ref, draft: s.draft, variant: x.id }, c.override === x.id ? 'cur' : ''))])}</div>` : '';
    const x = c.how === 'hand' ? `<button class="x" data-act="px-prop-x" data-shot="${s.id}" data-ref="${c.ref}" data-draft="${s.draft}" title="take it off this shot">${ic('x', 's')}</button>` : '';
    return `<span style="display:inline-flex;gap:2px;align-items:center" data-key="ch-${s.id}-${c.ref}"><a class="rchip ${['awaiting', 'draft'].includes(c.status) ? 'warn' : ''}" href="${href}" data-act="go">${th}${label}<span class="q">· ${q(c)}</span>${x}</a>${pick}</span>`;
  }
  function shotRow(sc, s) {
    const pm = `pxp:${s.id}`;
    const props = S.production.props;
    const addProp = `<div class="menuwrap" data-key="addp-${s.id}"><button class="rchip dashed" data-act="menu" data-menu="${pm}">${ic('plus', 's')}prop</button>${menu(pm, props.length ? ['<div class="mlabel">Add a prop to this shot</div>', ...props.filter((p) => !s.chips.some((c) => c.ref === p.id)).map((p) => mi('px-prop', 'key', esc(p.name), { shot: s.id, scene: sc.id, ref: p.id, draft: s.draft }))] : [`<div class="mnote">No props yet.</div>`, `<a class="mi" href="#p/${esc(pid)}/references/props" data-act="go">${ic('plus', 's')}Add one in References</a>`])}</div>`;
    const unknown = s.unknown.map((k) => `<a class="rchip dashed" href="#p/${esc(pid)}/references/characters" data-act="go" title="named in the shot, not a card yet">${esc(k)} · not in References</a>`).join('');
    const stale = s.chips.filter((c) => c.stale).map((c) => `<div class="staleline" data-key="stale-${s.id}-${c.ref}">${ic('alert', 's')}<span>Made with an older ${esc(c.name)}${c.variantName ? ` · ${esc(c.variantName)}` : ''} (v${c.stale.was}, now v${c.stale.now}).</span><span class="grow"></span><button class="small" data-act="px-keep" data-shot="${s.id}" data-ref="${c.ref}" data-draft="${s.draft}" data-num="${s.num}">Keep v${c.stale.was}</button><button class="small" data-act="px-update" data-shot="${s.id}" data-ref="${c.ref}" data-variant="${c.variant}" data-draft="${s.draft}" data-num="${s.num}">Use v${c.stale.now}</button></div>`).join('');
    return `<div class="pshot" data-key="ps-${s.id}"><div class="kf">The frame comes with the Image step</div><div style="min-width:0"><div class="sh"><span class="num">${esc(s.num)}</span>${s.framing ? `<span class="fr">${esc(s.framing)}</span>` : ''}${s.chips.some((c) => c.stale) ? '<span class="st s-stale"><i></i>Stale</span>' : ''}${s.status === 'approved' ? `<span class="muted small">final</span>` : ''}</div>
      <div class="act">${esc(s.action || '—')}</div>${s.dialogue ? `<div class="muted small">${esc(s.dialogue)}</div>` : ''}
      <div class="rchips">${s.chips.map((c) => chip(s, c)).join('')}${unknown}${addProp}</div>${stale}</div></div>`;
  }
  function frames() {
    const P = S.production;
    if (!P) return '<div class="loading">connecting…</div>';
    if (!P.started) return `<main class="page"><p class="empty">No script yet. <a href="#p/${esc(pid)}/script">Start it in Script ›</a></p></main>`;
    if (!P.scenes.length) return `<main class="page"><p class="empty">No shots yet. They come from locked scenes: <a href="#p/${esc(pid)}/script/shots">Script → Shots ›</a></p></main>`;
    return `<main class="page" data-key="frames">${P.scenes.map((sc) => `<section class="pscene" data-key="sc-${sc.id}"><h2>${sc.num} · ${esc(sc.title)}${sc.heading ? `<span class="hd">${esc(sc.heading)}</span>` : ''}</h2>${sc.shots.map((s) => shotRow(sc, s)).join('')}</section>`).join('')}</main>`;
  }

  // ---------------------------------------------------------------- sound
  function sound(focus) {
    const st = S.refs;
    if (!st) return '<div class="loading">connecting…</div>';
    const chars = st.refs.filter((r) => r.kind === 'character');
    if (!chars.length) return `<main class="page"><p class="empty">No characters yet. They come in from the script, or <a href="#p/${esc(pid)}/references/characters">add one in References ›</a></p></main>`;
    const M = PI.media;
    const rows = chars.map((c) => {
      const m = c.media.voice, vd = (k) => c.voice?.[k] || '';
      const sum = [vd('pitch'), vd('accent'), vd('pace')].filter(Boolean).join(' · ');
      const f = c.variants[0].images.front;
      const face = c.voice_only || !f ? ic('wave', 's') : `<img src="${esc(f.url)}" alt="">`;
      const make = st.providers.voice ? `<button class="small" data-act="px-voice" data-ref="${c.id}" ${c.voiceBusy ? 'disabled' : ''}>${ic('refresh', 's')}${c.voiceBusy ? 'Making…' : m ? 'Remake' : 'Make'}</button>` : '';
      return `<div class="vrow ${focus === c.id ? 'hl' : ''}" data-key="vr-${c.id}"><span class="vf">${face}</span><div class="vn"><b>${esc(c.name)}</b><span>${esc(sum || 'No voice description yet')}</span></div>
        ${m ? M.player(c.id, m, c.voiceBusy) : `<div class="faint small">${c.voiceBusy ? 'Making a sample…' : 'No sample yet'}</div>`}
        <div class="vacts">${m?.stale ? '<span class="st s-stale"><i></i>older description</span>' : ''}${make}<div class="menuwrap">${PI.menuBtn(`pxs:${c.id}`)}${menu(`pxs:${c.id}`, [M.upLabel('mi', 'Upload a sample…', { rxup: 'voice', ref: c.id }), `<a class="mi" href="#p/${esc(pid)}/references/characters/${c.id}/voice" data-act="go">${ic('user', 's')}Open the voice description</a>`], 'right')}</div></div></div>`;
    }).join('');
    const prov = st.providers.voice === 'say' ? 'Made with this Mac’s own voices, shaped by each description.' : 'No voice model here: upload a sample for each character.';
    return `<main class="page" data-key="sound"><h2 class="secth">Voices <span class="muted small">${esc(prov)}</span></h2>${rows}
      <h2 class="secth" style="margin-top:30px;color:var(--t3)">Lines <span class="small">every line of dialogue in these voices, shot by shot · comes later</span></h2></main>`;
  }

  function body(ctx) {
    sync(ctx);
    const { tab, id } = tabOf();
    return tab === 'sound' ? sound(id) : frames();
  }
  let scrolled = null;
  function post() {
    const { tab, id } = tabOf();
    if (tab === 'sound' && id && scrolled !== id) { scrolled = id; document.querySelector('.px .vrow.hl')?.scrollIntoView({ block: 'center' }); }
    if (!id) scrolled = null;
  }

  async function onClick(e, b) {
    const act = b.dataset.act, ds = b.dataset;
    if (act?.startsWith('rx-')) return PI.sections.references.onClick(e, b, {}); // the shared player
    if (!act?.startsWith('px-')) return false;
    if (act === 'px-prop') { await api('shot/prop', { draft: ds.draft, scene: ds.scene, shot: ds.shot, ref: ds.ref }); return true; }
    if (act === 'px-prop-x') { e.preventDefault(); await api('shot/prop', { draft: ds.draft, shot: ds.shot, ref: ds.ref, remove: true }); return true; }
    if (act === 'px-variant') { await api('shot/variant', { draft: ds.draft, scene: ds.scene, shot: ds.shot, ref: ds.ref, variant: ds.variant || null }); return true; }
    if (act === 'px-keep') { await api('shot/keep', { draft: ds.draft, shot: ds.shot, ref: ds.ref, num: ds.num }); toast(`Shot ${ds.num} keeps the older version.`); return true; }
    if (act === 'px-update') { await api('shot/update', { draft: ds.draft, shot: ds.shot, ref: ds.ref, variant: ds.variant, num: ds.num }); toast(`Shot ${ds.num} uses the new version now.`); return true; }
    if (act === 'px-voice') { const r = await api('voice', { ref: ds.ref }); if (r.ok && !r.working) toast('New sample made.'); return true; }
    return false;
  }

  PI.sections.production = { chrome, body, post, onClick };
})();
