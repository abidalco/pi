# Section 3: References

**Status:** Locked at concept level (design only, nothing built yet). A few details are still open (see the end).

## One-line definition

The **source of truth for how things look and sound**: characters, locations and props that must stay the same across shots. The image, video and audio steps generate from them.

```
Project → References (Character / Location / Prop) → Variants → Versions → used in Shots
```

- **Rule of thumb:** if the script decides it, it's not a reference. Time of day, weather, temporary conditions (wet, crying, muddy) and the film's style/look come from the Script, and the image step applies them on top of the reference.

---

## Types

### 🧑 Character

| Part | Contains |
|---|---|
| Description | Name, age, build, face, hair, distinguishing marks |
| Sheet | Front / side / back, same pose and lighting |
| Expressions | Neutral, happy, angry, sad, scared… (a grid of faces) |
| Motion | How they move: walk, posture, gestures, energy ("slouches, quick small steps"). Text first, an optional short clip later |
| Outfits / style | Main outfit + others (work, pajamas, night out…) |
| 🎙️ Voice (tab) | A text description that Audio generates from later (see below) |

**Voice description**

| Field | Example |
|---|---|
| Age / gender feel | Late 20s, female |
| Pitch / tone | Low, slightly husky |
| Accent | Light British |
| Pace / rhythm | Fast, cuts herself off |
| Emotional range | Dry humor, rarely shouts |
| Sample line | "Don't. Just… don't." |

### 📍 Location

A **place** with **areas** inside it. Script headings map to it directly: `INT. MAYA'S HOME – KITCHEN – NIGHT` → Maya's home → Kitchen (night comes from the script).

```
📍 Maya's home          📍 Café Luna
 ├── Living room         ├── Counter
 ├── Kitchen             └── Window table
 └── Bedroom
```

| Part | Contains |
|---|---|
| Description | What it is, mood, era, key details |
| Layout view | One wide image of the whole place, so the layout stays consistent (the window is always on the same side) |
| Areas | Sub-spots where scenes happen (kitchen, counter…), each with its own image |
| Regulars | Characters who live or work there |

- ❌ No time/weather versions. The script decides those

### 🔑 Prop

| Part | Contains |
|---|---|
| Description | What it is, material, color, details |
| Object sheet | Front / side / back (+ top if needed) |
| Scale | Shown next to a person, so its size doesn't change between shots |
| States | New / broken / open / bloody… |

- ❌ No owner field
- ❌ **Style/Look is not a reference.** It's set in the Script, per scene or sequence (see the Script addition below)

---

## Where references come from

| Way | How |
|---|---|
| 🤖 **Automatic** | The tool reads the Script (speaking characters, scene-heading locations and areas) and Brainstorm 🧑 Character cards, and **creates the cards straight away** with descriptions filled in |
| ✋ **+ Add** | Create a Character / Location / Prop by hand. **Props are always added by hand** (scripts mention too many objects to guess) |

- **Description gaps:** if the script says little ("OMAR"), the AI fills in a suggested description, marked **"AI-suggested"**, which the team can edit before generating
- Uploading your own images and editing by hand stay available on every card

---

## Generate

Each card has a **✨ Generate** button connected to **OpenAI** image generation (v1 provider, with the model kept as a setting so it can be swapped later).

| Step | What happens |
|---|---|
| 1. Front first | Generate the **front view** → 3–4 options → pick one → owner approves |
| 2. The rest | Side / back / expressions (or a location's areas, a prop's angles) are generated **from the approved front view**, so the face/object matches |
| 3. Fix by prompt | Type a fix ("shorter hair", "add scar left cheek") → regenerate from the current image |
| 4. Approve | The owner approves. The reference is now used by shots |

- Every Generate returns **3–4 options**
- A simple Generate + Fix panel, **without** the Brainstorm personalities/twists (those are for writing)

```
Script / Brainstorm ──► 🧑 Maya card (description filled in)
                               │
                          [✨ Generate] ──► OpenAI ──► 4 front options
                               │
                     pick → side/back/expressions from it
                               │
                        Review → Approve (owner)
```

---

## Variants (lasting changes only)

| Kind | Example | Where it lives |
|---|---|---|
| 🌧️ Temporary | Wet, sweaty, crying, muddy | ❌ Not a variant. The image step reads it from the script |
| 👕 Outfits | Work suit, pajamas | Character → Outfits |
| 🩹 Lasting change | Scar from sc. 5 on, haircut, aged 10 years, burned café after the fire | ✅ **Variant** |

- **Auto-variants:** when a **locked scene in the Main draft** introduces a lasting change, the tool creates the variant automatically, with an updated description and status **⏳ Awaiting generation**, starting from that scene
- **Which variant a shot uses:** picked automatically from the scene range, with a manual override

