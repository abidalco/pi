# Studio app — plan (awaiting Hadi's OK on the screen list)

Goal: make films without Claude. The engine in this folder already renders a film from `film.js` data.
The studio is a local app that writes that data with a mouse and records it. Claude is only needed to add
capabilities (new actions, sets, characters), and screen 4 removes most of that too.

Run as: `npm run studio` → local server + browser app. The server only exists so the page can trigger
render.mjs / the sound build / ffmpeg (a browser can't run them on its own).

## Screens
1. **Timeline**: one row of shot blocks (drag to resize = duration). Under the selected shot: tracks for
   hero actions, face/look overlays, camera keys, text and sound. Drag items from the library; click one
   to edit its params (speed, dist, dir…).
2. **Preview**: live player above the timeline (play, scrub, frame step, loop shot), plus a phone-size toggle.
   Uses the engine's seek(t) directly, so it shows exactly what gets recorded.
3. **Library**: actions, poses, faces, sets, characters, sound cues, each with a thumbnail. Drag onto the timeline.
4. **Pose / action maker**: drag the rig's joints to make poses; put poses on a mini timeline to make a
   new action; save it into the library. Covers new moves without Claude.
5. **Import**: a character from layered PNG parts (place pivots, map parts to bones), or a location from
   layered images (set horizon, floor line, scale). Needs the PNG-part rig loader in the engine.
6. **Record**: pick music (track or synth sections), press Record → contact sheet, then MP4 with mastered
   sound. Shows progress; output goes to `films/<name>/out/`.

Files: everything saves to `films/<name>/film.js` in the same format as `engine/README.md`, so Claude can still
read and write films, and old films open in the app.

## Build order
1 + 2 + 6 first (usable on day one with the current library), then 3, then 5 (own characters), then 4.
