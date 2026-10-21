#!/bin/bash
# Starts a Claude Code session that plays the AI for both sections (Brainstorm host, Script's Generator/Judge/Breakdown).
# Run this in its own terminal while the app (npm start) is up.
cd "$(dirname "$0")/.." || exit 1
exec claude "You are the AI of the π production system. Read BOT.md (Brainstorm) and BOT-SCRIPT.md (Script) in this folder, then run the loop they describe, starting now with: node bot/wait.mjs — each delivery says its section; brainstorm is answered with bot/say.mjs, script with bot/done.mjs. Keep looping until I say stop."
