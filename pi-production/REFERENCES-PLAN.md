# References and the four tabs: integration plan

**Built on 20 Oct 2026, steps 7–12, in `pi-production/`.** The choices made where §11 was open:
1. **Approve:** kept, and it never blocks. Shots use a card before it's approved; an edit after approval says so in one line, with *Save as v(n+1)* or *Undo*.
2. **Models:** images are placeholder sketches drawn in code until `PI_IMAGES=openai` and `OPENAI_API_KEY` are set, with a monthly cap (`PI_IMAGE_CAP`, 200 images). Voice samples use this Mac's own voices (`say` + ffmpeg, free). There's no video model yet, so clips are uploaded.
3. **Episodes:** later. A variant starts at a scene.
4. **Shot breakdown:** stays in Script; Production reads it.

**Also built:**
- Locations have four tabs: **Layout** (with the areas) · **Elements** · **Texture** · **Light**.
- Light sources are drawn from their words (warm or cold, hard or soft); they need no generated image.
- Cards sort in the order the script meets them.
- *The same as…* merges two cards when the script renames someone.

*Plan written 20 Oct 2026. Built from Abdallah's Section 3 spec (`specs/03-references.md`, pushed on `bot-spec` on Oct 19) and Hadi's call: the tabs are **Brainstorm · References · Script · Production**, and References holds **Characters · Props · Locations**. Demo: `mockups/references-demo.html` (launch config `pi-mockups`, :3149). Nothing in the app has changed yet.*

## 1. The four tabs

- **Row 1:** π · the project pill · **Brainstorm · References · Script · Production** · people · ⋯. The sections stop hiding in the pill menu and become tabs.
- **The pill is only the project now:** Overview, the other projects, All projects. Overview opens from the project's name.
- **Row 2 holds each section's own controls**, moved down from the middle of row 1:
  - Brainstorm: Sessions · Promoted · History
  - References: Characters · Props · Locations, and + New on the right
  - Script: the draft switcher, Home · Write · Board · Shots, and the Bible and History room buttons
  - Production: Frames · Video · Sound · Cut (the last three dimmed until they exist)
- **The pie gets four wedges**, one per tab.
- **On a phone** the tabs show icons only, except the current one, and row 2 scrolls sideways.
- **Code:** `SECTIONS` and `topBar()` in `public/app.js`. A section's `chrome()` now fills row 2 instead of the middle of row 1. `STAGES` and `Project.progress()` get the two new stages. Brainstorm and Script keep everything else.

## 2. References: what's on screen

Each kind is a gallery of cards. A card opens into its own room, Generate opens a panel only when you ask, and Versions is a separate room. The calm rules hold: ⋯ appears on hover, one quiet line says what's waiting for you, and nothing explains itself on screen.

- **Character:** Look (front, side, back, and the description), Expressions (the 6 defaults, and anyone can add more), Outfits, Motion and Voice. A **variant pill** next to the name switches between lasting changes. Under it, an owner chip and a *Used in* line listing shots.
  - **Motion:** a short clip that loops like a GIF (pause on hover), beside the text it was made from. Editing the text marks the clip as made from an older text, with *Redo the clip*.
  - **Voice:** the description, plus a **playable sample** of the sample line. *Open in Sound* goes to Production → Sound. Editing the description marks the sample as made from an older description.
- **Voice-only character** (not in the spec): a name the script only hears as V.O. or O.S., like Dispatch on the radio. Its Look tab says "Heard, never seen" with a *Give them a face* button. Voice is the tab that matters.
- **Prop:** Object sheet (front, side, back, top), Scale (next to a person) and States.
- **Location:** four tabs, and everything in them is made from the layout view:
  - **Layout:** the wide view; under it the areas where scenes happen (Kitchen, Ledge…), each with its own image; the description, the script heading it came from, and the regulars.
  - **Elements:** the fixed things in the place that must stay put: the water tanks, the window on the left, the door.
  - **Texture:** its surfaces as swatches: roof concrete with tar patches, galvanised steel, the peeling door.
  - **Light:** the place's own sources (a bare bulb, the window spill, sodium lamps), each with its colour and quality, shown together on a light plan of the layout. Time of day and weather still come from the script and sit on top of it.

## 3. Where the cards come from

- **From the script, with no AI.** Every save in Main runs a scan:
  - Dialogue names become characters. `MAYA (V.O.)` and `MAYA (CONT'D)` both count as MAYA.
  - Headings become places and areas: `INT. MAYA'S FLAT – KITCHEN – NIGHT` → *Maya's flat* → *Kitchen*. The last part is skipped when it's a time word (DAY, NIGHT, DAWN, LATER, CONTINUOUS…), because time comes from the script.
  - A new name becomes a Draft card. A card whose scenes are all gone gets *Not used*.
  - Only Main is scanned, so experiments in other drafts don't fill the gallery with junk.
  - If the script renames someone, a second card appears. ⋯ → *Same as…* merges the two.
- **From Brainstorm:** sending a promoted Character card now lands it as a Character reference (Draft, with look, personality and voice filled in), not as a row in the Bible. The Bible's Characters tab shows the same list.
- **By hand:** + New in each kind. Props are always added by hand.
- **AI-suggested:** blank description fields send one job to the bot queue we already have (section `references`). The bot fills them, and they're tagged *AI-suggested* until a person edits them.

## 4. Generate (OpenAI)

- **`lib/images.mjs`** with one call, `generate({ prompt, from, n })`, and two providers:
  - `openai`: the spec's choice for v1; the model is a setting.
  - `mock`: code-drawn placeholders like the demo's, so the app works without a key.
  - The key lives in `.env` (`OPENAI_API_KEY`), never in the project file.
