// SORA, rebuilt as data on the engine: walk → look up → launch → canyon → land → flip → collapse.
FILM({
  fps: 24,
  music: { bpm: 120, key: 60, sections: [
    { at: 0, to: 1.75, style: 'intro', chords: ['IV', 'V'] },
    { at: 1.75, to: 2.5, style: 'riser' },
    { at: 2.5, to: 5.42, style: 'drive', chords: ['IV', 'V', 'iii', 'vi'] },
    { at: 5.5, style: 'stab', chord: 'vi' },
    { at: 5.9, to: 6.25, style: 'tension', chord: 'vi' },
    { at: 6.3, to: 7.0, style: 'fill' },
    { at: 7.0, style: 'tada', chord: 'I', tapeStop: [7.12, 7.5] },
    { at: 8.0, to: 10, style: 'outro', chords: ['IV', 'V', 'I'] },
  ] },
  shots: [
    { id: 'walk', dur: 1.75, set: 'embankment', start: { x: 0 },
      camera: { zoom: 5.2, floorY: 905, follow: { k: .82, lead: 34 } },
      hero: [{ at: 0, do: 'walk', dur: 1.5 }, { at: 1.5, do: 'stop', to: 'lookUp' }, { at: 1.2, look: { lookY: -1, lookX: .6 } }] },

    { id: 'face', dur: .5, set: 'sky_close', wind: [-420, -30],
      camera: { zoom: [28, 33], target: 'head', offset: [5.5, 4.2], roll: [-5, -2] },
      hero: [{ at: 0, do: 'hold', pose: { ...POSE.lookUp, neck: -9, head: -6, lookY: -.75, lookX: .55 }, dur: .5 },
        { at: .08, face: 'blink', dur: .06 }, { at: .17, face: 'determined' }, { at: .23, face: 'glint', dur: .18 }],
      sfx: [{ at: .17, name: 'heartbeat' }] },

    { id: 'launch', dur: .5, set: 'embankment', wind: [-120, 0],
      camera: { zoom: 4.3, floorY: 955, follow: { k: 0, lead: 6 }, dy: 150 },
      hero: [{ at: 0, do: 'launch' }] },

    { id: 'canyon', dur: 2, set: 'canyon', out: { white: .15 } },

    { id: 'roof', dur: 2.75, set: 'rooftop', start: { x: 0 }, in: { white: .15 },
      camera: { zoom: [[0, 3.3], [.75, 3.95, 'in2'], [1.3, 4.6], [2.75, 4.75]], floorY: [[0, 984], [.75, 885, 'out']],
        x: [[0, -60], [.75, -6, 'out2'], [1.55, 4], [2.25, 56], [2.75, 70]] },
      hero: [{ at: 0, do: 'dive_land' }, { at: .75, do: 'rise' }, { at: 1.37, do: 'front_flip' }, { at: 2.25, do: 'wobble' }],
      text: [{ on: 'land', str: 'ドン!!', size: 190, dx: 355, dy: -632, angle: -8 }] },

    { id: 'sit', dur: 2.5, set: 'rooftop',
      camera: { zoom: [[0, 8.6], [.6, 8.6], [2.5, 11.8]], floorY: [[0, 1000], [.6, 1000], [2.5, 1150]], follow: { k: 1, lead: 22 } },
      flare: [1640, 150, [[0, .75], [1.5, .75], [2.5, 1]]],
      hero: [{ at: .02, do: 'sit_down' }, { at: .5, do: 'sit_pant', dur: 2, lookUp: .9, smile: 1.4 }],
      text: [{ at: .8, str: 'ハァ…', anchor: 'head', dx: 300, dy: -150, size: 82, style: 'soft', life: .8 },
        { at: 1.35, str: 'ハァ…', anchor: 'head', dx: 420, dy: 60, size: 70, angle: 5, style: 'soft', life: .8 }] },
  ],
});
