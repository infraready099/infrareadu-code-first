#!/bin/bash
# Fires automatically when a Claude Code session starts
MEMORY_DIR="$HOME/.claude/projects/-Users-krunalp-claud-code/memory"
LOG="$MEMORY_DIR/session-log.md"
PENDING="$MEMORY_DIR/pending-tasks.md"

# Log session start
echo "" >> "$LOG"
echo "---" >> "$LOG"
echo "## SESSION STARTED: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

# Remind Claude to check pending tasks by printing to stdout (shown in context)
echo "=== SESSION START REMINDER ==="
echo "Read pending-tasks.md before doing anything:"
echo ""
cat "$PENDING" 2>/dev/null | head -40
echo "=== END REMINDER ==="