- **The front comes first:** 4 options, and you pick one. Side, back, expressions and outfits are then made from that image (for a prop: its angles and scale; for a location: its areas, elements, textures and light), one each. Redo makes 4 new ones.
- **Clips and samples:** the Motion clip comes from a video model (from the front and the motion text) and the voice sample from a voice model (from the Voice description). Each is a setting with a mock, like images.
- **Fix:** the current image plus the fix text → 4 new options.
- **Images are files in the project folder:** `data/projects/<id>/refs/<ref>/<variant>/v<n>/<slot>.png`. The database rows hold the paths. Export (JSON) stays light; a "with images" zip can come later.
- **This costs money per click:** OpenAI bills per image, and none of it runs on the Claude subscription. Every Generate is 4 images, so one finished character is roughly 15. A monthly cap goes in the setting.

## 5. Variants (lasting changes only)

- **Made automatically:** locking a scene already sends it to the Judge. The reply gets one more field, the lasting changes it saw (a scar, a haircut, the burned café). Each one becomes a variant marked *Awaiting generation* from that scene on.
- **Made by hand:** variant pill → *Add a lasting change*.
- **Which one a shot uses:** the latest variant that starts at or before the shot's scene, in Main's order. A shot can override that.
- **The start doesn't move when scenes move** (spec, decision 9). It's stored by scene id and shown as the scene's current number.
- **Episodes** (the spec adds them to Script) aren't in Script yet. For now a range is a scene; once episodes exist it becomes episode + scene, with nothing to migrate.

## 6. Approval, versions, Stale

- **The spec says:** one owner approves, and anyone can generate.
- **Hadi's rule is "no approvals during work",** so here is the proposal: keep the owner's Approve, but it never holds anyone up.
  - Shots can use a reference that's still in Review; the shot's chip says *not approved yet*.
  - Approve only locks the reference. After that, an edit makes a new version.
- **Editing an approved reference:** one quiet line, "Saving makes v3 and marks 8 shots Stale", with *Save as v3* / *Undo*. Old versions are kept in the Versions room.
- **Stale:** shots made with an old version get a line in Production with *Keep*, *Regenerate* or *Adjust*.

## 7. Links

- **Shots → references:** Script's shots already have `characters`, `location` and `refs` text fields that the breakdown fills. Those resolve to references: the characters in frame (with the right variant) and the area from the scene heading. Props are added to a shot by hand. They're stored as `shot_refs` rows.
- **Used in:** read from `shot_refs`.
- **The Judge checks text in v1.** On Approve and on each new version, it compares the description with the Bible's facts ("the Bible says blue eyes"). A mismatch is a note on the card and never blocks, the same as the vote rule.
- **The Bible:** approved references make up its *Visual Continuity* part.
- **Copy to another project:** ⋯ → *Copy to…* copies the rows and image files into the other project's folder. After that the two copies change separately.

## 8. Production (the fourth tab)

- **For now,** Frames lists the shots by scene with their reference chips and Stale lines. The frames themselves are Section 4 (Image generation), the next spec. Video, Sound and Cut stay dimmed.
- **The shot breakdown stays in Script** (Shots tab), where it's made from the locked lines. Production reads the same shots.
- **Sound** is live from the start: one row per character with its sample (play, *Remake*, and a link back to the description). A sample made from an older description says so. Lines per shot come later.

## 9. The data (schema v5, one file per project as now)

- **refs:** kind (character, prop or location), name, owner, source (script, brainstorm or hand, plus where), voice-only, the description, which fields are AI-suggested, and extras (motion, voice, regulars)
- **ref_parts:** the named things inside a reference: expressions, outfits, states, and a location's areas, elements, textures and lights (a light keeps its colour, quality and where it sits)
- **ref_variants:** reference, name, the scene it starts at (none = Default), what changes, status, where it came from (a scene lock or a person)
- **ref_versions:** variant, number, the description as it was, approved by, when
- **ref_images:** variant, version, slot (front, side, back, top, scale, layout, or a part), file, prompt, picked or not
- **ref_media:** a character's voice sample and motion clip, as files beside the images, with the version of the description each was made from (that's how "made from an older description" is known)
- **shot_refs:** draft, scene, shot, reference, variant (none = by range), the version used, added automatically or by hand
- **jobs:** section `references` for AI-suggested descriptions. Image calls run in the server, not through the bot, because they go straight to OpenAI.
- **The Bible's `characters` table** moves into refs as characters. Role, look, personality, arc and voice notes are kept.

## 10. Build, in order (each step leaves the app working)

7. **The four tabs:** two-row header, a four-wedge pie, and Production as a quiet room. No data changes.
8. **References store:** gallery, card rooms (descriptions, parts, owner, hand-made cards) and mock images. The Bible's characters move in, and Brainstorm's Character Send lands here.
9. **The script scan:** characters, places, areas, voice-only, Not used, plus AI-suggested descriptions on the bot queue.
10. **Generate:** the images module (mock + OpenAI), front first, Fix, Redo, files in the project folder.
11. **Variants:** from the lock's Judge reply and by hand, plus versions, Approve and Stale.
12. **Shots ↔ references:** auto-filled from the breakdown, Used in, Production → Frames with the Stale actions, Copy to another project, and the Judge's text checks.

## 11. To decide

1. **Owner's Approve:** keep it as in §6, never blocking (recommended), or drop it under the no-approvals rule.
2. **Models and money:** OpenAI for images, plus a voice model and a video model. Whose accounts, and what monthly cap for each.
3. **Episodes:** later (recommended) or now.
4. **Shot breakdown:** stays in Script (recommended) or moves to Production.
5. **To clear with Abdallah:** his spec has Image, Video, Audio and Assembly as separate sections, while here they're one Production tab. Also the voice-only characters and the non-blocking Approve.
