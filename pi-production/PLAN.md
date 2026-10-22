# π production system — plan

*Brainstorm notes, 18 Oct 2026, revised the same evening: the production system is **its own app** (`moodboard/pi-production/`), not part of the π vault. Decisions taken are marked ✔; things still to settle are marked ?.*

## 1. The shape

✔ **One app, separate from the vault.** The vault stays what it is (two people, ideas, no bots). The production system is this app: `pi-production/`. Its **home page is the projects**; Brainstorm and Script stop being two demos and become two **sections inside a project**. Later sections of Abdallah's spec (references, images, video, sound) are more sections in the same place.

✔ **A project is a folder.** Inside it: one database file (SQLite, built into Node 22, no server to run) and, later, the files that don't belong in a database (reference images, renders). Copy the folder and you have shared the film; delete it and it is gone.

✔ **Nothing crosses between projects.** Both sections read and write the same file, so a promotion in Brainstorm is a row written into Script's tables, in the same process, with its origin attached. No fetching, no second server, no mismatch.

✔ **The project owns what the two tools faked separately:** people, the Bible (facts, characters, exceptions, promoted cards), History, the bot's job queue. The Judge reads the whole project.

✔ **Trade-off accepted:** a view across all projects ("what did we do this week") has to open each project's file. For two people and a handful of films that costs nothing.

## 2. Front door and moving around

✔ **The home page is the projects.** One line to name a new one, then one row per project with its pulse: what is live (a brainstorm round waiting for you, a sesh open in Script, the bot thinking), who's in it, the last thing that happened.

✔ **Inside a project you switch sections without leaving the room:** a small pill next to the project name ("Al Mousalsal · Script ▾") opens the list of sections. Calm with two; if it gets awkward at six, it becomes a rail then, not now. The top bars Brainstorm and Script have today stay as they are.

✔ **Anyone creates a project.** Opening a project puts you in it. Deleting one (⋯ → Delete, type its name) moves its folder to `data/trash/`.

✔ **The mark is the pie:** one wedge per stage of the pipeline, filled with that stage's progress, in the project's own colour (eight dark ones to choose from; name, logline and colour are editable from ⋯). A project's page is a page: hero, stats, a sticky nav through its parts.

