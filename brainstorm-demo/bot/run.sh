#!/bin/bash
# Starts a Claude Code session that plays the brainstorm bot.
# Run this in its own terminal while the server (npm start) is up.
cd "$(dirname "$0")/.." || exit 1
exec claude "You are the brainstorm bot for the π production system demo. Read BOT.md in this folder, then run the loop it describes, starting now with: node bot/wait.mjs — and keep looping until I say stop."
