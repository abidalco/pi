// π Script demo — static data: Generator personalities + twists, block types, the sample script.
// Personalities and twists are the Brainstorm ones (spec: "the bot feels the same in both places").
// The Cheerleader is retired there (BOT.md §4), so it is retired here too.

export const PERSONALITIES = {
  director:  { key: 'director',  emoji: '🎩', name: 'The Director',      vibe: 'Decisive, pushes for clarity',
    prompt: 'You are decisive. Short sentences. You cut to the strongest version and commit. Never "maybe".' },
  trickster: { key: 'trickster', emoji: '🃏', name: 'The Trickster',     vibe: 'Chaotic, throws wildcards',
    prompt: 'You are playful. You invert, exaggerate, and smuggle one absurd option into every set. You love the worst idea because it hides the best one.' },
  doctor:    { key: 'doctor',    emoji: '🧠', name: 'The Script Doctor', vibe: 'Analytical, asks "why?"',
    prompt: 'You are calm and analytical. You fix structure: the missing turn, the unearned beat, the line that explains too much. You cut more than you add.' },
  coach:     { key: 'coach',     emoji: '🎭', name: 'The Drama Coach',   vibe: 'Emotional, character-focused',
    prompt: 'You are warm and emotional. You care about what the character wants and hides. Subtext over plot; you make people say less and mean more.' },
  custom:    { key: 'custom',    emoji: '✏️', name: 'Custom',            vibe: 'Team describes it in a line', prompt: '' },
};

export const TWISTS = {
  none:     { key: 'none',     emoji: '·',  name: 'No twist',   rule: 'Straight help in the personality\'s voice: a few genuinely different takes on the selected lines.' },
  flip:     { key: 'flip',     emoji: '🔄', name: 'Flip it',    rule: 'Invert the core assumption of the selected lines: who wants what, who wins, what is said versus meant.' },
  yesand:   { key: 'yesand',   emoji: '➕', name: 'Yes, and…',  rule: 'Keep the lines and add one concrete thing to each option. No criticism.' },
  wildcard: { key: 'wildcard', emoji: '🎲', name: 'Wildcard',   rule: 'Smuggle in one unrelated element (an object, a sound, the weather) that the lines must absorb.' },
  worst:    { key: 'worst',    emoji: '💀', name: 'Worst idea', rule: 'First option: the worst possible version. Then the one true thing hiding in it, written as real options.' },
  shuffle:  { key: 'shuffle',  emoji: '🔀', name: 'Shuffle',    rule: 'The server picks one of the four twists at random.' },
};

export const BLOCK_TYPES = {
  heading:    { key: 'heading',    name: 'Scene heading', hint: 'INT/EXT, location, time of day' },
  action:     { key: 'action',     name: 'Action',        hint: 'Description' },
  dialogue:   { key: 'dialogue',   name: 'Dialogue',      hint: 'Character + line, optional (parenthetical)' },
  transition: { key: 'transition', name: 'Transition',    hint: 'CUT TO, FADE OUT… (optional)' },
  note:       { key: 'note',       name: 'Note',          hint: 'Team-only comment, never exported' },
};

export const FRAMINGS = ['ECU', 'CU', 'MCU', 'MS', 'MWS', 'WS', 'EWS', 'OTS', 'POV', 'INSERT', 'TWO-SHOT'];

// The spec's own wireframe (1 Opening · 2 The call · 3 Rooftop · 4 Chase), written out so there is something to test on.
// Order is NOT approved yet: the demo starts in Phase 1.
export const SAMPLE = {
  title: 'Rainline',
  logline: 'A night courier who never reads what she carries gets one envelope she can\'t stop thinking about.',
  characters: ['MAYA', 'OMAR', 'DISPATCH'],
  scenes: [
    { title: 'Opening', blocks: [
      { type: 'heading', intExt: 'EXT.', location: 'RING ROAD BRIDGE', time: 'NIGHT' },
      { type: 'action', text: 'Rain in sheets. Headlights smear across the wet tarmac.\nMAYA (30s), courier jacket, no helmet, threads a bicycle between two buses with an inch to spare.' },
      { type: 'action', text: 'A satchel on her back. Taped to the strap: a handwritten rule. NEVER OPEN.' },
      { type: 'dialogue', character: 'DISPATCH', paren: 'V.O., radio', line: 'Maya. One more. Pick-up at the port, drop at the old cinema.' },
      { type: 'dialogue', character: 'MAYA', paren: '', line: 'It\'s two a.m.' },
      { type: 'dialogue', character: 'DISPATCH', paren: 'V.O.', line: 'Triple rate.' },
      { type: 'action', text: 'She doesn\'t answer. She turns the bike around.' },
      { type: 'transition', text: 'CUT TO:' },
    ] },
    { title: 'The call', blocks: [
      { type: 'heading', intExt: 'INT.', location: 'MAYA\'S FLAT', time: 'NIGHT' },
      { type: 'action', text: 'A single bulb. The envelope sits on the kitchen table, unopened, dripping.\nMaya\'s phone buzzes. UNKNOWN NUMBER.' },
      { type: 'dialogue', character: 'OMAR', paren: 'on the phone', line: 'You still have it.' },
      { type: 'dialogue', character: 'MAYA', paren: '', line: 'The cinema was closed. Who is this?' },
      { type: 'dialogue', character: 'OMAR', paren: '', line: 'Somebody who needs you not to open it. Go up to the roof. Bring it.' },
      { type: 'note', text: 'Do we want Omar to know her name here? It changes who he is.' },
    ] },
    { title: 'The rooftop', blocks: [
      { type: 'heading', intExt: 'EXT.', location: 'ROOF', time: 'NIGHT' },
      { type: 'action', text: 'Rain hammers the water tanks. Maya waits by the ledge, the envelope inside her jacket.\nOMAR (40s) steps out of the stairwell. Wet suit, no umbrella.' },
      { type: 'dialogue', character: 'MAYA', paren: '', line: 'Don\'t come closer.' },
      { type: 'dialogue', character: 'OMAR', paren: 'gently', line: 'Have you read it?' },
      { type: 'dialogue', character: 'MAYA', paren: '', line: 'I don\'t read them. That\'s the job.' },
      { type: 'action', text: 'He takes one step. She takes one back. Her heel finds the edge.' },
    ] },
    { title: 'Chase', blocks: [
      { type: 'heading', intExt: 'EXT.', location: 'MARKET ALLEYS', time: 'NIGHT' },
      { type: 'action', text: 'Maya flies down the stairs of the fire escape, three at a time. Omar is not behind her. Someone else is: two torches sweeping the alley.' },
    ] },
  ],
  floating: [
    { title: 'Market at dawn', blocks: [
      { type: 'heading', intExt: 'EXT.', location: 'FISH MARKET', time: 'DAWN' },
      { type: 'note', text: 'From the brainstorm: Maya finally opens it, here, among strangers. Where does this go?' },
    ] },
  ],
};
