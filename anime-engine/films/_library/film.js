// Action library reel: one shot per action, labelled. Reference for writing films (see engine/README.md).
const cam = { zoom: 6.5, floorY: 1000, follow: { k: 1, lead: 0 } };
const label = s => [{ at: 0, str: s, anchor: 'screen', dx: -480, dy: -430, size: 64, angle: 0, life: 9, style: 'soft' }];
const shot = (name, dur, hero, extra = {}) => ({ id: name, dur, set: 'rooftop', camera: cam, text: label(name), hero, ...extra });
const shots = [
  shot('idle', 1.2, [{ at: 0, do: 'idle', dur: 1.2 }], { start: { x: 0, dir: 1, pose: 'stand' } }),
  shot('walk', 1.5, [{ at: 0, do: 'walk', dur: 1.5 }]),
  shot('run + stop', 1.5, [{ at: 0, do: 'run', dur: 1.1 }, { at: 1.1, do: 'stop' }]),
  shot('wave', 1.4, [{ at: 0, do: 'wave', dur: 1.4 }]),
  shot('point', 1.2, [{ at: 0, do: 'point', dur: 1.2 }]),
  shot('talk', 1.4, [{ at: 0, do: 'talk', dur: 1.4 }]),
  shot('hop', 1.0, [{ at: 0, do: 'hop', dist: 30 }, { at: .6, do: 'idle' }]),
  shot('launch', 1.0, [{ at: 0, do: 'launch' }]),
  shot('fly', 1.4, [{ at: 0, do: 'fly', to: [420, -60], dur: 1.4, y: -170 }], { start: { x: -60, dir: 1 }, camera: { zoom: 3.4, floorY: 980, follow: { k: .7, lead: 0 } } }),
  shot('dive_land + rise', 1.6, [{ at: 0, do: 'dive_land' }, { at: .75, do: 'rise' }], { start: { x: 0, dir: 1 } }),
  shot('front_flip + wobble', 1.6, [{ at: 0, do: 'front_flip' }, { at: .88, do: 'wobble' }]),
  shot('sit_down + sit_pant', 2.4, [{ at: 0, do: 'sit_down' }, { at: .5, do: 'sit_pant', dur: 1.9, lookUp: 1.0, smile: 1.4 }]),
  shot('walk, dir -1', 1.4, [{ at: 0, do: 'walk', dur: 1.4, dir: -1 }], { start: { x: 0, dir: -1, pose: 'stand' } }),
];
let t = 0;
const sheet = shots.flatMap(s => { const a = [t + s.dur * .3, t + s.dur * .75]; t += s.dur; return a.map(x => +x.toFixed(2)); });
FILM({ fps: 24, sheet, shots });
