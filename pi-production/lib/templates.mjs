// Brainstorm types, bot personalities and mini-rounds — data only.
// Mirrors Section 1 of abidalco/pi production-system/01-brainstorming.md.
// A type is a template: stages, output fields, promotion target, and a short
// playbook per stage that the bot leans on (the spec leaves the questions open).

export const TEMPLATES = {
  idea: {
    key: 'idea', emoji: '💡', name: 'Idea',
    blurb: 'From keywords or a messy thought to a pitch.',
    promotesTo: 'Script (new skeleton)',
    defaultPersonality: 'trickster',
    fields: ['logline', 'synopsis', 'tone', 'themes'],
    stages: [
      { key: 'spark', name: 'Spark', icon: '🌱',
        goal: 'Collect raw sparks: keywords, feelings, images, half-ideas. Quantity over quality. Every spark becomes a card.',
        ask: ['What are the three to five words this started from?', 'What should the audience feel when it ends?', 'What is the one image you can already see?'] },
      { key: 'shape', name: 'Shape', icon: '🌿',
        goal: 'Find the sparks that pull together. Who is it happening to, what do they want, what is in the way. Try two or three loglines.',
        ask: ['Who is this happening to?', 'What do they want, and what stands in the way?', 'Which spark is the heart and which are decoration?'] },
      { key: 'build', name: 'Build', icon: '🌳',
        goal: 'Beginning, turn, end in a few lines. Tone and themes. What makes it different from the obvious version.',
        ask: ['How does it open, what turns, how does it end?', 'Tone in two words?', 'What is the obvious version of this, and how is ours not that?'] },
      { key: 'pitch', name: 'Pitch', icon: '🎬',
        goal: 'Write the output card: logline (one line), synopsis (5–8 lines), tone, themes. Read it back. The team marks it candidate when it nods.',
        ask: [] },
    ],
  },
  arc: {
    key: 'arc', emoji: '🧭', name: 'Arc',
    blurb: 'The spine of the whole story. Locks into the Story Canon.',
    promotesTo: 'Story Canon',
    defaultPersonality: 'doctor',
    fields: ['spine', 'character_arcs', 'world_rules', 'timeline', 'themes', 'never_list'],
    stages: [
      { key: 'premise', name: 'Premise', icon: '🧭',
        goal: 'Restate the promoted idea as a premise the whole team agrees on. What is the question the story asks?',
        ask: ['In one sentence, what is this story about?', 'What question does it ask, and does it answer it?'] },
      { key: 'spine', name: 'Spine', icon: '🦴',
        goal: 'Beginning / turn / end, then acts. Where is the point of no return?',
        ask: ['What is true at the start that is no longer true at the end?', 'Where is the point of no return?'] },
      { key: 'characters', name: 'Character arcs', icon: '🧑',
        goal: 'For each main character: where they start, what breaks, where they land.',
        ask: ['Who changes the most?', 'Who refuses to change, and what does that cost them?'] },
      { key: 'rules', name: 'Rules', icon: '📜',
        goal: 'World rules, timeline, and the "never" list: the things this story will not do.',
        ask: ['What are the rules of this world that can never bend?', 'What would betray the story if it happened?', 'How much time passes?'] },
      { key: 'lock', name: 'Lock', icon: '🔒',
        goal: 'Write the output card: spine, character arcs, world rules, timeline, themes, never list. This becomes canon.',
        ask: [] },
    ],
  },
  character: {
    key: 'character', emoji: '🧑', name: 'Character',
    blurb: 'A person the team can draw, write and hear.',
    promotesTo: 'References + script character list',
    defaultPersonality: 'coach',
    fields: ['name', 'role', 'look', 'personality', 'arc', 'voice_notes'],
    stages: [
      { key: 'sketch', name: 'Sketch', icon: '✏️',
        goal: 'Name, role in the story, first look: three physical details anyone would notice.',
        ask: ['What do we call them?', 'What are they to the story: hero, obstacle, mirror?', 'Three things you notice in the first second?'] },
      { key: 'wantfear', name: 'Want / Fear', icon: '💔',
        goal: 'What they want out loud, what they want underneath, what they fear most.',
        ask: ['What do they say they want?', 'What do they actually want?', 'What would they do anything to avoid?'] },
      { key: 'voice', name: 'Voice', icon: '🗣️',
        goal: 'How they talk: rhythm, vocabulary, a line only they would say. Notes for a voice actor or TTS.',
        ask: ['Give me a line only they would say.', 'Do they talk too much or too little?', 'Accent, pace, pitch?'] },
      { key: 'profile', name: 'Profile', icon: '🪪',
        goal: 'Write the output card: name, role, look, personality, arc, voice notes.',
        ask: [] },
    ],
  },
  scene: {
    key: 'scene', emoji: '🎬', name: 'Scene',
    blurb: 'One moment, with stakes and beats, ready for a script slot.',
    promotesTo: 'Script scene slot',
    defaultPersonality: 'director',
    fields: ['location', 'who_is_there', 'purpose', 'beats', 'ending_hook'],
    stages: [
      { key: 'moment', name: 'Moment', icon: '📍',
        goal: 'Where, when, who is there. The single image the scene is built around.',
        ask: ['Where are we and what time is it?', 'Who is in the room, and who is missing?'] },
      { key: 'stakes', name: 'Stakes', icon: '⚡',
        goal: 'What the scene must do for the story, and what each person in it wants right now.',
        ask: ['Why does the story need this scene?', 'What does each person want in this room?', 'What goes wrong if they get it?'] },
      { key: 'beats', name: 'Beats', icon: '🥁',
        goal: 'Four to eight beats, in order. The turn. The last image.',
        ask: ['What is the first thing that happens?', 'Where does it turn?', 'What is the last image before we cut?'] },
      { key: 'card', name: 'Scene card', icon: '🎬',
        goal: 'Write the output card: location, who is there, purpose, beats, ending hook.',
        ask: [] },
    ],
  },
  dialogue: {
    key: 'dialogue', emoji: '💬', name: 'Dialogue',
    blurb: 'An exchange with subtext, inside a scene.',
    promotesTo: 'Script (inside a scene)',
    defaultPersonality: 'coach',
    fields: ['exchange', 'characters', 'intent_per_line'],
    stages: [
      { key: 'situation', name: 'Situation', icon: '🎭',
        goal: 'Which scene, which characters, what just happened before the first line.',
        ask: ['Which scene is this inside?', 'What happened ten seconds before the first line?'] },
      { key: 'subtext', name: 'Subtext', icon: '🫥',
        goal: 'What each character wants from the exchange and what they will not say out loud.',
        ask: ['What does each one want from the other?', 'What is the thing nobody says?'] },
      { key: 'lines', name: 'Lines', icon: '💬',
        goal: 'Draft the exchange. Short lines. Let them interrupt and dodge.',
        ask: ['Who speaks first, and why them?', 'Where does someone lie?'] },
      { key: 'polish', name: 'Polish', icon: '✨',
        goal: 'Cut every line that explains. Write the output card: exchange, characters, intent per line.',
        ask: [] },
    ],
  },
};

