#!/usr/bin/env bash
# scripts/wait-ci.sh
# Poll GitHub CI checks for the current branch's open PR.
# Waits 60 s for checks to queue, then polls every 30 s until all complete.
#
# Usage (terminal):       bash scripts/wait-ci.sh
# Usage (inside Claude):  ! bash scripts/wait-ci.sh

set -uo pipefail

REPO="lmmoreira/ikaro"
INITIAL_WAIT=60
POLL_INTERVAL=30

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  echo "❌ Not on a named branch — cannot detect PR."
  exit 1
fi

PR_NUMBER=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
if [ -z "$PR_NUMBER" ]; then
  echo "❌ No open PR found for branch '$BRANCH'."
  exit 1
fi

# Skip the initial wait if checks are already running
EARLY=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1 || true)
if echo "$EARLY" | grep -qE 'pending|pass|fail'; then
  echo "⏳ PR #${PR_NUMBER} — checks already queued, polling now..."
else
  echo "⏳ PR #${PR_NUMBER} on '${BRANCH}' — waiting ${INITIAL_WAIT}s for CI to queue..."
  sleep "$INITIAL_WAIT"
fi

while true; do
  OUTPUT=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1)
  if echo "$OUTPUT" | grep -q 'pending'; then
    sleep "$POLL_INTERVAL"
    continue
  fi
  break
done

PASSED=$(echo "$OUTPUT" | grep -c $'\tpass\t' || true)
FAILED=$(echo "$OUTPUT" | grep -c $'\tfail\t' || true)
TOTAL=$(( PASSED + FAILED ))

if [ "$FAILED" -eq 0 ]; then
  echo "✅ All ${PASSED} CI checks passed on PR #${PR_NUMBER}."
  exit 0
else
  FAILED_NAMES=$(echo "$OUTPUT" | awk -F'\t' '$2=="fail"{printf "%s, ",$1}' | sed 's/, $//')
  echo "❌ ${FAILED} of ${TOTAL} CI checks failed on PR #${PR_NUMBER} — please verify: ${FAILED_NAMES}"
  exit 1
fi