✔ **Look:** Nordic/Apple restraint. White surfaces, hairlines, system type, generous space; one deep cobalt tint (`#1b36a8`) on small things only (a live dot, a section icon, a project's mark); inline SVG icons, no emoji in the UI. The home is a gallery of cards, each with its own mark.

## 3. Who you are

For now, a name, as in the demos (`?as=Name` to be two people in one browser). Sign-in comes with going online and belongs to this app, not the vault: ? Google with a short list of allowed emails, or a team link, to decide then.

## 4. The data (one file per project)

Tables, in plain words; the exact columns come with the build.

- **project**: name, created, the idea it came from (if any)
- **people**: seat, name, light, when they joined the project
- **sessions** (Brainstorm): type, topic, seed, stage, phase, voice, participants, **origin** (the Script scene it was sent from, if any)
- **messages**: session, author, kind, text, picks, round, hidden
- **cards**: session, parent, title, note, fields, author, credit, status, reactions
- **promotions**: card → destination (which section, which table, which row it became), approved by whom, when
- **drafts, scenes, blocks, locks, shots** (Script): as today, plus **from** (the card a scene or line came from)
- **facts, characters, exceptions** (the Bible): each with its source (a scene, a card, a person)
- **jobs**: the bot queue for both sections: section, kind, payload, status, delivered, answered
- **events**: who did what, when, which section: what History reads

## 5. The join, per category

Promotion pushes. The card lands where it belongs and waits for a person to place it; it never edits the script by itself.

✔ *Changed Oct 18 (Hadi): promotion holds first.* A promoted card waits in **Brainstorm → Promoted**, where anyone edits its title, note and fields (“clean them before they go to script”); **Send** lands it as below. Editing after sending doesn't touch what was sent; it can be sent again (a Scene or Dialogue lands again as a new alternate).

| Promoted in Brainstorm | Lands in Script as |
|---|---|
| Idea | logline + notes in the Bible; "start the skeleton from it" if the script is empty |
| Arc | Bible facts (spine, rules, never list), each marked *from Brainstorm*; the Judge reads them |
| Character | the character list + a Bible character card (look, voice notes); later the References section |
| Scene | the "Not placed" tray, or **straight back into its origin scene as an alternate** when the session was sent from that scene |
| Dialogue | alternate lines inside the origin scene (Use it / Remove, as alternates work today) |

The other direction exists and stays: a scene's ⋯ → "Brainstorm this scene / its dialogue" opens a session with a seed. New: the session remembers the scene, so the way back is exact.

✔ Built as above (step 5). Choices made where the table was open: a Scene card from a scene stands in for the whole scene (or for the lines it was sent with); its beats become action lines and who/purpose/ending hook a note. An Idea replaces the logline and notes (the old logline stays in History). A Dialogue card with no scene waits in the Bible's Brainstorm tab. Cards promoted before the script existed come in when it starts.

## 6. The Board and a simpler vote

✔ **Chat side panel = titles only.** One line per card: title, ☆ if nominated, a thumbs count. Click to read inline. *(Built Oct 18: the cards are a column on the left of the room, each a title with its star and reaction counts; click opens it in place; “open all / fold all”.)*

✔ **A Board room per session:** the cards only, big, children under parents, the Judge's marks on them. Where you tidy, compare and vote, live or later.

✔ **One-gesture voting** (a change to the spec's judge → vote → tie → approval). *Built Oct 19 at Hadi's go-ahead; Abdallah hasn't seen it yet — show him before it reaches his repo.*

1. ☆ nominates a card. The Judge checks it on nomination, so its mark is already on the card when people look.
2. 👍 on the Board is vote and approval in one. Names show under the thumbs.
3. A majority of 👍 lights up **Promote** at once; anyone taps it. *(Oct 19, Hadi: the AI never decides access to Promote. The count is a rule the app applies instantly; the Judge's ✓ / ? / ✗ is a note on the card that never holds the button. Promoting over an open ? or ✗ is logged as intentional; a note that lands after the promotion is logged with the card.)*
4. If nothing reaches a majority, the bot asks its one tiebreak question in the chat. That stays the only moment it steps in.

Same guarantees (Judge, majority, tie Q&A), two fewer strips, and it works when the other person votes tomorrow.

## 7. The bot

✔ One runner serves every project (`npm run bot` in a terminal, or headless `npm run auto`); jobs carry their project and section, the oldest goes first. Brainstorm's BOT.md and Script's BOT-SCRIPT.md stay separate prompts chosen per delivery (`say.mjs` answers a brainstorm batch, `done.mjs` a script job). Online, the runner keeps living on a Mac on the subscription login, as now.

## 8. Where it lives, and how you work together

**Today:** nothing is online. The app runs on Hadi's Mac (`npm start` → :3144); the two old demos run on the same Mac with one JSON file each. Abdallah can only work when he is on that wifi or when Hadi tunnels a port.

**With projects:** the app runs in one place and both of you open it in a browser.
- **Locally** (same wifi): `data/projects/<project>/pi.db` on the Mac that runs it; seat links as now.
- **Online** (anywhere): one small machine on Fly (about 3 dollars a month, no free tier), a volume at `/data`, projects under `/data/projects/<project>/`. Sign-in as decided in §3; nobody else gets in. Both of you edit live: the server pushes every change to every open tab, rounds, votes and script edits included.
- **The bot** keeps running on Hadi's Mac on the Claude subscription (`npm run auto`), asking the online server for work. When the Mac sleeps, jobs wait and the app says the bot is off. If that becomes a problem, the runner moves to the server with an API key, at a cost per call.
- **Backups:** a project is a folder; copying `/data/projects` off the volume is the backup. A "keep a copy on my Mac" story can come later.

## 9. Migration, and the repos

- ✔ The two demo JSON files are imported into one project, **Al Mousalsal**: its brainstorm sessions and cards, its drafts, versions, seshes, facts. Nothing tested so far is lost.
- ✔ Steps 3 and 4 are done, so the demos can retire (stop their servers; their folders stay as the record until the repo swap). Abdallah's repo keeps `production-system/` (the spec) and gets this app folder in place of `brainstorm-demo/` and `script-demo/`.
- The vault is untouched and stays separate.

## 10. First build, in order

1. ✔ The project store: folder, SQLite file, schema, open/create, the importer for the two JSONs. *(`lib/projects.mjs`, `lib/import-demos.mjs`, `bin/project.mjs`; the two demos imported as project `al-mousalsal`)*
2. ✔ The app's home page: the projects, with pulse, create, open (opening = joining). A project's page at `#p/<id>` with the section pill, people, ⋯, and a live Overview from the project file. *(`server.mjs`, `public/`)*
3. ✔ Brainstorm moved in: same screens, reading and writing the project file; one bot queue across projects; the bot scripts and BOT.md live here now. *(`lib/brainstorm.mjs`, `public/brainstorm.js`, `bot/`)*
4. ✔ Script moved in: same screens (Write · Board · Shots, the Bible and History rooms), reading and writing the project file; its AI jobs on the same queue as Brainstorm; the Bible is the project's (facts, characters, exceptions, the cards promoted in its Brainstorm); “Brainstorm this scene” opens a session in the same project and remembers the scene. *(`lib/script.mjs`, `lib/script-data.mjs`, `public/script.js`, `BOT-SCRIPT.md`, `bot/done.mjs`)*
5. ✔ The join: promotion pushes by category (Idea → logline and notes; Arc → canon facts; Character → a character card; Scene → “Not placed” or an alternate in its origin scene; Dialogue → alternate lines in its origin scene, or waits for a scene); sessions keep their origin and show it; links both ways (session ↔ scene, card → where it landed). *(`land()` and friends in `lib/script.mjs`, `onPromote` in `lib/brainstorm.mjs`; schema v4: `facts.from_card`)*
6. ✔ The Board room per session (`#…/s/<sid>/board`), the titles-only side panel, one-gesture voting (☆ nominates and the Judge checks at once; 👍 = vote + approval; majority → Promote at once, the Judge only advises; everyone in and no majority → one bot tiebreak question, its pick lights Promote). The old Call the vote → Judge → Vote → Approve strips are gone; old sessions' votes read as thumbs. *(`lib/brainstorm.mjs` readiness/checkTie/promote; `public/brainstorm.js` boardView/tile/cardActs)*

7. ✔ **The four tabs** (Brainstorm · References · Script · Production), each section's own controls in a second row, the pie with four wedges; the pill is the project (Overview, other projects).
8. ✔ **References** (Abdallah's Section 3; plan and choices in `REFERENCES-PLAN.md`): cards from the script on their own, by hand, and from Brainstorm's Character cards; rooms per kind; images 4 options → pick → the rest made from it (placeholder sketches until an image model is set; OpenAI behind `PI_IMAGES=openai`); uploads on every slot; lasting changes as variants (the Judge reports them on a lock); versions, a non-blocking Approve, Stale; copy to another project; merge; the AI fills blanks (`ref_describe`) and the Judge checks text (`ref_check`) on the same queue.
9. ✔ **Production**: Frames (every shot with its references, props by hand, a variant by hand, Stale: keep or move on) and Sound (a voice sample per character, made with this Mac's voices or uploaded).

Each step leaves the app working.

## 11. Still to settle

- One-gesture voting: keep the spec's ceremony or collapse it (§6).
- Sign-in for the online version (§3).
- Does a project ever have more than two people? If yes, majority rules already cover it; if no, several things get simpler.
- Name of the thing people open: "project", or Abdallah's word for it in the spec.
