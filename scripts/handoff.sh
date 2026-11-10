#!/usr/bin/env bash
# Generates docs/HANDOFF.auto.md : objective snapshot (git + tests + tree). The agent then writes docs/HANDOFF.md narrative.
set -u
OUT="docs/HANDOFF.auto.md"
{
  echo "# AUTO SNAPSHOT — $(date -Iseconds)"
  echo; echo "## Git"; git rev-parse --abbrev-ref HEAD 2>/dev/null; git log --oneline -8 2>/dev/null
  echo; echo "### Uncommitted changes"; git status --short 2>/dev/null | head -50
  echo; echo "## Tests (pnpm -r test)"
  (pnpm -s -r test 2>&1 | tail -25) || echo "tests failed or pnpm missing"
  echo; echo "## Task status"; grep -E '^\| T[0-9]+' docs/TASKS.md 2>/dev/null
  echo; echo "## Files (depth 3)"; find . -maxdepth 3 -not -path '*/node_modules*' -not -path './.git*' -type f | sort | head -120
  echo; echo "## Env keys present (names only)"; [ -f .env ] && cut -d= -f1 .env | sed 's/^/ - /' || echo " (no .env)"
} > "$OUT"
echo "wrote $OUT"
