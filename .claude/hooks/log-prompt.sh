#!/bin/bash
# Fires on every user prompt — logs what Kay asked to session-log
MEMORY_DIR="$HOME/.claude/projects/-Users-krunalp-claud-code/memory"
LOG="$MEMORY_DIR/session-log.md"

# Read JSON from stdin
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('prompt','')[:300])" 2>/dev/null)

if [ -n "$PROMPT" ]; then
  echo "  - [$(date '+%H:%M')] Kay: $PROMPT" >> "$LOG"
fi

exit 0