```
Script sc. 5: "…the blade catches Maya's cheek, leaving a scar."
        ↓ (auto, once sc. 5 is locked in Main)
🧑 Maya
 ├── Default    sc. 1–4   ✅ Approved
 └── Scarred    sc. 5 →   ⏳ Awaiting generation
                          "Same as Default + thin scar, left cheek"
```

---

## Approval and ownership

| Action | Rule |
|---|---|
| Generating options, fixing by prompt, editing descriptions | Anyone |
| Approving a reference (or a variant) | **The reference's owner only** |
| Owner | Assigned **per reference**, defaulting to the project's art lead |
| Re-editing after approval | Allowed. Creates a new version (the old one is kept) and marks affected shots Stale |

## Reference lifecycle

```
Draft → Awaiting generation → Generating → Review → Approved
                                                       │ re-edit
                                                       ▼
                                          new version + affected shots ⚠️ Stale
```

## Downstream protection

Example: Maya v1 (brown hair) is approved, 20 shots are made with it, then the owner changes her to red hair → **Maya v2**.

- **Maya v1 is kept**, nothing is overwritten
- The 20 shots get a ⚠️ **Stale** badge ("made with an old Maya")
- For each shot (or all at once): **Keep** (e.g. a flashback) / **Regenerate** with v2 / **Adjust** (fix only the hair)

---

## Links

| Link | How |
|---|---|
| Shot → references | Filled in **automatically** in the Shot List from the shot's characters in frame (the right variant) + location area. Props are added by hand |
| Reference → "Used in" | Each card lists every shot and image that uses it |
| Continuity Judge | **Text checks in v1:** descriptions against the Story Bible ("Bible says blue eyes, description says brown"). Image checks later |
| Story Bible | Approved references go into its **Visual Continuity** chapter |

---

## Layout

The sketch below is a guide; the final visual design is left to the build.

```
┌──────────────────────────────────────────────────────────┐
│ [🧑 Characters] [📍 Locations] [🔑 Props]        [+ Add] │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │  Maya  │ │  Omar  │ │  Waiter│ │  Key   │             │
│ │✅ Appr.│ │👀Review│ │⏳Await.│ │⚠️Stale │             │
│ └────────┘ └────────┘ └────────┘ └────────┘             │
└──────────────────────────────────────────────────────────┘
          ↓ click
┌─────────────────────────────┬────────────────────────────┐
│ 🧑 MAYA   Owner: Lena       │  ✨ GENERATE               │
│ Description (AI-suggested)  │  [Generate] → 4 options    │
│ Sheet: front·side·back      │  Fix: "add scar left…" [↻] │
│ Expressions · Motion        │                            │
│ Outfits · 🎙️ Voice          │  [Approve] (owner only)    │
│ Variants · Versions         │                            │
│ Used in: 3.1 3.2 4.5 …      │                            │
└─────────────────────────────┴────────────────────────────┘
```

**Status badges:** ✏️ Draft · ⏳ Awaiting generation · ⚙️ Generating · 👀 Review · ✅ Approved · ⚠️ Stale

---

## Addition to Section 2 (Script)

- **Look field on scenes:** the film's style/look (medium, palette, lighting, camera feel, mood board) is set in the Script per scene or sequence, since it can change between scenes (e.g. flashbacks in warm sepia). The image step applies it on top of the references

---

## Locked decisions

1. Three types: **Character** (description, sheet, expressions, motion, outfits, voice description tab), **Location** (place → areas, layout view, regulars), **Prop** (object sheet, scale, states)
2. **If the script decides it, it's not a reference:** no time/weather, no temporary conditions, no Style/Look (that moves to Script)
3. Characters and locations are **created automatically** from the Script and Brainstorm cards. Props by hand. Gaps are filled with AI-suggested descriptions
4. **Generate** via OpenAI (v1, model swappable): front view first, the rest from it, 3–4 options each time, fix by prompt. No personalities/twists
5. **Variants = lasting changes only**, created automatically from locked scenes in Main, picked per shot by scene range with manual override
6. **One owner per reference** (default: art lead) approves. Anyone can generate options. Re-editing after approval makes a new version and marks shots Stale (keep / regenerate / adjust)
7. Shot references are filled in automatically. Each reference has a "Used in" list. The Judge checks text in v1, images later

## Open questions (details, can be settled while building)

- When an auto-variant's scene range changes (the scar scene moves), does the variant follow automatically?
- What happens to a reference when its only scene is cut: archive it, or keep it?
- Does Voice get a generated sample here as a preview, or only in Audio?
- Exactly which expressions make up the default grid?

## Next

**Section 4: Image generation.** Starting point: one keyframe per shot, built from the shot's fields + linked references (correct variants) + the scene's Look + time/weather from the script; options to pick from, fix by prompt, approval, versions and Stale handling.
