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

# ---------------------------------------------------------------------------
# Layer 3: Git context — inject live codebase state before Claude reads a word
# Works for any git repo; silently skips if not in one.
# ---------------------------------------------------------------------------
GIT_ROOT=$(git -C "$HOME/ai-agent-orchestrator" rev-parse --show-toplevel 2>/dev/null)
if [ -n "$GIT_ROOT" ]; then
  echo ""
  echo "=== GIT CONTEXT ($(basename "$GIT_ROOT")) ==="
  echo "Branch : $(git -C "$GIT_ROOT" branch --show-current 2>/dev/null)"
  echo ""
  echo "Last 5 commits:"
  git -C "$GIT_ROOT" log --oneline -5 2>/dev/null | sed 's/^/  /'
  echo ""
  MODIFIED=$(git -C "$GIT_ROOT" status --short 2>/dev/null)
  if [ -n "$MODIFIED" ]; then
    echo "Modified files:"
    echo "$MODIFIED" | head -20 | sed 's/^/  /'
  else
    echo "Working tree: clean"
  fi
  echo "=== END GIT CONTEXT ==="
fi

# Hindsight Layer 4: recall relevant memories for this project (silent fail if not running)
HINDSIGHT_RECALL=$(curl -s --max-time 3 \
  -X POST "http://localhost:8888/v1/default/banks/claude-sessions/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"InfraReady infrastructure deployment mistakes lessons","top_k":5}' 2>/dev/null)
if [ -n "$HINDSIGHT_RECALL" ] && echo "$HINDSIGHT_RECALL" | grep -q '"results"'; then
  echo ""
  echo "=== HINDSIGHT MEMORIES ==="
  echo "$HINDSIGHT_RECALL" | python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  results = data.get('results', [])
  for r in results[:5]:
    print('- ' + r.get('content', '')[:200])
except:
  pass
" 2>/dev/null
  echo "=== END HINDSIGHT ==="
fi
