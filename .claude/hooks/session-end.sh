#!/bin/bash
# Fires automatically when a Claude Code session ends
MEMORY_DIR="$HOME/.claude/projects/-Users-krunalp-claud-code/memory"
LOG="$MEMORY_DIR/session-log.md"

echo "" >> "$LOG"
echo "## SESSION ENDED: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
echo "---" >> "$LOG"

# Hindsight Layer 4: retain session summary as behavioral memory (silent fail if not running)
SESSION_SUMMARY=$(tail -30 "$LOG" 2>/dev/null | head -25)
if [ -n "$SESSION_SUMMARY" ]; then
  curl -s --max-time 5 \
    -X POST "http://localhost:8888/v1/default/banks/claude-sessions/retain" \
    -H "Content-Type: application/json" \
    -d "{\"content\": $(echo "$SESSION_SUMMARY" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""'), \"metadata\": {\"project\": \"infraready\", \"date\": \"$(date +%Y-%m-%d)\"}}" \
    2>/dev/null &
fi
