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
# Also always queries SonarCloud's live issues API directly (independent of
# whatever `gh pr checks` shows for Sonar this round) and prints any open
# issues. This repo's Sonar analysis job is dependency-gated behind the other
# test jobs in the same workflow — if an unrelated job fails, Sonar gets
# skipped for that commit rather than re-run, so a real, still-open issue can
# sit unflagged in `gh pr checks` for round after round until some round
# happens to have every gating job green. The live issues API is keyed by PR
# number, not by commit, so it stays accurate regardless (M20-S08 PR #429
# precedent, 2026-08-26: two Sonar issues from the first commit went
# unflagged for 3 rounds this way).
#
# Exit code reflects CI only (0 = all CI checks passed, 1 = at least one
# failed) — Codex/CodeRabbit/Sonar findings are information for the caller to
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
SONAR_PROJECT="lmmoreira_ikaro"
SONAR_ORG="lmmoreira"
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
      # The exact preamble wording isn't a stable contract — observed drifting between rounds
      # (backticks added around /pr-review, "4-agent" -> "4-perspective") on the same PR in the
      # same session, which silently hung a literal-substring match forever. Tolerate an optional
      # backtick around /pr-review instead of requiring it verbatim either way.
      CODEX_URL=$(printf '%s' "$COMMENTS_JSON" | jq -r --arg since "$SINCE" '
        [.comments[] | select(.createdAt >= $since) | select(.body | test("Automated review via `?/pr-review`? — Codex"))]
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

# Always checked, every call — not gated on a Sonar check-run appearing in
# $CI_OUTPUT this round (see the header comment on why that can't be trusted
# alone). Server-side status filters are unreliable when scoped to a pull
# request — a CLOSED/FIXED issue can still come back regardless of the filter
# combination (confirmed live against PR #356, 2026-08-11; same root cause as
# this repo's own "Fail on any new SonarCloud issue" CI step). Fetch
# unfiltered and filter client-side on issueStatus, the authoritative
# current-state field.
SONAR_RESULT=$(curl -sf "https://sonarcloud.io/api/issues/search?componentKeys=${SONAR_PROJECT}&pullRequest=${PR_NUMBER}&ps=50&organization=${SONAR_ORG}" 2>/dev/null || echo '{"issues":[]}')
SONAR_OPEN=$(printf '%s' "$SONAR_RESULT" | jq '[.issues[]? | select(.issueStatus == "OPEN" or .issueStatus == "CONFIRMED")]' 2>/dev/null || echo '[]')
SONAR_COUNT=$(printf '%s' "$SONAR_OPEN" | jq 'length' 2>/dev/null || echo 0)

if [ "$SONAR_COUNT" -gt 0 ] 2>/dev/null; then
  echo "❌ ${SONAR_COUNT} open SonarCloud issue(s) on PR #${PR_NUMBER}:"
  printf '%s' "$SONAR_OPEN" | jq -r '.[] | "  [\(.severity)] \(.rule): \(.message) — \(.component | split(":")[1]):\(.line // "?")"'
else
  echo "✅ No open SonarCloud issues on PR #${PR_NUMBER}."
fi

[ "$CI_FAILED" -eq 0 ]
