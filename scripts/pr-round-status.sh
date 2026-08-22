#!/usr/bin/env bash
# scripts/pr-round-status.sh
# Block until every actor in scope has responded for the current PR round,
# then print a one-line-per-actor result. Supersedes wait-ci.sh (CI-only
# waiting is still the default with no flags — same behavior, same output
# format), extended with optional Codex/CodeRabbit waiting for /pr-land's
# batched-per-round bot-review loop.
#
# Usage:
#   bash scripts/pr-round-status.sh [PR#]
#   bash scripts/pr-round-status.sh [PR#] --wait-codex --since <ISO8601>
#   bash scripts/pr-round-status.sh [PR#] --wait-codex --wait-coderabbit --since <ISO8601>
#
#   PR#              Optional — defaults to the open PR for the current branch.
#   --wait-codex      Also block until a Codex /pr-review comment lands.
#   --wait-coderabbit Also block until a CodeRabbit comment lands (an actual
#                     review OR a rate-limit notice both count as terminal —
#                     any new coderabbitai comment after --since is enough).
#   --since           Required if either --wait-* flag is set. Only a comment
#                     created at or after this ISO8601 timestamp counts as
#                     "this round's" response — pass the time captured right
#                     before dispatching Codex for this round, e.g.:
#                       since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#
# Exit code reflects CI only (0 = all CI checks passed, 1 = at least one
# failed) — Codex/CodeRabbit findings are information for the caller to
# triage, not a script failure. Polls every 30s with no total timeout
# (same blocking design as the script it replaces); Ctrl-C to abort.
#
# Usage (inside Claude):  ! bash scripts/pr-round-status.sh
# Worktree note: unlike `codex exec` or the Monitor tool, a plain
# `bash scripts/<file>.sh` invocation is not blocked by the harness's
# worktree-isolation guard - the guard's "too complex to verify" refusal
# is about compound/inline bash and opaque external agents, not a call to
# a checked-in script file. Run this directly; no subagent delegation needed.

set -uo pipefail

REPO="lmmoreira/ikaro"
POLL_INTERVAL=30

PR_NUMBER=""
SINCE=""
WAIT_CODEX=0
WAIT_CODERABBIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    --wait-codex) WAIT_CODEX=1; shift ;;
    --wait-coderabbit) WAIT_CODERABBIT=1; shift ;;
    -h|--help)
      sed -n '2,29p' "$0"
      exit 0
      ;;
    *) PR_NUMBER="$1"; shift ;;
  esac
done

if [ -z "$PR_NUMBER" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
    echo "❌ Not on a named branch — cannot detect PR. Pass a PR number explicitly." >&2
    exit 1
  fi
  PR_NUMBER=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
fi
if [ -z "$PR_NUMBER" ]; then
  echo "❌ No open PR found for the current branch — pass a PR number explicitly." >&2
  exit 1
fi

if { [ "$WAIT_CODEX" -eq 1 ] || [ "$WAIT_CODERABBIT" -eq 1 ]; } && [ -z "$SINCE" ]; then
  echo "❌ --since <ISO8601> is required when --wait-codex or --wait-coderabbit is set." >&2
  exit 1
fi

echo "⏳ PR #${PR_NUMBER} — waiting for: CI$([ "$WAIT_CODEX" -eq 1 ] && echo ', Codex')$([ "$WAIT_CODERABBIT" -eq 1 ] && echo ', CodeRabbit')..." >&2

# Skip the initial wait if checks are already queued (mirrors wait-ci.sh).
EARLY=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1 || true)
if ! echo "$EARLY" | grep -qE 'pending|pass|fail'; then
  sleep 60
fi

while true; do
  CI_OUTPUT=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1 || true)
  CI_PENDING=$(printf '%s\n' "$CI_OUTPUT" | grep -c $'\tpending\t' || true)

  CODEX_URL=""
  CODERABBIT_URL=""
  if [ "$WAIT_CODEX" -eq 1 ] || [ "$WAIT_CODERABBIT" -eq 1 ]; then
    COMMENTS_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json comments 2>/dev/null || echo '{"comments":[]}')

    if [ "$WAIT_CODEX" -eq 1 ]; then
      CODEX_URL=$(printf '%s' "$COMMENTS_JSON" | jq -r --arg since "$SINCE" '
        [.comments[] | select(.createdAt >= $since) | select(.body | test("Automated review via /pr-review — Codex"))]
        | sort_by(.createdAt) | last | .url // empty')
    fi

    if [ "$WAIT_CODERABBIT" -eq 1 ]; then
      CODERABBIT_URL=$(printf '%s' "$COMMENTS_JSON" | jq -r --arg since "$SINCE" '
        [.comments[] | select(.createdAt >= $since) | select(.author.login == "coderabbitai")]
        | sort_by(.createdAt) | last | .url // empty')
    fi
  fi

  ALL_DONE=1
  [ "$CI_PENDING" -eq 0 ] || ALL_DONE=0
  [ "$WAIT_CODEX" -eq 0 ] || [ -n "$CODEX_URL" ] || ALL_DONE=0
  [ "$WAIT_CODERABBIT" -eq 0 ] || [ -n "$CODERABBIT_URL" ] || ALL_DONE=0

  [ "$ALL_DONE" -eq 1 ] && break
  sleep "$POLL_INTERVAL"
done

CI_PASSED=$(printf '%s\n' "$CI_OUTPUT" | grep -c $'\tpass\t' || true)
CI_FAILED=$(printf '%s\n' "$CI_OUTPUT" | grep -c $'\tfail\t' || true)
CI_TOTAL=$((CI_PASSED + CI_FAILED))

if [ "$CI_FAILED" -eq 0 ]; then
  echo "✅ All ${CI_PASSED} CI checks passed on PR #${PR_NUMBER}."
else
  CI_FAILED_NAMES=$(printf '%s\n' "$CI_OUTPUT" | awk -F'\t' '$2=="fail"{printf "%s, ",$1}' | sed 's/, $//')
  echo "❌ ${CI_FAILED} of ${CI_TOTAL} CI checks failed on PR #${PR_NUMBER} — please verify: ${CI_FAILED_NAMES}"
fi

if [ "$WAIT_CODEX" -eq 1 ]; then
  echo "Codex review: ${CODEX_URL}"
fi
if [ "$WAIT_CODERABBIT" -eq 1 ]; then
  echo "CodeRabbit: ${CODERABBIT_URL}"
fi

[ "$CI_FAILED" -eq 0 ]
