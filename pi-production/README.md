# π production system — the app

Abdallah's production system as one app: the **home page is the projects**; inside a project, four sections as tabs: **Brainstorm · References · Script · Production**. Zero dependencies: one Node 22 server, SQLite built in, plain JS in the browser. Separate from the π vault.

## Run

```bash
npm start
```

→ http://localhost:3144 . Give your name once; open the same address with `?as=Name` in a second window to be two people.

`--port=…` and `--projects=<dir>` (or `PORT`, `PI_PROJECTS_DIR`) if the defaults don't suit.

References makes images, voices and clips through providers (`lib/media.mjs`):

| | default | to change it |
|---|---|---|
| images | placeholder sketches drawn in code (free) | `PI_IMAGES=openai` + `OPENAI_API_KEY` (model `PI_IMAGE_MODEL`, default gpt-image-1). Billed per image by OpenAI; `PI_IMAGE_CAP` caps a project's images a month (default 200). |
| voice samples | this Mac's own voices (`say` + ffmpeg, free) | none needed; anyone can also upload a sample |
| motion clips | none yet | upload a clip (mp4, webm, gif) |

## What's in it so far

- **Projects** (home): name a project and it opens; each row shows what's live in it, who's in it, the last thing that happened. Opening a project puts you in it.
- **Brainstorm** (a section inside the project, `#p/<id>/brainstorm`): the whole Section 1 game on the project file. Sessions · History in the centre of the top bar; a session is a room that fits the window: the cards in their own column on the left (titles only, click one to open it), the chat on the right, each scrolling on its own with the message box always at the bottom; the stages are the control in the top bar, the bot's voice is a pill. Rounds (blind in first stages), card-level mini-rounds; the vote is one gesture: ☆ nominates a card and the Judge reads it in the background and leaves a note (✓ / ? / ✗, advice only), 👍 is vote and approval in one, and a majority of 👍 lights up Promote at once: a count the app applies, never an AI call (everyone in and no majority → the bot asks one tiebreak question). A **Board** room per session shows the cards big with the Judge's marks and the votes; wrap → recap. Promoted cards land in the project's Promoted list; the Judge reads the project's Bible.
- **Script** (a section inside the project, `#p/<id>/script`): the whole Section 2 demo on the project file. **Home** first (`#p/<id>/script`): the drafts (Main first; open one, rename, copy, compare, make it Main) and **New draft** (from Main as it is now, a fresh AI skeleton from a promoted Idea, or an empty page; Main doesn't change), plus what was promoted, by kind. Then three views of one script in the centre of the top bar (**Write · Board · Shots**), the draft you're in on the left (switch or start a new one from there), and three rooms on the right (**Promoted**: every promoted card split into Ideas · Arcs · Characters · Scenes · Dialogue, read it, send it on, start a draft from an Idea; **Bible**; **History**). Write = the outline beside the page; lines edited at the same time by everyone (Enter ends a line, ⌘↵ adds the next speaker, `/` changes a line's type, ⋮⋮ drags or picks lines). Picked lines → **Try options**: the AI's options swap into the script in place, Done keeps one. Every change lands in an open **sesh** (top right); saving it makes a version; History reviews seshes (approve, tag, pick up again, undo), drafts and versions, and compares any two. Locking goes through the Judge (ok or a question locks, a contradiction doesn't); a locked scene that changes says so and is re-checked; Shots break locked scenes down. The Bible holds the facts the Judge writes and anyone edits, the characters, and the logline. A scene's ⋯ → “Brainstorm this scene” (or its dialogue) opens a session in the same project, seeded with it; the session shows where it came from and links back. A project with no script starts from its promoted Idea (the AI builds the skeleton), empty, or on a sample. Export: PDF (print) and Fountain from ⋯.
- **The header**: row 1 is the project (its pill opens the Overview and the other projects) and the four sections as tabs; row 2 is the section's own controls (Brainstorm: Sessions · Promoted · History; Script: the draft, Home · Write · Board · Shots, its rooms; References: Characters · Props · Locations; Production: Frames · Video · Sound · Cut).
- **References** (`#p/<id>/references`, spec: `specs/03-references.md`, plan: `REFERENCES-PLAN.md`): characters and locations come in from Main on their own (speakers, scene headings and their areas; a name only heard as V.O. is a voice-only card; one no placed scene uses any more says Not used), props are added by hand, a promoted Character card lands here, blanks are filled by the AI (marked AI-suggested until someone types over them). A card's room: a character has Look (front, side, back + description) · Expressions · Outfits · Motion (a looping clip beside the text) · Voice (the description and a playable sample, with a way to Sound); a prop has Object sheet · Scale · States; a location has Layout (the wide view and its areas) · Elements · Texture · Light (its own sources on a light plan). **Generate** opens a panel: 4 options, pick one, the rest are made from it; Fix by prompt, Redo, or upload your own on any slot. **Lasting changes** are variants (the Judge reports them when a scene is locked; or by hand), each from a scene on. The owner's **Approve** locks a version but holds nobody up; an edit after it says so in one line (Save as the next version / Undo), and the shots made with the old one get a Stale line. ⋯: versions, ask the Judge, copy to another project, the same as… (merge), delete.
- **Production** (`#p/<id>/production`): **Frames** lists Main's shots with the references each one uses, filled in on their own (who's in frame, with the variant for that scene; the place and area from the heading), props added by hand, a variant picked by hand, and Stale lines (keep the old version, or use the new one); the frames themselves are the Image step. **Sound** has one voice sample per character (make, remake, upload). Video and Cut come later.
- **Promoted** (Brainstorm's middle tab): every promoted card from every session, filtered by type, “to send” above “sent”. Open one to clean its title, note and fields; **Send** puts it where it belongs.
- **The join**: a sent card lands where it belongs and waits for a person; it never rewrites a scene by itself. Idea → the logline and notes in the Bible (the script can start from it). Arc → facts in the Bible, grouped as canon and read by the Judge. Character → a card in References → Characters (and its name in the Bible's list). Scene → the script's “Not placed”, or, when the session was sent from a scene, straight back into that scene as an alternate (Use it / Set it aside). Dialogue → alternate lines next to the lines it was sent with (with no scene, it waits in the Bible's Brainstorm tab for someone to pick one). The session, the card, the Overview's Promoted list and the Bible's Brainstorm tab all say where it went and link there; a scene says when a version from Brainstorm is waiting and which sessions came from it.
- **The bot** is a second terminal: `npm run bot` (a Claude Code session reads `BOT.md` and `BOT-SCRIPT.md` and loops `bot/wait.mjs` → `bot/say.mjs` for Brainstorm or `bot/done.mjs` for Script) or `npm run auto` (headless, on your Claude login; it picks the right playbook per delivery). One queue serves every project and both sections, oldest first; each delivery says which project and section it is for. `PI_URL` points the scripts at another address.
- **A project's page** (`#p/<id>`, the Overview): the project's pill opens it, and lists the other projects (each opens in the section you're in); the people, ⋯ for export and delete. The Overview reads the project file live: brainstorm sessions, the script's scenes, promoted cards, the Bible, the last events.
- **Deleting a project** (⋯ → Delete, type its name) moves its folder to `data/trash/`; nothing is lost for good until you empty that folder. `./bin/project.mjs delete <id> --yes` removes one for good.
- Each project has a **mark**: a flat pie with one wedge per section (Brainstorm, References, Script, Production), each filled as far as it has come, in the project's colour. Brainstorm counts sessions, cards and a promotion; References counts approved cards; Script counts scenes in Main and how many are locked; Production counts voice samples for now.
- **Edit name & colour** (⋯ on a card or on the project page): name, logline and one of eight dark colours. The colour tints that project's page.
- The project page is a page: a hero with the pie, the people and the dates, then one quiet row per part (Live now · Script · Promoted · References · The Bible · Lately), each with a one-line summary; a row opens on click, and which ones are open is remembered per project. Icons are inline SVG.

The plan, decisions and what comes next: [PLAN.md](PLAN.md). The bot's playbooks: [BOT.md](BOT.md) (Brainstorm) and [BOT-SCRIPT.md](BOT-SCRIPT.md) (Script and References).

## The database

A **project is a folder** under `data/projects/`. Inside it, one file, `pi.db`, holds everything the sections share. It is a SQLite database: one spreadsheet file with one tab per table. Node 22 has SQLite built in, so there is nothing to install or run.

```
data/projects/al-mousalsal/
  pi.db        the database
  files/       what isn't a row: refs/<card>/ holds its images, voice samples and clips
```

| Group | Tables | What's in them |
|---|---|---|
| the project | `project`, `people` | name, logline, notes; who's in it |
| brainstorm | `sessions`, `messages`, `cards`, `promotions` | the rooms, what was said, every card with its credit, what got promoted and where it landed |
| script | `drafts`, `scenes`, `blocks`, `shots`, `versions`, `snaps`, `seshes` | the script as lines, its shots, every saved version, the work sessions |
| the Bible | `facts`, `characters`, `exceptions` | what's true in the story, who's in it, the Judge notes the team marked as intended |
| references | `refs`, `ref_parts`, `ref_variants`, `ref_versions`, `ref_images`, `ref_media`, `shot_refs` | the cards, their expressions / outfits / states / areas / elements / textures / lights, lasting changes, versions, every image made (picked or not), voice samples and clips, and each shot's links (props by hand, a variant by hand, the version it was made with) |
| shared | `jobs`, `events`, `kv` | the bot's queue, the history, and odds and ends that don't have a table yet |

Look inside from the terminal:

```bash
./bin/project.mjs list                      # every project, with what's live in it
./bin/project.mjs show al-mousalsal         # rows per table, people, last events
./bin/project.mjs peek al-mousalsal cards   # the first rows of a table
./bin/project.mjs sql al-mousalsal "select title, status from cards where status='promoted'"
./bin/project.mjs export al-mousalsal out.json
./bin/project.mjs create "Name" --by Hadi
./bin/project.mjs import-demos              # the two old demos' JSON (../pi-brainstorm, ../pi-script) → one project
```

Backing a project up is copying its folder. Nothing crosses between projects. Online, the same folders live on the server's disk.

## Files

```
server.mjs            the app: projects API, brainstorm and script routes, the bot queue, one live stream, static files
lib/projects.mjs      the store: schema, open/create/list, overview, progress, export
lib/brainstorm.mjs    Section 1 on the project file: sessions, rounds, cards, the promotion flow, the bot's context
lib/script.mjs        Section 2 on the project file: drafts, lines, seshes, versions, the Judge, shots, facts, the bot's jobs
lib/references.mjs    References: the script scan, cards, parts, variants, versions, images (4 options → pick → the rest), shots' links, copies, the bot's jobs
lib/refart.mjs        the placeholder sketches (when no image model is connected)
lib/media.mjs         the providers: OpenAI images, this Mac's voices, waveforms
lib/script-data.mjs   the Generator's voices and twists, line types, framings, the sample script
lib/templates.mjs     the five session types, the voices, the mini-rounds
bot/                  wait.mjs · say.mjs (Brainstorm) · done.mjs (Script) · auto.mjs · run.sh — the bot side
lib/import-demos.mjs  the two old demos' JSON → one project
bin/project.mjs       the terminal tool
public/               index.html · app.js (the shell) · brainstorm.js · references.js · script.js · production.js (the sections) · style.css
mockups/              the References demo shown to Abdallah (references-demo.html, its media and their sources)
data/projects/        the project folders (not in git)
```
