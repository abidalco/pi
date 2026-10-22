// Script — static data: the Generator's voices and twists, the line types, framings, the sample script.
// The voices are Brainstorm's (the bot feels the same in both places), with prompts tuned for writing lines.
import { PERSONALITIES as BS_PERSONALITIES } from './templates.mjs';

const LINE_PROMPTS = {
  director: 'You are decisive. Short sentences. You cut to the strongest version and commit. Never "maybe".',
  trickster: 'You are playful. You invert, exaggerate, and smuggle one absurd option into every set. You love the worst idea because it hides the best one.',
  doctor: 'You are calm and analytical. You fix structure: the missing turn, the unearned beat, the line that explains too much. You cut more than you add.',
  coach: 'You are warm and emotional. You care about what the character wants and hides. Subtext over plot; you make people say less and mean more.',
};
export const PERSONALITIES = Object.fromEntries(Object.entries(BS_PERSONALITIES).map(([k, p]) => [k, { key: p.key, name: p.name, vibe: p.vibe, prompt: LINE_PROMPTS[k] ?? p.prompt }]));

// icon = a name from the client's SVG set
export const TWISTS = {
  none:     { key: 'none',     icon: '',        name: 'No twist',   rule: 'Straight help in the personality\'s voice: a few genuinely different takes on the selected lines.' },
  flip:     { key: 'flip',     icon: 'refresh', name: 'Flip it',    rule: 'Invert the core assumption of the selected lines: who wants what, who wins, what is said versus meant.' },
  yesand:   { key: 'yesand',   icon: 'plus',    name: 'Yes, and…',  rule: 'Keep the lines and add one concrete thing to each option. No criticism.' },
  wildcard: { key: 'wildcard', icon: 'dice',    name: 'Wildcard',   rule: 'Smuggle in one unrelated element (an object, a sound, the weather) that the lines must absorb.' },
  worst:    { key: 'worst',    icon: 'skull',   name: 'Worst idea', rule: 'First option: the worst possible version. Then the one true thing hiding in it, written as real options.' },
  shuffle:  { key: 'shuffle',  icon: 'shuffle', name: 'Shuffle',    rule: 'The app picks one of the four twists at random.' },
};

export const BLOCK_TYPES = {
  heading:    { key: 'heading',    name: 'Scene heading', hint: 'INT/EXT, location, time of day' },
  action:     { key: 'action',     name: 'Action',        hint: 'Description' },
  dialogue:   { key: 'dialogue',   name: 'Dialogue',      hint: 'Character + line, optional (parenthetical)' },
  transition: { key: 'transition', name: 'Transition',    hint: 'CUT TO, FADE OUT… (optional)' },
  note:       { key: 'note',       name: 'Note',          hint: 'Team-only comment, never exported' },
};

export const FRAMINGS = ['ECU', 'CU', 'MCU', 'MS', 'MWS', 'WS', 'EWS', 'OTS', 'POV', 'INSERT', 'TWO-SHOT'];

// The spec's own wireframe (1 Opening · 2 The call · 3 Rooftop · 4 Chase), written out so there is something to try things on.
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
