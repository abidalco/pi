# Section 1: Brainstorming

**Status:** Locked at concept level (design only, nothing built yet)

## System overview

A team tool for AI film/video production, built from scratch. Sections:

| Section | Purpose |
|---|---|
| **Brainstorming** | Live, gamified team sessions that turn messy ideas into promoted cards |
| **Script** | Source of truth for the story; breaks scenes into shots |
| **References** | Characters, locations, props, styles, voices kept consistent |
| **Image generation** | A keyframe/storyboard per shot |
| **Video generation** | Approved keyframes animated into clips |
| **Audio generation** | Voice/VO, music, SFX |
| *Likely later* | Assembly/Timeline, Review & Approval, Jobs/Queue, Cost/Usage, Export |

**Data spine:** Project → Scene → Shot. Every asset links to its shot and to the references it used. Assets are versioned (never overwritten), with status `draft → generating → review → approved / rejected` and provenance (prompt, model, references, script version).

```
                      📖 STORY BIBLE (Canon + Continuity Judge)
                 ┌──────────┬──────────┬──────────┬──────────┐
                 ▼          ▼          ▼          ▼          ▼
Brainstorm ──► Script ──► Image ──► Video ──► Audio ──► Assembly
                 ▲          ▲          ▲          ▲
                 └──────── References ─┴──────────┘
```

**Approach:** sketch every section at concept level first, then go deep. Recommended v1 scope: Script → References → Image, end to end.

---

## One-line definition

A **per-project, team-shared chatbot** run as **live focus sessions**. It guides the team from keywords or messy ideas through short, game-like rounds until a result is ready to **promote** to another section.

## Core principles

| Principle | In practice |
|---|---|
| Very simple | One chat window, no forms, the bot asks one thing at a time |
| Gamified, not childish | Visible progress, quick choices, small wins. No leaderboards or points |
| Team-shared | Everyone sees the same chat and can jump in |
| Messy input welcome | "cat, heist, rain, sad??" is a valid start |
| Nothing is lost | Every idea is captured as a card, even unpicked ones |

---

## Brainstorm types (templates)

Each type is a template with 5 parts: **stages, bot questions, mini-rounds, output card, promotion target**. New types (World, Title, Plot twist…) are added as new templates.

| Type | Stages | Output card | Promotes to |
|---|---|---|---|
| 💡 **Idea** | Spark → Shape → Build → Pitch | Logline, synopsis, tone, themes | Script (new skeleton) |
| 🧭 **Arc** | Premise → Spine → Character arcs → Rules → Lock | Spine, character arcs, world rules, timeline, themes, "never" list | Story Canon |
| 🧑 **Character** | Sketch → Want/Fear → Voice → Profile | Name, role, look, personality, arc, voice notes | References + script character list |
| 🎬 **Scene** | Moment → Stakes → Beats → Scene card | Location, who's there, purpose, beats, ending hook | Script scene slot |
| 💬 **Dialogue** | Situation → Subtext → Lines → Polish | Exchange text, characters, intent per line | Script (inside a scene) |

- **Suggested order** (not enforced): Idea → Arc → Character → Scene → Dialogue
- **Context carries over:** later sessions pull in promoted cards (e.g. Dialogue already knows the characters and the scene)
- **Scene slots** can be created independently ("floating"); the judge suggests where they fit

---

## Focus sessions

```
START → LOBBY → PLAY → CANDIDATES → VOTE → WRAP
```

1. **Start:** anyone creates a session, picks type + topic
2. **Lobby:** team joins and picks the bot personality
3. **Play:** live chat, stages, mini-rounds, cards collected
4. **Candidates:** cards marked "ready to promote"
5. **Vote:** if 2+ candidates
6. **Wrap:** the bot posts a recap (decided, parked, contributors); the session becomes read-only, its cards stay usable

**Rules**
- The team is in the session at the same time (live)
- **Anyone** can advance a stage; **"⏪ back a stage"** is always available
- **Session timer is optional** (e.g. 20 / 45 / 60 min)
- **Text only**, multilingual-ready

### Bot personalities
Picked in the lobby, **switchable mid-session**.

| Personality | Vibe | Good for |
|---|---|---|
| 🎩 The Director | Decisive, pushes for clarity | Pitch and scene sessions |
| 🃏 The Trickster | Chaotic, throws wildcards | When the team is stuck |
| 🧠 The Script Doctor | Analytical, asks "why?" | Character and structure |
| 🎭 The Drama Coach | Emotional, character-focused | Character and dialogue |
| 🤝 The Cheerleader | Warm, yes-and energy | Early Spark stages |
| ✏️ Custom | Team describes it in a line | Anything |

### Game mechanics
- **Quick-pick cards** inline in the chat (typing always allowed)
- **Mini-rounds:** 🔄 Flip it · ➕ Yes, and… · 🎲 Wildcard · 💀 Worst idea
- **Reactions/votes** on cards: 👍 / 🔥 / ❌
- **Stage progress bar** plus a count of idea cards
- **Credit** shown on each card (who sparked it), no competition

---

## Promotion & voting

