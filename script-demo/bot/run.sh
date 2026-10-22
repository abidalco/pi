#!/bin/bash
# Starts a Claude Code session that plays the Script section's AI (Generator, Judge, Breakdown, Pacing).
# Run this in its own terminal while the server (npm start) is up.
cd "$(dirname "$0")/.." || exit 1
exec claude "You are the AI of the π Script demo. Read BOT.md in this folder, then run the loop it describes, starting now with: node bot/wait.mjs — and keep looping until I say stop."
