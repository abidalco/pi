// References — placeholder art, for when no image model is connected (the "mock" provider in lib/media.mjs).
// Quiet, code-drawn SVGs in the app's palette. They read the card's description (hair, build, outfit colour,
// materials, a lasting change) so two cards don't look the same, but they are sketches, never the final look.
// Every function returns a complete SVG document as a string.

const STYLE = `<style>.bg{fill:#ecebe7}.bg1{fill:#e9e8e3}.bg2{fill:#efeeea}.bg3{fill:#e6e6e2}.sk{fill:#d3d0c8}.h{fill:#3b3b40}.h2{fill:#8d8a84}.h3{fill:#c9b27a}.h4{fill:#8a4a2c}.pants{fill:#5a5a60}.ln{stroke:#4a4a50;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round}.ln2{stroke:#f1efe9;stroke-width:1.4;fill:none;stroke-linecap:round}.dk{fill:#3b3b40}.m{fill:#c9c7c0}.m2{fill:#b9b7b0}.far{fill:#dddcd6}.fl{fill:#d6d4cd}.wall{fill:#e1dfd9}.wall2{fill:#d9d7d0}.win{fill:#f6f5f1;stroke:#9a988f;stroke-width:1.5}.lamp{fill:#f3e6bf}.plaster{fill:#f0e3cf;stroke:#b9a98e;stroke-width:.8}.strip{stroke:#e9eef9;stroke-width:3}.hint{fill:none;stroke:#9a988f;stroke-width:1;stroke-dasharray:3 3}.crack{stroke:#3b3b40;stroke-width:1.4;fill:none}.blood{fill:#8a1c1c}</style>`;
const doc = (vb, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">${STYLE}${body}</svg>`;
const words = (...xs) => xs.filter(Boolean).join(' ').toLowerCase();

// ---------------------------------------------------------------- reading the description
const COLORS = [[/black|dark|charcoal/, '#2f2f34'], [/navy|blue|denim/, '#31395f'], [/grey|gray|silver/, '#8d8a84'], [/white|cream|ivory|beige/, '#e4e1d9'], [/red|crimson|maroon|burgundy/, '#8a2f2f'], [/green|olive|khaki/, '#5b6b4a'], [/brown|tan|camel|leather/, '#7a5a3e'], [/yellow|mustard|ochre|gold/, '#c9a24a'], [/orange|rust/, '#b0602e'], [/pink|rose/, '#c98a8f'], [/purple|violet|plum/, '#5b2a6e']];
const colorIn = (t, fallback) => (COLORS.find(([re]) => re.test(t)) || [null, fallback])[1];
const STYLES = ['short', 'swept', 'bun', 'long'];
function looks(ref) {
  const f = ref.fields || {};
  const hair = words(f.hair, f.more);
  const style = /bald|shaved head|shaven/.test(hair) ? 'bald' : /long|shoulder/.test(hair) ? 'long' : /bun|tied|ponytail|braid/.test(hair) ? 'bun' : /swept|slick|combed back|back\b/.test(hair) ? 'swept' : 'short';
  const hairCls = /grey|gray|silver|white/.test(hair) ? 'h2' : /blond|fair|golden|straw/.test(hair) ? 'h3' : /red|ginger|auburn|copper/.test(hair) ? 'h4' : 'h';
  const build = words(f.build, f.more);
  const size = /heavy|broad|big|stocky|large|wide|burly|thick/.test(build) ? 'wide' : /slim|thin|wiry|slight|narrow|small|petite|lean/.test(build) ? 'slim' : 'mid';
  const firstOutfit = (ref.parts || []).find((p) => p.kind === 'outfit');
  const jacket = colorIn(words(firstOutfit?.name, firstOutfit?.note), '#31395f');
  const marks = words(f.marks);
  return { style, hairCls, size, jacket, scarBrow: /eyebrow|brow/.test(marks) && /scar/.test(marks) };
}
// a lasting change, drawn when the words are recognisable
function changeMarks(delta = '') {
  const t = String(delta).toLowerCase();
  return { plaster: /cut|scar|wound|plaster|bandage|bruise|stitch/.test(t), glasses: /glasses|spectacles/.test(t), beard: /beard|stubble/.test(t), older: /older|aged|years later|grey/.test(t), bald: /bald|shaved/.test(t) };
}

// ---------------------------------------------------------------- characters
const HAIR = {
  short: { f: 'M37 74C33 26 87 26 83 74C80 58 72 54 60 54C48 54 40 58 37 74Z', b: 'M37 82C31 24 89 24 83 82C76 72 44 72 37 82Z' },
  bun: { f: 'M37 74C33 26 87 26 83 74C80 58 72 54 60 54C48 54 40 58 37 74Z', b: 'M37 82C31 24 89 24 83 82C76 72 44 72 37 82Z', x: (c) => `<circle class="${c}" cx="60" cy="36" r="9"/>` },
  swept: { f: 'M37 76C31 24 89 24 83 72C80 56 70 52 62 53C52 54 44 60 37 76Z', b: 'M37 82C31 24 89 24 83 82C76 72 44 72 37 82Z' },
  long: { f: 'M35 78C30 24 90 24 85 78L88 112C80 104 80 86 80 74C77 60 43 60 40 74C40 86 40 104 32 112Z', b: 'M35 80C30 24 90 24 85 80L89 114H31Z' },
  bald: { f: '', b: '' },
};
const SHOULDERS = { wide: 'M10 160C14 120 36 108 60 108C84 108 106 120 110 160Z', mid: 'M16 160C20 124 38 112 60 112C82 112 100 124 104 160Z', slim: 'M24 160C27 126 42 114 60 114C78 114 93 126 96 160Z' };
const styleFor = (L, opt) => { if (L.style === 'bald') return 'bald'; const order = [L.style, ...STYLES.filter((s) => s !== L.style)]; return order[opt % order.length]; };
// the 4 options of a first Default front try 4 looks, starting from the described one; each is stored as its hairstyle
// (an index into STYLES), so the rest keep it even if the description changes later
export const exploreLook = (ref, i) => Math.max(0, STYLES.indexOf(styleFor(looks(ref), i)));
const styleOf = (L, look) => (L.style === 'bald' ? 'bald' : STYLES[look] || L.style);

// slot: front | side | back · opt: which option (its background) · look: the hairstyle the picked front settled on · delta: a variant's change
export function portrait(ref, slot, { opt = 0, delta = '', look = null } = {}) {
  const L = looks(ref), M = changeMarks(delta);
  const style = M.bald ? 'bald' : look == null ? L.style : styleOf(L, look);
  const H = HAIR[style] || HAIR.short;
  const hc = M.older && L.hairCls === 'h' ? 'h2' : L.hairCls;
  const bg = `<rect class="bg${opt % 4 || ''}" width="120" height="160"/>`;
  const body = `<path style="fill:${L.jacket}" d="${SHOULDERS[L.size]}"/>`;
  const x = H.x ? H.x(hc) : '';
  if (slot === 'side') {
    return doc('0 0 120 160', 600, 800, `${bg}<path style="fill:${L.jacket}" d="M30 160C32 124 44 112 60 112C76 112 88 124 90 160Z"/><path class="sk" d="M54 92h14v22H54z"/><ellipse class="sk" cx="62" cy="72" rx="20" ry="25"/><path class="sk" d="M80 68l7 10-7 2z"/><path class="ln" d="M73 71h4M76 88h-6"/><ellipse class="ln" cx="58" cy="74" rx="3" ry="5"/>${H.f ? `<path class="${hc}" transform="translate(2 0)" d="${H.f}"/>` : ''}${x.replace('cx="60"', 'cx="56"')}${M.glasses ? '<path class="ln" d="M70 70h10"/>' : ''}`);
  }
  if (slot === 'back') {
    return doc('0 0 120 160', 600, 800, `${bg}${body}<path class="sk" d="M52 90h16v24H52z"/><ellipse class="sk" cx="60" cy="72" rx="21" ry="25"/>${H.b ? `<path class="${hc}" d="${H.b}"/>` : ''}${x}`);
  }
  const collar = '<path class="ln" style="stroke:#f1efe9;opacity:.6" d="M50 113L60 128L70 113"/>';
  const scar = L.scarBrow ? '<path class="ln2" d="M51 63l3 5"/>' : '';
  const plaster = M.plaster ? '<rect class="plaster" x="64" y="78" width="10" height="5" rx="1.5" transform="rotate(-18 69 80)"/>' : '';
  const glasses = M.glasses ? '<path class="ln" d="M46 72h12M62 72h12M58 72h4"/>' : '';
  const beard = M.beard ? `<path class="${hc}" opacity=".55" d="M44 84C46 100 56 98 60 98C64 98 74 100 76 84C70 92 50 92 44 84Z"/>` : '';
  return doc('0 0 120 160', 600, 800, `${bg}${body}${collar}<path class="sk" d="M52 90h16v24H52z"/><ellipse class="sk" cx="60" cy="72" rx="21" ry="25"/><path class="ln" d="M50 72h5M65 72h5M60 75v7l-2 1M54 88h12"/>${scar}${plaster}${beard}${glasses}${H.f ? `<path class="${hc}" d="${H.f}"/>` : ''}${x}`);
}

const FACES = {
  neutral: { b: 'M33 38h11M56 38h11', m: 'M42 66h16' },
  happy: { b: 'M33 36q5.5-3 11 0M56 36q5.5-3 11 0', m: 'M40 62q10 10 20 0' },
  angry: { b: 'M33 35l11 5M67 35l-11 5', m: 'M42 68q8-5 16 0' },
  sad: { b: 'M33 40l11-4M67 40l-11-4', m: 'M42 69q8-6 16 0' },
  scared: { b: 'M33 35q5.5-4 11-1M56 34q5.5-3 11 1', o: '<ellipse class="ln" cx="50" cy="67" rx="5" ry="3.5"/>', big: true },
  surprised: { b: 'M33 31q5.5-4 11 0M56 31q5.5-4 11 0', o: '<circle class="ln" cx="50" cy="67" r="4.5"/>', big: true },
  smirk: { b: 'M33 38h11M56 35q5.5-3 11 0', m: 'M42 66q9 2 17-5' },
  tired: { b: 'M33 39l11-2M67 39l-11-2', m: 'M43 67h14', lids: true },
  disgusted: { b: 'M33 36l11 4M67 37l-11 3', m: 'M42 67q4-4 8 0q4 4 8 0' },
};
const faceKey = (name) => {
  const t = String(name).toLowerCase();
  if (FACES[t]) return t;
  return /exhaust|tired|weary|sleepy|bored/.test(t) ? 'tired' : /disgust|grossed/.test(t) ? 'disgusted' : /smirk|sly|smug/.test(t) ? 'smirk' : /laugh|joy|delight|smil/.test(t) ? 'happy' : /fear|terror|panic|afraid/.test(t) ? 'scared' : /shock|surpris|amaz/.test(t) ? 'surprised' : /cry|grief|sorrow|hurt/.test(t) ? 'sad' : /rage|fury|mad/.test(t) ? 'angry' : 'neutral';
};
const FHAIR = { short: 'M22 52C20 8 80 8 78 52C74 34 64 28 50 28C36 28 26 34 22 52Z', bun: 'M22 52C20 8 80 8 78 52C74 34 64 28 50 28C36 28 26 34 22 52Z', swept: 'M22 54C18 6 82 6 78 50C74 32 62 28 54 29C42 30 30 36 22 54Z', long: 'M20 58C16 6 84 6 80 58L83 94C75 86 76 70 76 56C71 36 29 36 24 56C24 70 25 86 17 94Z', bald: '' };
export function face(ref, name, { delta = '', opt = 0, look = null } = {}) {
  const L = looks(ref), M = changeMarks(delta);
  const f = FACES[faceKey(name)];
  const style = M.bald ? 'bald' : look == null ? L.style : styleOf(L, look), hc = M.older && L.hairCls === 'h' ? 'h2' : L.hairCls;
  const eyes = f.lids ? '<path class="ln" d="M36 47h6M58 47h6"/>' : f.big ? '<circle class="dk" cx="39" cy="47" r="2.6"/><circle class="dk" cx="61" cy="47" r="2.6"/>' : '<circle class="dk" cx="39" cy="47" r="1.7"/><circle class="dk" cx="61" cy="47" r="1.7"/>';
  const plaster = M.plaster ? '<rect class="plaster" x="58" y="56" width="10" height="5" rx="1.5" transform="rotate(-18 63 58)"/>' : '';
  return doc('0 0 100 100', 600, 600, `<rect class="bg${opt % 4 || ''}" width="100" height="100"/><path style="fill:${L.jacket}" d="M12 100C16 84 32 78 50 78C68 78 84 84 88 100Z"/><circle class="sk" cx="50" cy="50" r="27"/>${FHAIR[style] ? `<path class="${hc}" d="${FHAIR[style]}"/>` : ''}${style === 'bun' ? `<circle class="${hc}" cx="50" cy="11" r="8"/>` : ''}<path class="ln" d="${f.b}"/>${eyes}${f.m ? `<path class="ln" d="${f.m}"/>` : f.o}${plaster}`);
}

export function figure(ref, outfit = {}, { opt = 0 } = {}) {
  const L = looks(ref);
  const t = words(outfit.name, outfit.note);
  const tone = colorIn(t, L.jacket);
  const strip = /reflect|hi-?vis|stripe/.test(t);
  const hair = L.style === 'bald' ? '' : `<path class="${L.hairCls}" d="M49 25C48 12 72 12 71 25C69 19 51 19 49 25Z"/>`;
  return doc('0 0 120 160', 600, 800, `<rect class="bg${opt % 4 || ''}" width="120" height="160"/><path class="pants" d="M45 92h14l-1 58H47zM61 92h14l-2 58H62z"/><path style="fill:${tone}" d="M44 40h32l6 54H38z"/><path style="fill:${tone}" d="M44 42l-10 42 6 2 10-36M76 42l10 42-6 2-10-36"/>${strip ? '<path class="strip" d="M39 70h42"/>' : ''}<circle class="sk" cx="60" cy="26" r="11"/>${hair}`);
}

// ---------------------------------------------------------------- props
const propKind = (ref) => {
  const t = words(ref.name, ref.fields?.what);
  return /envelope|letter|paper|card|note|photo|map|ticket|document|folder/.test(t) ? 'flat' : /bag|satchel|backpack|case|suitcase|purse|holdall/.test(t) ? 'bag'
    : /bike|bicycle/.test(t) ? 'bike' : /key\b|keys/.test(t) ? 'key' : /phone|tablet|radio|walkie/.test(t) ? 'phone' : /bottle|glass|cup|mug|jar|flask|vase/.test(t) ? 'bottle' : /book|notebook|diary/.test(t) ? 'book' : 'box';
};
const propSize = { flat: 0.22, key: 0.14, phone: 0.16, bottle: 0.2, book: 0.22, bag: 0.34, box: 0.36, bike: 0.6 };
function propShape(kind, ref, view = 'front', state = '') {
  const t = words(ref.fields?.color, ref.fields?.material, ref.fields?.what);
  const c = colorIn(t, kind === 'flat' ? '#c8ab7f' : kind === 'bag' ? '#8e8a76' : kind === 'bike' ? '#3b3b40' : '#a7a49c');
  const st = String(state).toLowerCase();
  const broken = /broken|smash|crack|shatter/.test(st), open = /open|torn|unlocked/.test(st), blood = /blood/.test(st), burnt = /burn|scorch|charred/.test(st);
  const marks = `${broken ? '<path class="crack" d="M50 40l8 14-6 8 10 12M70 48l-6 10"/>' : ''}${blood ? '<circle class="blood" cx="46" cy="70" r="4"/><circle class="blood" cx="56" cy="64" r="2.5"/><circle class="blood" cx="72" cy="76" r="3"/>' : ''}${burnt ? '<path fill="#2f2b28" opacity=".55" d="M30 80q14-20 30-6q16-16 30 4v10H30z"/>' : ''}`;
  if (view === 'top') return `<rect style="fill:${c}" x="18" y="56" width="84" height="8" rx="2"/>`;
  if (view === 'side' && kind !== 'bike') return `<rect style="fill:${c}" x="54" y="32" width="12" height="58" rx="2"/>`;
  if (kind === 'flat') return open ? `<path style="fill:${c}" d="M18 36L60 8L102 36Z" opacity=".85"/><rect style="fill:${c}" x="18" y="36" width="84" height="54" rx="2"/><path class="ln" d="M18 36l42 26 42-26"/>${marks}` : `<rect style="fill:${c}" x="18" y="34" width="84" height="54" rx="2"/>${view === 'back' ? '<path class="ln" d="M18 34l42 28 42-28"/>' : '<path class="ln" d="M18 36l42 30 42-30"/><circle cx="60" cy="64" r="6" fill="#9b2f2a"/>'}${marks}`;
  if (kind === 'bag') return `<path class="ln" style="stroke:#6c6856;stroke-width:4" d="M32 52C32 14 88 14 88 52"/><rect style="fill:${c}" x="24" y="48" width="72" height="50" rx="8"/>${view === 'back' ? '' : `<path fill="#000" opacity=".12" d="M24 56c0-4 2-8 8-8h56c6 0 8 4 8 8v16c-20 8-52 8-72 0z"/><rect class="m2" x="56" y="70" width="8" height="8" rx="1"/>`}${open ? '<path class="ln" d="M28 50l-8-10"/>' : ''}${marks}`;
  if (kind === 'bike') return view === 'side' || view === 'back' ? `<ellipse class="ln" cx="60" cy="80" rx="4" ry="20"/><path class="ln" style="stroke-width:2.4" d="M60 60V44M50 42h20"/>` : `<circle class="ln" cx="32" cy="80" r="20"/><circle class="ln" cx="88" cy="80" r="20"/><path class="ln" style="stroke-width:2.4;stroke:${c}" d="M32 80L50 54H80L88 80M50 54L60 80H32M60 80L80 54M77 46h11M50 54l-3-8h-7"/>${marks}`;
  if (kind === 'key') return `<circle class="ln" style="stroke-width:5;stroke:${c}" cx="40" cy="60" r="14"/><path class="ln" style="stroke-width:5;stroke:${c}" d="M54 60h44M84 60v12M94 60v8"/>${marks}`;
  if (kind === 'phone') return `<rect style="fill:${c}" x="40" y="22" width="40" height="76" rx="7"/><rect fill="#1f2026" x="44" y="30" width="32" height="58" rx="2"/>${broken ? '<path class="crack" style="stroke:#e9e9e9" d="M50 36l10 18-6 10 12 16"/>' : ''}${blood ? marks : ''}`;
  if (kind === 'bottle') return `<path style="fill:${c}" d="M52 18h16v18c8 4 12 10 12 20v40a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6V56c0-10 4-16 12-20z" opacity=".9"/>${marks}`;
  if (kind === 'book') return `<rect style="fill:${c}" x="28" y="26" width="64" height="76" rx="3"/><path fill="#000" opacity=".15" d="M28 26h8v76h-8z"/>${open ? '<path class="ln" d="M60 26v76"/>' : ''}${marks}`;
  return `<rect style="fill:${c}" x="26" y="38" width="68" height="56" rx="4"/><path fill="#000" opacity=".1" d="M26 38h68v12H26z"/>${open ? '<path class="ln" d="M26 38l-8-12h68l8 12"/>' : ''}${marks}`;
}
// slot: front | side | back | top | scale · state: a state's name, drawn on the front
export function propArt(ref, slot, { opt = 0, state = '' } = {}) {
  const kind = propKind(ref);
  const bg = `<rect class="bg${opt % 4 || ''}" width="120" height="120"/>`;
  if (slot === 'scale') {
    const k = propSize[kind] || 0.35;
    const obj = `<g transform="translate(${66 - 4} ${112 - 120 * k}) scale(${k})">${propShape(kind, ref, 'front')}</g>`;
    return doc('0 0 120 120', 600, 600, `${bg}<path class="hint" d="M8 112h104"/><circle class="m" cx="34" cy="20" r="8"/><path class="m" d="M26 30h16l3 40h-5l-2 42h-6l-1-30-1 30h-6l-2-42h-5z"/>${obj}`);
  }
  const tweak = opt % 2 ? ' transform="translate(60 60) scale(.9) translate(-60 -60)"' : opt === 2 ? ' transform="translate(60 60) rotate(-6) translate(-60 -60)"' : '';
  return doc('0 0 120 120', 600, 600, `${bg}<g${tweak}>${propShape(kind, ref, slot, state)}</g>`);
}

// ---------------------------------------------------------------- locations
const isExt = (ref) => /^EXT/i.test(ref.source?.intExt || '') || (!/^INT/i.test(ref.source?.intExt || '') && /street|road|roof|bridge|alley|market|park|field|beach|yard|garden|square|outside/.test(words(ref.name, ref.fields?.what)));
function place(ref, opt, ext) {
  const t = words(ref.name, ref.fields?.what, ref.fields?.details);
  if (!ext) { // a room: back wall, floor, a window, a door, a table under a lamp
    const winX = opt % 2 ? 214 : 26, doorX = opt % 2 ? 26 : 262;
    return `<rect class="wall" width="320" height="130"/><path class="fl" d="M0 130H320V180H0Z"/><rect class="win" x="${winX}" y="30" width="70" height="62"/><path class="ln" d="M${winX + 35} 30v62M${winX} 61h70"/><rect class="m" x="${opt % 2 ? 220 : 0}" y="100" width="100" height="30"/><path class="ln" d="M176 0v42"/><circle class="lamp" cx="176" cy="48" r="7"/><rect class="m2" x="122" y="104" width="112" height="8" rx="2"/><path class="ln" d="M132 112v34M224 112v34"/><rect class="dk" x="${doorX}" y="40" width="40" height="90"/>${/shelf|book|shop|store|counter|bar|café|cafe/.test(t) ? '<path class="ln" d="M110 40h60M110 60h60M110 80h60"/>' : ''}`;
  }
  const sky = '<path class="far" d="M0 112h22V86h18v14h16V66h22v46h14V92h20v20h18V72h24v40h16V96h22v16h20V84h26v28h24V94h24v18h14v8H0z"/>';
  if (/bridge|road|street|highway|motorway/.test(t)) return `${sky}<path class="fl" d="M0 180L130 98H190L320 180Z"/><path class="ln" d="M160 100v10M160 122v14M160 150v22" style="stroke:#f1efe9;stroke-width:2"/><path class="ln" d="M0 118L130 94M320 118L190 94M40 112V70M280 112V70"/><circle class="lamp" cx="40" cy="68" r="5"/><circle class="lamp" cx="280" cy="68" r="5"/>`;
  if (/alley|lane|passage/.test(t)) return `<path class="wall" d="M0 0H110L140 120V180H0Z"/><path class="wall2" d="M320 0H210L180 120V180H320Z"/><path class="fl" d="M140 120H180L320 180H0Z"/><path class="ln" d="M18 30h60M18 70h66M18 110h72M24 30l50 40M24 70l56 40"/><rect class="dk" x="230" y="66" width="30" height="64"/>`;
  if (/market|stall|bazaar|fair/.test(t)) return `<path class="fl" d="M0 120H320V180H0Z"/>${[0, 1, 2, 3].map((i) => `<g transform="translate(${16 + i * 76} 0)"><path fill="#c3c6d2" d="M0 60h64v14q-8 8-16 0q-8 8-16 0q-8 8-16 0q-8 8-16 0z"/><rect fill="#e9e7e1" x="6" y="96" width="52" height="24"/><path class="ln" d="M6 74v46M58 74v46"/></g>`).join('')}`;
  return `${sky}<path class="fl" d="M0 120L320 110V180H0Z"/><rect class="m" x="34" y="56" width="44" height="46" rx="3"/><ellipse class="m2" cx="56" cy="56" rx="22" ry="5"/><path class="ln" d="M40 102v20M72 102v20"/><rect class="m" x="138" y="62" width="48" height="56"/><rect class="dk" x="152" y="78" width="18" height="40"/><path class="m2" d="M196 116L320 108v9L196 124Z"/>`;
}
// slot: layout (the whole place), or a crop [x, y, w, h] of it for an area or an element
export function placeArt(ref, { opt = 0, crop = null } = {}) {
  const ext = isExt(ref);
  const mirror = ext && opt % 2 === 1, low = opt >= 2; // a room flips its window and door itself (in place())
  let vb = '0 0 320 180';
  if (crop) { let [x, y, w, h] = crop; if (mirror) x = 320 - x - w; vb = `${x} ${y} ${w} ${h}`; }
  const t = `${mirror ? 'translate(320 0) scale(-1 1)' : ''}${low ? ' translate(0 6)' : ''}`;
  return doc(vb, crop ? 640 : 960, crop ? 360 : 540, `<rect class="bg" width="320" height="180"/><g transform="${t}">${place(ref, opt, ext)}</g>`);
}
// where an area or element sits in the layout, if nobody said: spread them out
export const autoCrop = (i) => [[14, 40, 150, 84], [160, 40, 150, 84], [90, 20, 150, 84], [30, 80, 150, 84], [170, 86, 150, 84], [0, 0, 160, 90]][i % 6];

// ---------------------------------------------------------------- textures: SVG noise swatches
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)); };
const noise = (id, [freq, oct, seed, color, a, b]) => { const [r, g, bl] = rgb(color); return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${bl} ${a} 0 0 0 ${b}"/></filter>`; };
const TEX = {
  concrete: { base: '#b8b5ac', layers: [[0.9, 3, 3, '#000000', 0.8, -0.32], [1.6, 2, 7, '#ffffff', 0.8, -0.34], [0.045, 2, 11, '#7a7873', 9, -5.9]] },
  steel: { base: '#a8abb1', layers: [['0.012 0.5', 2, 5, '#000000', 0.8, -0.32], ['0.02 0.12', 3, 9, '#9a6a4c', 7, -4.5], [1.4, 2, 4, '#ffffff', 0.6, -0.27]] },
  paint: { base: '#4e6a5d', layers: [[0.06, 3, 6, '#b3ae9f', 14, -8.3], [1.2, 2, 3, '#000000', 0.6, -0.26], [0.5, 2, 8, '#ffffff', 0.5, -0.22]] },
  plaster: { base: '#e5e0d5', layers: [[0.45, 3, 2, '#7d7464', 0.7, -0.3], [0.025, 2, 12, '#cdbb92', 4, -2.3]] },
  lino: { base: '#c8c0ac', defs: (id) => `<pattern id="${id}p" width="25" height="25" patternUnits="userSpaceOnUse"><rect width="12.5" height="12.5" fill="#a99e86"/><rect x="12.5" y="12.5" width="12.5" height="12.5" fill="#a99e86"/></pattern>`, under: (id) => `<rect width="100" height="100" fill="url(#${id}p)"/>`, layers: [[0.8, 2, 4, '#000000', 0.6, -0.26], [0.07, 2, 9, '#e9e4d6', 6, -3.6]] },
  formica: { base: '#d9d3c4', layers: [[2.4, 1, 3, '#000000', 1.2, -0.66], [2.0, 1, 8, '#ffffff', 1.2, -0.64]] },
  asphalt: { base: '#55555a', layers: [[1.8, 2, 4, '#ffffff', 1.2, -0.72], [0.7, 3, 6, '#000000', 0.8, -0.32]] },
  stone: { base: '#b5aa96', defs: (id) => `<pattern id="${id}p" width="50" height="26" patternUnits="userSpaceOnUse"><path d="M0 .5H50M0 13.5H50M25 0V13M0 13V26M50 13V26" stroke="#857b69" stroke-width="1.3" fill="none"/></pattern>`, over: (id) => `<rect width="100" height="100" fill="url(#${id}p)" opacity=".8"/>`, layers: [[0.35, 4, 5, '#000000', 0.8, -0.32], [1.3, 2, 3, '#ffffff', 0.6, -0.27]] },
  iron: { base: '#6e4b37', layers: [[0.25, 4, 3, '#2e2018', 1.1, -0.45], [0.9, 3, 7, '#b06d3e', 1.1, -0.5]] },
  wood: { base: '#9a7650', layers: [['0.01 0.35', 3, 4, '#3e2a18', 1.2, -0.5], ['0.02 0.9', 2, 8, '#d2b48a', 0.8, -0.36]] },
  canvas: { base: '#9aa4c4', defs: (id) => `<pattern id="${id}w" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4M1 0V4" stroke="#000" stroke-opacity=".12" stroke-width="1"/></pattern>`, over: (id) => `<rect width="100" height="100" fill="url(#${id}w)"/>`, layers: [[0.6, 3, 4, '#000000', 0.6, -0.26]] },
};
export const materialOf = (name = '', note = '') => {
  const t = words(name, note);
  return /concrete|cement/.test(t) ? 'concrete' : /rust/.test(t) ? 'iron' : /steel|metal|iron|tin|galvan|alumin|chrome/.test(t) ? 'steel' : /paint/.test(t) ? 'paint' : /lino|vinyl|tile|check/.test(t) ? 'lino'
    : /formica|laminate|plastic/.test(t) ? 'formica' : /asphalt|road|tarmac/.test(t) ? 'asphalt' : /stone|brick|cobble|marble|granite/.test(t) ? 'stone' : /wood|timber|plank|parquet|oak|pine/.test(t) ? 'wood'
      : /fabric|canvas|cloth|curtain|awning|linen|carpet|rug/.test(t) ? 'canvas' : 'plaster';
};
export function texture(name, note, { opt = 0 } = {}) {
  const kind = materialOf(name, note), T = TEX[kind];
  const tint = kind === 'paint' ? colorIn(words(name, note).replace(/paint(ed)?/, ''), T.base) : kind === 'canvas' ? colorIn(words(name, note), T.base) : T.base;
  const id = `t${opt}`;
  const layers = T.layers.map((l) => [l[0], l[1], l[2] + opt * 5, ...l.slice(3)]);
  const defs = layers.map((l, i) => noise(`${id}-${i}`, l)).join('') + (T.defs ? T.defs(id) : '');
  return doc('0 0 100 100', 600, 600, `<defs>${defs}</defs><rect width="100" height="100" fill="${tint}"/>${T.under ? T.under(id) : ''}${layers.map((_, i) => `<rect width="100" height="100" filter="url(#${id}-${i})"/>`).join('')}${T.over ? T.over(id) : ''}`);
}

// ---------------------------------------------------------------- light: a source's colour and kind, from its words
export function lightOf(name = '', quality = '') {
  const t = words(name, quality);
  const kind = /window|daylight|skylight|tv|screen|monitor/.test(t) ? 'window' : /street|sodium|lamp ?post/.test(t) ? 'lamp' : /flood|stadium|search/.test(t) ? 'flood' : /glow|city|sky|ambient/.test(t) ? 'glow' : 'bulb';
  const color = /orange|sodium/.test(t) ? '#ffa94d' : /warm|tungsten|yellow|candle|fire|amber/.test(t) ? '#ffc46b' : /cold|cool|blue|moon|fluorescent|tv|screen|monitor/.test(t) ? '#bcd0ff' : /red|neon red/.test(t) ? '#ff6a5a' : /green/.test(t) ? '#8dffb0' : /white|flood|daylight/.test(t) ? '#eef2ff' : '#ffd38a';
  return { kind, color };
}