```
Candidate(s)
   │
   ▼
⚖️ Continuity Judge ── ❌ → resolve (fix / change other / amend canon)
   │ ✅ / ⚠️ acknowledged
   ▼
1 candidate?  ──► 👍 Majority approval ──► Promoted
2+ candidates? ─► 🗳️ Vote ──► Tie? ──► 🎲 Quick Q&A tiebreak ──► Result
                                                                 │
                                       👍 Majority approval ◄────┘
                                                │
                                                ▼
                                    Winner promoted (primary)
                                    Others → alternates / parked
```

- **Every promotion needs majority approval**, even with a single candidate
- **Ties:** the bot runs a quick, indirect Q&A (2–3 questions comparing the options) and gives a result; the team still approves it
- **Multiple winners are possible;** the team votes on the primary, the others become alternates
- **Idea Card status:** `active → candidate → promoted / parked / discarded` (discarded stays recoverable)

---

## 📖 Story Bible (Canon + Continuity Judge)

The locked Arc becomes the **Story Canon**: a **project-wide, browsable Story Bible** that also acts as the team's memory.

### Chapters

| Chapter | Contents | Fed by |
|---|---|---|
| Overview | Logline, synopsis, themes, tone | Idea |
| Story Spine | Beginning / turn / end, acts | Arc |
| Characters | Profiles, arcs, relationships, what each knows | Character |
| Timeline | Ordered events, elapsed time | Arc + Scene |
| World Rules | The story's internal logic | Arc |
| Facts Ledger | Who has / knows / lost what, and when | Auto-extracted from promoted items |
| "Never" List | Hard limits | Arc |
| Intentional Exceptions | Dismissed ⚠️ flags + reason | Judge |
| Visual Continuity *(later)* | Wardrobe, props, injuries, time of day | Image / Video |
| Amendment History | Every Canon change, who voted, why | Votes |

Every entry links back to its source (session, card, promotion).

### Judge roles
- **⚖️ Gatekeeper:** checks every promotion against the Canon and all promoted items
- **🧠 Memory:** speaks up during live sessions when something drifts

### Verdicts

| Verdict | Action |
|---|---|
| ✅ Consistent | Goes on to approval |
| ⚠️ Question | Answer it, or dismiss as **"We know, it's intentional"** (logged in Intentional Exceptions, never re-flagged) |
| ❌ Contradiction | Blocked until resolved: fix the card, change the conflicting item, or **amend the Canon** (majority vote, versioned) |

### What it checks
Facts, timeline, character behaviour (⚠️ only), world rules, tone drift (⚠️ only).

### Before and after the Arc
- **No Arc yet:** the judge checks only against already-promoted items
- **Arc locked:** a one-time retroactive scan lists any existing conflicts
- **Later:** extends to image and video visual continuity

---

## Screen layout (approved)

```
┌──────────────────────────────┬─────────────────┐
│  🌱──🌿──🌳──🎬  progress     │  IDEA CARDS     │
├──────────────────────────────┤  #1 Flood heist │
│                              │  #4 Grandma ⭐   │
│        shared chat           │  #6 Driver POV  │
│   (bot + team messages,      │  ...            │
│    quick-pick cards inline)  │                 │
│                              │  [Pitch board]  │
├──────────────────────────────┤                 │
│  type or drop keywords...    │                 │
└──────────────────────────────┴─────────────────┘
```

---

## Data model

| Object | Key fields |
|---|---|
| Project | name, members |
| Brainstorm Type *(template)* | stages, questions, mini-rounds, output fields, promotion target |
| Session | project, type, topic, personality, participants, timer, status (lobby / live / closed), recap |
| Message | session, author (user or bot), text, timestamp |
| Card | session, type, fields (per template), author(s), votes, status, parent card |
| Vote | card, user, value |
| Promotion | card → target section + target item, date |
| Canon / Story Bible | chapters above, versioned |

---

## Locked decisions ✅

| # | Decision |
|---|---|
| 1 | Per project; 5 brainstorm types, extensible via templates |
| 2 | Live focus sessions; optional timer; end-of-session recap |
| 3 | Anyone can advance stages, with "back a stage" |
| 4 | Personality picked in the lobby, switchable mid-session |
| 5 | Text only, multilingual-ready |
| 6 | Every promotion needs majority approval |
| 7 | 2+ candidates → vote; tie → quick Q&A tiebreak → majority approval |
| 8 | Multiple winners possible; the team votes the primary |
| 9 | Scene slots can be created independently; the judge suggests placement |
| 10 | Arc → Story Canon + Continuity Judge |
| 11 | ⚠️ flags can be dismissed as intentional, and are logged |
| 12 | Canon is a browsable Story Bible, project-wide, designed to later check image and video |

## Small open items

1. **"Majority" of whom?** Suggested: people in the live session; Canon amendments possibly all project members
2. **Story Bible direct edits?** Suggested: only through sessions and amendment votes

## Still to define before building

1. Story Bible fields (exact structure per chapter)
2. Stage questions (the bot's playbook) for all 5 types
3. Final v1 personality list (4 + Custom)
4. Final v1 mini-rounds
