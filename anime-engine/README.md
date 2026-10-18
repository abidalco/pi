# Anime engine

A code-driven 2D anime film engine. A rigged character, painted sets, camera, anime effects and a synthesized
soundtrack, all driven by one small data file per film and rendered frame-exact to MP4. It also runs live as a
playable "puppet" in the browser, plus a 3D low-angle test.

Built with Claude Code, October 2026.

| | |
|---|---|
| `media/sora.mp4` | 10 s test film, everything drawn in code (walk → launch → fly between towers → land → flip → collapse) |
| `media/cap-test.mp4` | the same engine with an image-generated character: 18 key drawings + a drawn walk cycle |
| `media/*sheet.jpg` | contact sheets of the films and the action library |

## How it works

- **A film is data.** `films/<name>/film.js` lists shots: set, camera, timed actions (`walk`, `wave`, `front_flip`,
  `dive_land`, `sit_pant`…), expressions, SFX lettering and a music spec. Writing one takes about 1k tokens; the
  engine never needs to be read. The full format is in [`engine/README.md`](engine/README.md).
- **Drawings on twos, camera on ones.** Character poses hold for two frames like TV anime while the camera and
  effects run every frame.
- **Characters.** `sora` is drawn in code (cel-shaded cut-out rig). Image characters live in `engine/characters/`:
  `cap` was generated with fal (Seedream 4 Edit, ~$0.96 for 32 images) as body parts for the rig plus whole-body
  key drawings that the actions cut to on their strongest frames. Scripts that cut and register the art are in
  `engine/characters/cap/src/`.
- **Sound.** Every action emits cues (steps, booms, whooshes, breaths); `engine/sound/build.py` synthesizes SFX and
  a chord-section score, mastered to -14 LUFS at render.

## Run it

```
npm install && npx playwright install chromium     # renderer
pip install -r requirements.txt                    # sound + art tools (Python 3)
```

| | |
|---|---|
| Live puppet | open `engine/play.html` in Chrome: arrows walk/run, Space flips, D dives in, S sits… pick a character |
| 3D low-angle test | open `engine/game3d.html` (needs internet for three.js): 50 mm lens, 45° below the face, drag to orbit |
| Contact sheet | `node engine/tools/peek.mjs films/sora-v2 --sheet` → `films/sora-v2/out/sheet.jpg` |
| Sound | `node engine/tools/peek.mjs films/sora-v2 --cues && python3 engine/sound/build.py films/sora-v2` |
| Final MP4 | `node render.mjs films/sora-v2 --audio films/sora-v2/sound/mix.wav` → `films/sora-v2/out/` |

New film: copy `films/_anime/` to `films/<name>/` and write `film.js` (see `films/sora-v2/film.js` and
`films/cap-test/film.js`). `films/_library/` shows every action; `films/_lineup/` checks a character's drawings
share one scale.

## What's next

`engine/STUDIO-PLAN.md`: a studio app (timeline, live preview, library, pose maker, PNG character import, record
button) so films can be made with the mouse and Claude is only needed for new capabilities.