export const PERSONALITIES = {
  director:    { key: 'director',    emoji: '🎩', name: 'The Director',     vibe: 'Decisive, pushes for clarity',   goodFor: 'Pitch and scene sessions',
    prompt: 'You are decisive. Short sentences. You cut options down, name the strongest one, and ask for a decision. You never say "maybe".' },
  trickster:   { key: 'trickster',   emoji: '🃏', name: 'The Trickster',    vibe: 'Chaotic, throws wildcards',       goodFor: 'When the team is stuck',
    prompt: 'You are chaotic and playful. You invert, exaggerate, and smuggle in one absurd option every turn. You love the worst idea in the room because it hides the best one.' },
  doctor:      { key: 'doctor',      emoji: '🧠', name: 'The Script Doctor', vibe: 'Analytical, asks "why?"',        goodFor: 'Character and structure',
    prompt: 'You are analytical and calm. You ask "why?" and "what does that cost?". You spot the missing turn and the unearned ending. You name structure plainly.' },
  coach:       { key: 'coach',       emoji: '🎭', name: 'The Drama Coach',   vibe: 'Emotional, character-focused',   goodFor: 'Character and dialogue',
    prompt: 'You are warm and emotional. You always ask what the character feels and wants, and what they are hiding. You care about voice and subtext more than plot.' },
  // The Cheerleader is retired as a personality: yes-and is the floor for every voice in a first stage (BOT.md §4).
  custom:      { key: 'custom',      emoji: '✏️', name: 'Custom',            vibe: 'Team describes it in a line',    goodFor: 'Anything',
    prompt: '' },
};

// target 'card': called from a specific card; results become its children. target 'session': called from the composer.
export const MINI_ROUNDS = {
  flip:     { key: 'flip',     emoji: '🔄', name: 'Flip it',    target: 'card',    rule: 'Take this card and invert its core assumption (hero → villain, win → lose, inside → outside). Each flipped version is a child card.' },
  yesand:   { key: 'yesand',   emoji: '➕', name: 'Yes, and…',  target: 'card',    rule: 'Take this card and add one concrete thing to it. No criticism this round. Each addition is a child card.' },
  worst:    { key: 'worst',    emoji: '💀', name: 'Worst idea', target: 'card',    rule: 'Ask for the worst possible version of this card. Then find the one true thing hiding in it. Both become child cards.' },
  wildcard: { key: 'wildcard', emoji: '🎲', name: 'Wildcard',   target: 'session', rule: 'Throw in one unrelated element (an object, a place, a genre) and ask how the story absorbs it.' },
};

export const REACTIONS = ['👍', '🔥', '❌'];
