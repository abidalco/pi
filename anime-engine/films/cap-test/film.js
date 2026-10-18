// Rig + key-drawing test: the fal-generated character through every drawn pose, two continuous shots.
FILM({
  fps: 24, character: 'cap',
  music: { bpm: 120, key: 60, sections: [
    { at: 0, to: 5.0, style: 'intro', chords: ['IV', 'V', 'iii', 'vi'] },
    { at: 5.0, to: 5.55, style: 'riser' },
    { at: 5.55, to: 6.77, style: 'drive', chords: ['IV', 'V'] },
    { at: 6.85, style: 'stab', chord: 'vi' },
    { at: 7.1, to: 7.47, style: 'tension', chord: 'vi' },
    { at: 7.47, to: 8.35, style: 'fill' },
    { at: 8.35, style: 'tada', chord: 'I', tapeStop: [8.47, 8.85] },
    { at: 9.33, to: 11.6, style: 'outro', chords: ['IV', 'V', 'I'] },
  ] },
  shots: [
    { id: 'hello', dur: 6.1, set: 'rooftop', start: { x: -80, dir: 1, pose: 'stand' },
      camera: { zoom: [[0, 5.2], [5.2, 6.1], [6.1, 5.6, 'out']], floorY: [[0, 970], [5.2, 1000], [6.1, 960]], follow: { k: .8, lead: 4 } },
      hero: [
        { at: 0, do: 'idle', dur: .5 }, { at: .5, do: 'walk', dur: 1.5 }, { at: 2.0, do: 'stop' },
        { at: 2.3, do: 'wave', dur: 1.1 }, { at: 3.4, do: 'talk', dur: 1.2 }, { at: 4.6, do: 'point', dur: .7 },
        { at: 5.3, do: 'launch', dur: .8 },
      ] },
    { id: 'land', dur: 5.5, set: 'rooftop', start: { x: 0 },
      camera: { zoom: [[0, 3.4], [.75, 4.2, 'in2'], [1.37, 4.8], [2.25, 5.0], [3.2, 5.6], [5.5, 8.4]],
        floorY: [[0, 1000], [.75, 900, 'out'], [3.2, 930], [5.5, 1075]],
        x: [[0, -60], [.75, -8, 'out2'], [1.37, 4], [2.25, 60], [2.75, 74], [5.5, 84]] },
      flare: [1640, 120, [[0, .5], [3.2, .55], [5.5, .95]]],
      hero: [{ at: 0, do: 'dive_land' }, { at: .75, do: 'rise' }, { at: 1.37, do: 'front_flip' }, { at: 2.25, do: 'wobble' },
        { at: 2.75, do: 'sit_down' }, { at: 3.23, do: 'sit_pant', dur: 2.27, lookUp: 1.0, smile: 1.5 }],
      text: [{ on: 'land', str: 'ドン!!', size: 190, dx: 380, dy: -560, angle: -8 },
        { at: 3.7, str: 'ハァ…', anchor: 'head', dx: 260, dy: -160, size: 76, style: 'soft', life: .8 },
        { at: 4.25, str: 'ハァ…', anchor: 'head', dx: 360, dy: 30, size: 66, angle: 5, style: 'soft', life: .8 }] },
  ],
});
