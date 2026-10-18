// The mid-production demo: Al Mousalsal (the Idea promoted in the brainstorm demo), two days in.
// Blocks carry a local key `k` so shots, edits and alternates can point at them; the server swaps keys for ids.

export const DEMO = {
  title: 'Al Mousalsal',
  logline: 'When her favourite soap villain dies, a grandmother in Tyre sets out to prove the writers murdered him — with her grandson as unwilling detective.',
  notes: 'tone: Warm, deadpan comedy with a melancholy undertow\nthemes: Grief disguised as obsession; families who talk through television\nending: open',
  characters: ['TETA SAMIRA', 'KARIM', 'ABU HASSAN', 'DENIZ'],

  // v1: what the bot's skeleton looked like
  skeleton: [
    { key: 's1', title: 'The announcement', note: 'News of the actor’s death breaks in the middle of the soap.' },
    { key: 's2', title: 'The theory', note: 'Teta lays out her case at the kitchen table.' },
    { key: 's3', title: 'Abu Hassan’s shop', note: 'The DVD shop: a lead to the dubbing studio.' },
    { key: 's4', title: 'The call to Istanbul', note: 'Karim video-calls the fan page admin.' },
    { key: 's5', title: 'Jiddo’s chair', note: 'Late night. The grief under the theory.' },
    { key: 's6', title: 'The funeral on TV', note: 'The actor’s funeral, watched like a family one.' },
  ],

  scenes: {
    s1: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'TETA SAMIRA’S LIVING ROOM, TYRE', time: 'NIGHT' },
      { k: 'a1', type: 'action', text: 'A Turkish soap, dubbed into Syrian Arabic, fills the room with blue light. On screen, KEREM BEY (50s, moustache, menace) slaps a glass off a table.' },
      { k: 'a2', type: 'action', text: 'TETA SAMIRA (74) watches from the sofa, rosary in one hand, remote in the other. Beside her, an empty armchair. On top of the TV, a pair of men’s reading glasses, folded.' },
      { k: 'a3', type: 'action', text: 'KARIM (26), her grandson, types on a laptop at the dining table. He came from Beirut for a week. That was eight months ago.' },
      { k: 'a4', type: 'action', text: 'A news ticker crawls across the soap: TURKISH ACTOR SELIM AYDIN, “KEREM BEY”, DEAD AT 58.' },
      { k: 'a5', type: 'action', text: 'Teta mutes the TV. The rosary stops.' },
      { k: 'd1', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'Karim.' },
      { k: 'd2', type: 'dialogue', character: 'KARIM', paren: 'not looking up', line: 'Mm.' },
      { k: 'd3', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'They killed him.' },
      { k: 'd4', type: 'dialogue', character: 'KARIM', paren: '', line: 'Who?' },
      { k: 'd5', type: 'dialogue', character: 'TETA SAMIRA', paren: 'pointing the remote at the screen like a gun', line: 'The writers.' },
      { k: 't1', type: 'transition', text: 'CUT TO:' },
    ],
    s2: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'KITCHEN', time: 'NIGHT' },
      { k: 'a1', type: 'action', text: 'Coffee cups lined up on the oilcloth like suspects. Teta moves them as she talks. Karim eats labneh straight from the jar.' },
      { k: 'd1', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'Episode 140. Heart attack. He survived.' },
      { k: 'd2', type: 'dialogue', character: 'KARIM', paren: '', line: 'That was the show, Teta. This is a real man.' },
      { k: 'd3', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'Episode 212, he fights the producer about money. Episode 213, he falls down the stairs.' },
      { k: 'd4', type: 'dialogue', character: 'KARIM', paren: '', line: 'He fell down the stairs in the show.' },
      { k: 'd5', type: 'dialogue', character: 'TETA SAMIRA', paren: 'tapping a cup', line: 'And who writes the show?' },
      { k: 'a2', type: 'action', text: 'Karim opens his mouth. Closes it. Reaches for more labneh.' },
      { k: 'n1', type: 'note', text: 'Is she joking? Keep it ambiguous until Jiddo’s chair.' },
    ],
    s3: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'ABU HASSAN SATELLITE & DVD', time: 'DAY' },
      { k: 'a1', type: 'action', text: 'A shop the size of a lift. Walls of bootleg box sets. ABU HASSAN (60s) stands on a ladder, fixing a satellite dish that isn’t connected to anything.' },
      { k: 'd1', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'All the seasons. And the ones they haven’t made yet.' },
      { k: 'd2', type: 'dialogue', character: 'ABU HASSAN', paren: '', line: 'Hajje, nobody has those.' },
      { k: 'd3', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'The dubbing studio has them. Your cousin works there.' },
      { k: 'd4', type: 'dialogue', character: 'ABU HASSAN', paren: '', line: 'My cousin does the voice of a horse. In a different show.' },
      { k: 'd5', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'In Damascus?' },
      { k: 'd6', type: 'dialogue', character: 'ABU HASSAN', paren: '', line: 'In Beirut. Hamra. Above a shawarma place.' },
      { k: 'a2', type: 'action', text: 'In the doorway, Karim mouths “no” at Abu Hassan. Too late: Teta is already writing it down.' },
    ],
    s4: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'TETA SAMIRA’S LIVING ROOM', time: 'NIGHT' },
      { k: 'a1', type: 'action', text: 'Karim on a video call. On the laptop: DENIZ (30s), admin of the biggest Kerem Bey fan page in Istanbul, in a bedroom wallpapered with his face. Teta sits just out of frame, feeding questions.' },
      { k: 'd1', type: 'dialogue', character: 'TETA SAMIRA', paren: 'whispering', line: 'Ask her who benefits.' },
      { k: 'd2', type: 'dialogue', character: 'KARIM', paren: 'in English', line: 'My grandmother wants to know who benefits.' },
      { k: 'd3', type: 'dialogue', character: 'DENIZ', paren: '', line: 'From Selim’s death? Nobody. The show is finished without him.' },
      { k: 'd4', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'Exactly. So why are they still filming?' },
      { k: 'd5', type: 'dialogue', character: 'KARIM', paren: '', line: '…Are they still filming?' },
      { k: 'a2', type: 'action', text: 'Deniz goes very still. She leans into her camera.' },
      { k: 'd6', type: 'dialogue', character: 'DENIZ', paren: '', line: 'How does she know that?' },
    ],
    s5: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'TETA SAMIRA’S LIVING ROOM', time: 'LATE NIGHT' },
      { k: 'a1', type: 'action', text: 'The TV hisses on an empty channel. Teta is asleep sitting up. The remote isn’t in her hand. It’s on the armchair next to her, where someone would reach for it.' },
      { k: 'a2', type: 'action', text: 'Karim lifts the reading glasses off the TV. Turns them over. Puts them back exactly where they were.' },
      { k: 'd1', type: 'dialogue', character: 'TETA SAMIRA', paren: 'eyes closed', line: 'He always guessed the ending before me.' },
      { k: 'd2', type: 'dialogue', character: 'KARIM', paren: '', line: 'Jiddo?' },
      { k: 'd3', type: 'dialogue', character: 'TETA SAMIRA', paren: '', line: 'Kerem Bey.' },
      { k: 'a3', type: 'action', text: 'Karim sits down in the armchair. It’s the first time anyone has.' },
      { k: 'n1', type: 'note', text: 'The undertow scene. Short. Don’t explain.' },
    ],
    s6: [
      { k: 'h', type: 'heading', intExt: 'INT.', location: 'TETA SAMIRA’S LIVING ROOM', time: 'DAY' },
      { k: 'n1', type: 'note', text: 'The actor’s funeral, live from Istanbul. Teta dresses in black for it. The neighbours come with food. Nobody says it’s for a Turkish actor. Write me.' },
    ],
  },

  shots: {
    s1: [
      { framing: 'WS', camera: 'static', characters: '', location: 'LIVING ROOM', action: 'The room in blue soap light. On the TV, Kerem Bey slaps a glass off a table.', dialogue: '', duration: 4, covers: ['h', 'a1'], assets: ['image', 'video'] },
      { framing: 'MS', camera: 'slow push in', characters: 'TETA SAMIRA', location: 'LIVING ROOM', action: 'Teta on the sofa, rosary and remote. The empty armchair beside her.', dialogue: '', duration: 4, covers: ['a2'], assets: ['image'] },
      { framing: 'INSERT', camera: 'static', characters: '', location: 'LIVING ROOM', action: 'Jiddo’s reading glasses, folded on top of the TV.', dialogue: '', duration: 2, covers: ['a2'], assets: ['image'] },
      { framing: 'MCU', camera: 'static', characters: 'KARIM', location: 'LIVING ROOM', action: 'Karim typing at the dining table, not watching.', dialogue: '', duration: 3, covers: ['a3'], assets: ['image'] },
      { framing: 'CU', camera: 'static', characters: '', location: 'LIVING ROOM', action: 'The news ticker crawls across the soap.', dialogue: '', duration: 3, covers: ['a4'], assets: ['image'] },
      { framing: 'TWO-SHOT', camera: 'static', characters: 'TETA SAMIRA, KARIM', location: 'LIVING ROOM', action: 'Teta mutes the TV. The rosary stops. She aims the remote at the screen.', dialogue: 'TETA: Karim. / KARIM: Mm. / TETA: They killed him. / KARIM: Who? / TETA: The writers.', duration: 9, covers: ['a5', 'd1', 'd2', 'd3', 'd4', 'd5', 't1'], assets: ['image', 'video', 'audio'] },
    ],
    s2: [
      { framing: 'WS', camera: 'high angle, static', characters: '', location: 'KITCHEN', action: 'The kitchen table: coffee cups lined up like suspects.', dialogue: '', duration: 3, covers: ['h', 'a1'], assets: ['image'] },
      { framing: 'OTS', camera: 'handheld', characters: 'TETA SAMIRA, KARIM', location: 'KITCHEN', action: 'Over Karim’s shoulder: Teta moves the cups as she argues.', dialogue: 'TETA: Episode 140… / KARIM: That was the show… / TETA: Episode 212…', duration: 10, covers: ['d1', 'd2', 'd3'], assets: ['image'] },
      { framing: 'TWO-SHOT', camera: 'static', characters: 'TETA SAMIRA, KARIM', location: 'KITCHEN', action: 'Karim answers; Teta taps a cup.', dialogue: 'KARIM: He fell down the stairs in the show. / TETA: And who writes the show?', duration: 5, covers: ['d4', 'd5'], assets: ['image', 'audio'] },
      { framing: 'CU', camera: 'static', characters: 'KARIM', location: 'KITCHEN', action: 'Karim’s mouth opens, closes. More labneh.', dialogue: '', duration: 3, covers: ['a2'], assets: ['image'] },
    ],
  },

  // the "Table-read fixes" sesh changed these lines (first-pass versions here)
  firstPass: [
    { scene: 's3', k: 'd4', line: 'My cousin does voices. Cartoons, mostly.' },
    { scene: 's4', k: 'd5', line: 'Are they still filming?' },
  ],
  tableReadTags: ['dialogue'],
  tableReadNote: 'Abu Hassan still sounds too polished. Rougher, funnier.',

  // after the lock of s2, the other person changed one line
  lockedEdit: { scene: 's2', k: 'd4', line: 'He fell down the stairs in the show. Jiddo fell down real ones.' },
  lockedEditCheck: { verdict: 'warn', notes: [
    { verdict: 'warn', k: 'd4', note: 'Changed: “He fell down the stairs in the show.” → “…Jiddo fell down real ones.” This makes Jiddo’s death a fall. Jiddo’s chair has Teta asleep by his armchair as if he went quietly. Pick one, or keep it as Karim lashing out.' },
  ] },

  // the Judge's two ⚠️ on s3: it locked anyway, the notes wait to be dismissed or fixed
  s3Check: { verdict: 'warn', notes: [
    { verdict: 'warn', k: 'd2', note: 'Abu Hassan calls her “Hajje”. Nothing says Teta Samira has made the pilgrimage. Fine as a courtesy title; flag only if her faith matters later.' },
    { verdict: 'warn', k: 'd6', note: 'The soap is dubbed into Syrian Arabic (sc. 1) and Teta guesses Damascus; Abu Hassan says Beirut. Plausible, but it puts the trail in Beirut while the next scene goes to Istanbul. Intentional detour?' },
  ] },

  // Generator alternate waiting in s4 (for a2 + d6)
  alt: { scene: 's4', of: ['a2', 'd6'], personality: '🎭 The Drama Coach', twist: '🔄 Flip it', note: 'Flip: Teta isn’t special. There’s a network of grandmothers.', blocks: [
    { type: 'action', text: 'Deniz laughs. Then she stops laughing.' },
    { type: 'dialogue', character: 'DENIZ', paren: '', line: 'She’s the fourth grandmother to call me this week.' },
  ] },

  pacing: { scene: 's4', summary: 'Fast, and it lands on Deniz’s question. The relay through Karim is the joke, and it only runs once. One more round where he translates something else entirely would earn the turn.', notes: [
    { k: 'd2', note: 'Let Karim soften the question in translation here, so Teta’s “Exactly” hits harder.' },
  ] },

  floating: { title: 'Teta writes to the writers', from: '🎬 brainstorm: the letter', blocks: [
    { type: 'heading', intExt: 'INT.', location: 'KITCHEN', time: 'NIGHT' },
    { type: 'note', text: 'From Brainstorm: Teta dictates a letter to the writers in Istanbul. Karim types it in English and softens every line. Ending hook: she makes him read it back.' },
  ], after: 's4', reason: 'After Deniz’s question she has a reason to write, and the funeral (sc. 6) gives her a deadline.' },

  // the other person's draft (forked from Main v3 "Table-read")
  draft: {
    edit: { scene: 's5', k: 'd3', line: 'Both of them.' },
    newScene: { after: 's4', title: 'The writers’ room', blocks: [
      { type: 'heading', intExt: 'INT.', location: 'WRITERS’ ROOM, ISTANBUL', time: 'DAY' },
      { type: 'action', text: 'As Teta imagines it: three WRITERS in black polo necks around a table, smoking under a portrait of Kerem Bey. One of them slowly crosses out a name.' },
      { type: 'dialogue', character: 'WRITER 1', paren: '', line: 'Episode 214. He doesn’t come back from the stairs.' },
      { type: 'dialogue', character: 'WRITER 2', paren: '', line: 'And the old woman in Tyre?' },
      { type: 'action', text: 'They all look straight at us.' },
      { type: 'note', text: 'Fantasy cutaway, Teta’s version. Too much?' },
    ] },
  },

  facts: [
    ['SELIM AYDIN, who plays KEREM BEY, is announced dead at 58', 'The announcement'],
    ['Jiddo’s reading glasses stay folded on top of the TV; his armchair stays empty', 'The announcement'],
    ['KARIM came to Tyre for a week, eight months ago', 'The announcement'],
    ['In the show, Kerem Bey survived a heart attack (ep. 140) and fell down the stairs (ep. 213)', 'The theory'],
  ],
};
