# π production system · Brainstorming demo

A testable build of Section 1 of Abdallah's production-system spec: live, bot-run brainstorm
sessions that turn messy ideas into promoted cards. Zero dependencies, one JSON file, local only.

The bot has no API key: a **second Claude Code terminal** plays it.

## Run

Terminal 1 — the app:

```bash
npm start
```

→ http://localhost:3142 . Open it in two browser windows with two names to be a team of two.

Terminal 2 — the bot:

```bash
npm run bot
```

That opens a Claude Code session in this folder with `BOT.md` as its playbook. It loops
`node bot/wait.mjs` → think → `node bot/say.mjs` forever. If it ever stops and asks, type `continue`.
The first time, it may ask permission to run the two scripts — allow always.

Reset everything: `npm run reset` (restarts the server with an empty state).

## What's in the demo

- Home: new session (type, topic, optional **paste what you already have**), sessions list, promoted cards grouped by target (the Story Bible stub), intentional exceptions log, bot status.
- Lobby: join, pick the bot personality (4 + custom), start.
- Play: shared chat in **rounds** — the bot asks, everyone answers once (blind in first stages: answers hidden until all are in), the bot replies once to the set; "go without them" if someone stalls. Quick-pick buttons, stage progress bar (anyone advances, ⏪ always available), mini-rounds (🔄 ➕ 🎲 💀), personality switch mid-session, idea cards with 👍🔥❌ and credit, ⭐ candidate / park / discard, add your own card.
- Promotion: call the vote → ⚖️ Continuity Judge (✅ / ⚠️ dismissable + logged / ❌ blocks) → vote if 2+ → tie → bot Q&A tiebreak → majority approval → promoted; others parked as alternates.
- Wrap: bot recap, session goes read-only, cards stay usable.

Not built (by design, for now): session timer, Story Bible chapters (promoted cards are listed by target only), canon amendments by vote, projects beyond the one demo project, auth.

## Files

```
server.mjs          API + SSE + static, all state in data/state.json
lib/templates.mjs   the 5 brainstorm types, 6 personalities, 4 mini-rounds (data)
public/             index.html, app.js, style.css — vanilla
bot/wait.mjs        long-poll: next events + full context as JSON
bot/say.mjs         post one bot reply (JSON via heredoc)
bot/run.sh          launches the Claude Code bot terminal
BOT.md              the bot's playbook
```

Drive the bot by hand for debugging: `node bot/wait.mjs` then `node bot/say.mjs '{"text":"hi"}'`.
