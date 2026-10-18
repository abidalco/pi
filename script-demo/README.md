# π production system · Script demo

A testable build of **Section 2 (Script)** of Abdallah's production-system spec (`production-system/02-script.md`): the source of truth for the story. Zero dependencies, one JSON file, local only. Sits next to the brainstorm demo (`../brainstorm-demo` in the repo, `../pi-brainstorm` locally; :3142) and talks to it.

The AI has no API key: a **second Claude Code terminal** plays it (Generator, Pacing, Breakdown, Continuity Judge, placement, skeleton).

## Run

Terminal 1, the app:

```bash
npm start
```

→ http://localhost:3143 . Two people: two browser windows with two names, or one browser with a second tab at `http://localhost:3143/?as=Abdallah`.

Terminal 2, the AI:

```bash
npm run bot
```

That opens Claude Code in this folder with `BOT.md` as its playbook; it loops `node bot/wait.mjs` → think → `node bot/done.mjs`. If it ever stops, type `continue`. Without the bot everything still works; AI requests queue up, and the Judge has a "skip judge (demo only)" button so you can test locking.

Optional, for Brainstorm ↔ Script: run the brainstorm demo too (`npm start` in `../brainstorm-demo`). Promoted cards are read live from it (or from its `data/state.json` when it's off); "Send to Brainstorm" needs it running.

Reset: `npm run reset`, or the button at the bottom of Drafts.

## Layout and UI rules

One room for writing, two rooms you visit:

- **Script** (home): **Write · Board · Shots**, three views of the same script, switched in the middle of the top bar.
- **📖 Bible**: Facts · Characters · From Brainstorm · Notes.
- **🕘 History**: Seshes · Drafts · Compare.

Rules applied everywhere:

1. The script reads like a page. Controls appear on hover; secondary actions live behind ⋯ (scene, card, draft, top bar).
2. Anything that needs attention is one quiet line (Judge notes, changed since locking, out-of-date assets or facts) that opens on click.
3. AI shows up when asked: pick lines (⋮⋮) → a small bar offers ✨ Try options; the options panel is closed otherwise.
4. Nothing asks for approval. The sesh (red dot, top right) collects the work; save it as a version from there.
5. No instructions on screen. Keys and the demo's guide are in ⋯ → Guide & keys.

## What's built (spec → demo, with Hadi's notes applied)

**No approvals during work.** The spec's majority votes (scene order, moves, placement, locks, choosing Main) are gone. Everything applies at once and is logged in a **sesh**:

- The first change to a draft opens a sesh; everyone working on that draft is in it. The top bar shows it: name it any time.
- **⏹ End & save** (or 45 quiet minutes) turns the sesh into a version named after it.
- **Seshes** tab: every saved sesh with its log and a before/after of the script. Afterwards it's **✓ approved**, or **🏷 tagged** with what needs work and **✎ picked up again** in a follow-up sesh. **↩ Undo** puts the draft back to before it.

| Spec | In the demo |
|---|---|
| Entry points | Start from the mid-production demo, the spec's wireframe, a promoted 💡 Idea (bot builds the skeleton), or blank. 📖 Bible lists promoted cards: 🎬 Scene → floating tray (the Judge suggests a spot), 💬 Dialogue → lines into a scene, 🧑 Character → character list |
| Scene Board | Number + title cards, drag to reorder (numbers update live), floating tray. Moves are logged in the sesh |
| Script Doc | Outline left, block doc centre, Generator right. Live co-editing at block level with presence (✎ who's in which block). Blocks: Heading / Action / Dialogue (+ parenthetical) / Transition / Note; **Enter = done** with the line, **Shift+Enter = line break**, ⌘/Ctrl+Enter = new line below (a dialogue gets the other speaker), drag ⋮⋮ to move a line (inside its scene or into another), "+" between lines, "/" in an empty line changes its type |
| Generator | Pick lines (⋮⋮, shift = range), drag to the panel, personality + twist + optional ask → options. **Click an option and it swaps into the script; click another to swap again, or back to the original; ✓ Done keeps it.** Also: keep one as an alternate, ↺ refine. Helpers: 🩺 Pacing, 💡/💬 Send to Brainstorm, 🎬 Breakdown |
| Lock | 🔒 → the Continuity Judge checks → ✅ or ⚠️ locks it at once (notes stay, dismissable), ❌ doesn't. 🔓 unlock any time |
| Shots | Locked scenes only (Main): the breakdown and nothing else. Bot proposes, you edit and mark shots final. Global numbers (4.2) that renumber when scenes move |
| Drafts & versions | Per-member drafts forked from any version of any draft, owner-only edits, every sesh a version, open any version read-only, restore (in a new sesh, nothing overwritten), side-by-side compare, pull a single scene, ⭐ make a draft Main (shows what changes first) |
| Downstream protection | Images, video and sound are made in their own sections, so the Script shows none of them. A locked scene that changes says so (one quiet line), and its Shots say they may need a look, with ✨ Propose again. The server still tracks what each downstream file was made from (keep / regenerate / adjust), ready for the Image section |
| Continuity Judge | Before every lock, re-check a few seconds after a locked scene is edited, placement suggestions. It adds facts to the ledger and retires its own facts that stop being true |
| Facts Ledger (📖 Bible) | Facts filed under their scene (live scene number, never written into the text). **Edit in place (Enter = done), add, remove, move to another scene.** A fact whose scene changed since it was written is flagged: still true / remove / edit. The Judge never removes a fact a person wrote or edited; it only flags it. Every change is logged in the sesh |
| Export | PDF (print-ready screenplay page) and Fountain. Notes and alternates never exported |

The demo's "? Guide" (top bar) lists things to try; it stays closed until you open it.

Not built: real CRDT co-editing (last write wins per block), Episodes, Section 3+ (references are a text field).

## Files

```
server.mjs        API + SSE + bot inbox, all state in data/state.json
lib/data.mjs      personalities, twists, block types, framings, the sample script
public/           index.html, app.js (vanilla, keyed DOM morph), style.css
bot/wait.mjs      long-poll: next job + its context as JSON
bot/done.mjs      answer a job (JSON via heredoc)
bot/run.sh        launches the Claude Code AI terminal
BOT.md            the AI's playbook (shareable spec part + demo wiring)
```
