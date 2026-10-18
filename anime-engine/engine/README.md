# Anime engine — write a film as data

A film is one data file. The engine (this folder) draws the character, the sets, the camera, the effects and
the sound. **To make a film, read only this file and write `films/<name>/film.js`.** Don't read the engine code.

```
films/<name>/index.html   ← copy of films/_anime/index.html (unchanged)
films/<name>/film.js      ← the only file you write
```

Render (from `motion-studio/`):
```
node engine/tools/peek.mjs films/<name> --sheet            # half-size contact sheet → out/sheet.jpg (one image)
node engine/tools/peek.mjs films/<name> --t 1.2,3.4        # single frames (scaled)
node engine/tools/cues.mjs films/<name>                    # → sound/cues.json
.venv/bin/python engine/sound/build.py films/<name>        # → sound/mix.wav
node render.mjs films/<name> --audio films/<name>/sound/mix.wav   # final mp4
```

## film.js

```js
FILM({
  fps: 24,                              // 1920×1080; character drawn on twos automatically
  music: { ... },                       // see Sound
  shots: [ { ...shot }, ... ],          // played in order; the hero carries over between shots
});
```

### Shot
| key | meaning |
|---|---|
| `id` | name |
| `dur` | seconds |
| `set` | `embankment` · `rooftop` · `sky_close` (blurred sky for close-ups) · `canyon` (3D chase, see below) |
| `start` | `{ x, dir, pose }` — optional; otherwise continues from the previous shot. `dir: -1` faces left |
| `camera` | see Camera |
| `hero` | list of actions and overlays, `at` in shot seconds |
| `text` | katakana/SFX lettering, see Text |
| `sfx` | extra sound cues `[{ at, name }]` (actions already emit their own) |
| `in` / `out` | `{ white: .15 }` or `{ black: .3 }` fades |
| `flare` | `[x, y, k]` sun flare in screen px; `k` may be a value spec. Sets have a default |
| `wind` | `[x, y]` air blowing on hair/scarf (world units/s), default per set |
| `light` | override `{ x, y, s, r }` light direction / shadow width / rim width |

### Value specs (camera, flare)
`5.2` constant · `[a, b]` eased from a to b across the shot · `[[t, v], [t, v, 'out'], ...]` keys in shot seconds
(eases: `lin inOut in out in2 out2 outExpo outBack sine`).

### Camera
| key | meaning |
|---|---|
| `zoom` | px per world unit. Character ≈ 96 units tall: 3 = wide, 5 = medium, 8–11 = close, 30 = face |
| `floorY` | screen y of the floor line (px). 900–1000 for standing shots |
| `x` | `'follow'` (default) or a value spec in world units |
| `follow` | `{ k: .85, lead: 30 }` — k = how much of the hero's travel the camera keeps up with |
| `target: 'head'` | close-up: lock on the head; `offset: [dx, dy]` world units |
| `roll` | degrees |
| `dy` | (embankment) push the whole set down in px for a low angle, e.g. 150 |
| `lift` | (rooftop) lower horizon in px for low/seated shots |
| `shake: false` | disable the automatic shakes on launch / land / flipLand / plop |

### Hero actions — `{ at, do: '<action>', ...params }`
Each action starts where the previous one ended (position, pose). Starting a new action cuts the previous one.

| action | params (defaults) | does | emits cues |
|---|---|---|---|
| `idle` | `dur 1` | stand and breathe | |
| `hold` | `pose, dur 1, breathe` | hold a library pose (or the current one) | |
| `pose` | `to, dur .35, dx 0, ease, plant` | move into a library pose in place | |
| `walk` | `speed 76, dur 1` | walk cycle (2 steps/s at 76) | step |
| `run` | `speed 210, dur 1` | run cycle, arms pumping | runstep |
| `stop` | `to 'stand', dur .25, slide 12` | brake out of a walk/run | scuff |
| `wave` | `dur 1.2` | raises near arm, waves, smiles | swish |
| `point` | `dur 1` | arm thrust forward | swish |
| `talk` | `dur 1.5, pose` | mouth flaps on syllables, hand gestures | talk |
| `hop` | `height 26, dist 0` | small jump | push, step |
| `launch` | `dur .5, takeoff .25` | crouch, then rockets up out of frame at `takeoff` | gather, launch |
| `fly` | `to [dx,dy], dur 1, arc -40, y` | superhero flight along a curve | whoosh |
| `dive_land` | `from [-250,-330], dur .75` | dives in from offset, brakes, superhero landing on current x | dive, land |
| `rise` | `dur .62` | from the landing crouch: settles, lifts head, smirks | |
| `front_flip` | `dist 75, height 86` (.88 s) | crouch, spring, tucked flip, sticks the landing | push, spring, spin, flipLand |
| `wobble` | `dur .5` | legs give out after a landing, flailing balance | shuffle |
| `sit_down` | (.48 s) | staggers back and drops onto the seat | shuffle, plop |
| `sit_pant` | `dur 2, period .5, lookUp, smile` | slumped panting; lookUp/smile = seconds into the action | exhale (each period) |

`any action` also accepts `dir: -1|1` and `x` (teleport before starting).

### Overlays — `{ at, face|look, dur? }` (without dur they stay on)
- `face`: `neutral determined grit smirk smile happy tired surprised blink glint` (or an object of face fields)
- `look`: `up down forward back sky` (or `{ neck, head, lookX, lookY }`)

### Library poses (for `hold` / `pose` / `start.pose`)
`stand lookUp crouch launch fly brake land landRise preFlip spring tuck stick wobble sit`

### Text
`{ str: 'ドン!!', on: 'land' | at: 1.2, anchor: 'cue'|'head'|'screen', dx, dy (px), size 120, angle -6, life .75, style: 'impact'|'soft' }`

### Effects (automatic, from cues)
launch → impact frame, cracks, dust, debris, ring, updraft lines, shake · land → impact frame, crater, big dust,
debris, ring, radial lines, shake · flipLand → puff · plop → puff, sweat burst · exhale → breath puffs.
Fast actions (launch, dive, flips, fly) get smear ghosts and spin arcs automatically.

### The canyon chase (`set: 'canyon'`)
Camera rushes between two towers toward the sun with the hero seen from behind. `dur` ≈ 2.
`chase: { z: [[0,-150],[.87,22],[1.35,92],[2,190]], y: [34,44], enter: .4, birds: .7, roll: [1.41,1.81], flare: [1.15,1.67] }`
(all optional; z keys = camera depth; the towers span z 30–86, so the second/third keys are gap in/out).

## Sound
`music` either `{ track: 'music.wav' }` (in the film folder, trimmed to length) or a synth score:
```js
music: { bpm: 120, key: 60,           // key = MIDI root (60 = C)
  sections: [
    { at: 0,   to: 1.75, style: 'intro',   chords: ['IV','V'] },
    { at: 1.75, to: 2.5, style: 'riser' },
    { at: 2.5, to: 5.42, style: 'drive',   chords: ['IV','V','iii','vi'] },
    { at: 5.5,           style: 'stab',    chord: 'vi' },
    { at: 5.9, to: 6.25, style: 'tension', chord: 'vi' },
    { at: 6.3, to: 7.0,  style: 'fill' },
    { at: 7.0,           style: 'tada',    chord: 'I', tapeStop: [7.12, 7.5] },
    { at: 8.0, to: 10,   style: 'outro',   chords: ['IV','V','I'] },
  ] }
```
Chords: `I ii iii IV V vi` (roman numerals in the key). Every cue an action emits gets its own synthesized
SFX (footsteps, booms, whooshes, breaths…); the mix is mastered to −14 LUFS by render.mjs.
