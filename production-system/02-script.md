# Section 2: Script

**Status:** Locked at concept level (design only, nothing built yet). A few details are still open (see the end).

## One-line definition

The **source of truth for the story**. Scenes are ordered on a board, written together in a block-based doc with AI help, and locked scenes are broken into shots for the image, video and audio sections.

```
Project → Drafts → Versions → Scenes (ordered + floating) → Blocks → Shots
```

- **One project = one film.** The structure keeps an optional Episode level for later (Series → Episodes → Scenes), hidden in v1.

---

## Entry points

| From | Becomes |
|---|---|
| 💡 Idea promoted (Brainstorm) | New script skeleton: title, logline, character list, empty scene cards |
| 🎬 Scene promoted | A floating scene card. The Judge suggests where it fits |
| 💬 Dialogue promoted | Lines inserted into an existing scene |
| ✍️ Direct writing | Typed straight into the Script Doc |

---

## The three phases (views)

### Phase 1: Scene Board (order)

- Scenes are **floating cards**, each with a **number + title**
- Anyone drags cards to reorder them, and numbers update live
- When the order is ready, the team approves it by **majority vote** and moves on to Phase 2

### Phase 2: Script Doc (writing)

A Google Docs-like editor with **live co-editing**. The script is split into **blocks** inside numbered scenes.

```
┌──────────────┬──────────────────────────────┬──────────────────┐
│ SCENE OUTLINE│        SCRIPT DOC            │   GENERATOR      │
│ 1 Opening    │ 3. THE ROOFTOP               │ Personality: ▾   │
│ 2 The call   │ [Heading] EXT. ROOF - NIGHT  │ Twist: Flip it 🔀│
│ 3 Rooftop ◀  │ [Action]  Rain hammers…      │                  │
│ 4 Chase      │ [Dialogue] MAYA: Don't…  ──drag──►  options…    │
│ + Scene      │ + block  /  "/" menu         │ Replace / Alt    │
└──────────────┴──────────────────────────────┴──────────────────┘
```

- **Scene outline sidebar (left):** the same numbered cards. Dragging one makes a **proposed move**, previewed in the outline. Everyone gets a quick vote card, and a majority applies it. Scene and shot numbers update everywhere (e.g. 3.2 becomes 4.2)
- **Add anywhere:**
  - **Block:** "+" between blocks or the "/" menu. Free, no approval
  - **Scene:** "+ Scene" at any position. It can be written in right away, but its **position stays pending** until a majority approves it (the Judge suggests a spot if needed)
- **New scenes from Brainstorm** land in a **floating tray** beside the Doc. The Judge suggests a placement and a majority approves it

### Phase 3: Shot List (breakdown)

- Opens for **locked scenes only**
- The AI proposes shots, and the team edits and approves them
- Fields: shot # (global, e.g. **3.2**), framing, camera, characters in frame, location, action, dialogue/VO, estimated duration, linked references, status

---

## Block format (custom)

| Block | Contains |
|---|---|
| Scene heading | INT/EXT, location, time of day |
| Action | Description |
| Dialogue | Character + line, with an optional parenthetical, e.g. "(whispering)" |
| Transition | CUT TO, FADE OUT… (optional) |
| Note | Team-only comment, never exported |

- Blocks are what the Generator edits, the Judge checks and the Shot List reads
- Export: **PDF**. Fountain/FDX may come later as a converter

---

## Generator panel (AI helper)

| Step | What happens |
|---|---|
| 1. Pick | Select one or more lines or blocks |
| 2. Drag | Drop them onto the Generator panel on the right |
| 3. Set up | Pick a **personality** (Director, Trickster, Script Doctor, Drama Coach, Cheerleader, Custom) and an optional **twist** (Flip it / Yes-and / Wildcard / Worst idea / 🔀 Shuffle) |
| 4. Options | The bot returns a few alternatives |
| 5. Apply | Replace the line, insert as an alternate, or drop back to refine again |

- The personalities and twists are the same as in Brainstorm, so the bot feels the same in both places
- **Anyone can apply** a result. Each change is logged with who made it and which personality/twist produced it
- Other helpers (always proposals): **Pacing check**, **Send to Brainstorm** (opens a Scene/Dialogue session already loaded), **Breakdown** (proposes the Shot List)

---

## Drafts and versions

Every team member can have their own **draft** of the script. All drafts are listed, and any saved version of any draft can be opened or restored at any time.

```
DRAFTS
├── ⭐ Main          (team, co-edited)     v1 · v2 "Table-read" · v3 (lock: sc. 4)
├── Maya's draft     (forked from Main v2) v1 · v2
├── Omar's draft     (forked from Main v2) v1
└── Lena's draft     (forked from Main v3) v1 · v2 · v3
```

| Rule | Detail |
|---|---|
| A draft | A full copy of the script, owned by its creator, forked from any version of any draft |
| Drafts list | Shows every draft: owner, forked-from, last edited, number of versions |
| Versions | Whole-script snapshots. Saved **automatically on every scene lock** plus a **"Save version"** button for named saves ("Table-read draft") |
| Go back | Open any version of any draft read-only, or **restore** it. A restore creates a new version, so nothing is ever overwritten |
| ⭐ Main draft | The one the pipeline uses. Locks, the Shot List and downstream assets come only from Main |
| Promote a draft | Any draft can become Main by **majority vote**. The old Main stays in the list |
| Compare | Side-by-side diff of any two drafts or versions |

---

## Scene lifecycle

```
Floating → Placed → Drafted → Checked (Judge) → Locked (majority) → Broken down
```

## Who approves what

| Action | Rule |
|---|---|
| Editing drafts, adding blocks, applying Generator results, saving versions | Free for anyone (in their own draft or in Main) |
| Approving the scene order, moving a scene, placing a new scene | Majority vote |
| Locking a scene | Continuity Judge check, then majority vote |
| Making a draft the Main draft | Majority vote |

---

## Downstream protection

Editing a **locked scene** marks every image, video and audio asset made from it as **Stale** and shows what changed (compared with the version that was locked). For each asset the team picks: **keep / regenerate / adjust**.

## Continuity Judge in Script

- Runs when a scene is locked and whenever a locked scene is edited (see the Story Bible in Section 1)
- New facts go into the Story Bible Facts Ledger automatically
- Suggests placements for floating scenes

---

## Locked decisions

1. Three phases: **Scene Board** (number + title cards, reorder by hand, majority approves the order) → **Script Doc** (live co-editing in blocks, outline left, Generator right) → **Shot List** (locked scenes only)
2. Phase 2 reordering = drag a card to propose a move, then a majority vote applies it
3. New blocks are free. A new scene can be written right away, but its position needs a majority
4. Drafts are free to edit. Only order, placement, locking and choosing Main need a majority
5. **Custom block format**, PDF export
6. **One film per project**, with the structure ready for Episodes later
7. **Shot breakdown lives inside Script**
8. **Whole-script versions**, saved automatically on lock plus by hand. **Per-member drafts**, all listed, any version restorable. **Main** feeds the pipeline

## Open questions (details, can be settled while building)

- Can one draft take a single scene from another draft ("pull scene 4 from Maya's draft into Main"), or only replace the whole draft?
- Can members edit each other's drafts, or only comment on them?
- Exactly which blocks to add later (VO/Off-screen, Montage, Insert)?

## Next

**Section 3: References.** Starting point: types (Characters, Locations, Props, Style/Mood), sources (promoted character cards, the script's character list and locations, uploads, AI sheets), versions + approval per reference, a "used in" list of shots, and visual continuity with the Judge later.
