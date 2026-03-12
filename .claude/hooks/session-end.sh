#!/bin/bash
# Fires automatically when a Claude Code session ends
MEMORY_DIR="$HOME/.claude/projects/-Users-krunalp-claud-code/memory"
LOG="$MEMORY_DIR/session-log.md"

echo "" >> "$LOG"
echo "## SESSION ENDED: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
echo "---" >> "$LOG"
