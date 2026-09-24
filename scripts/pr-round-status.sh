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
# CI counts as finished only when the aggregate gate row ("All Checks Passed", override with
# GATE_NAME) exists and is terminal — jobs gated by `needs:` (SonarCloud analysis, the gate
# itself) are created lazily, so "nothing pending" alone can be true too early. If the PR's
# workflow never produces that row, the check list is accepted once it has stopped changing for
# STABLE_POLLS polls (default 6) and a warning is printed. POLL_INTERVAL (default 30s),
# STABLE_POLLS and GATE_NAME can be overridden through the environment (used by the spec).
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
POLL_INTERVAL="${POLL_INTERVAL:-30}"
# Workflow jobs are created lazily: a job gated by `needs:` (the SonarCloud analysis, then the
# final aggregate gate) has no row in `gh pr checks` at all until its predecessors finish, so
# "no row is pending" can be true while jobs are still to come (M22-S04, PR #491, 2026-09-19:
# 26 rows, none pending -> reported clean; the list later grew to 36 and SonarCloud Analysis
# failed). CI is only done once the aggregate gate row exists and is terminal.
GATE_NAME="${GATE_NAME:-All Checks Passed}"
# Fallback for a PR whose workflow never produces the gate row: accept the check list as final
# once it has stopped growing (and nothing is pending) for this many consecutive polls.
STABLE_POLLS="${STABLE_POLLS:-6}"

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

# Re-verify every "pending" row against the underlying Actions Job API before trusting
# it — `gh pr checks`' aggregate rollup has been observed to print "pending" for tens of
# seconds after the job's own record already carries a terminal conclusion (confirmed
# live, PR #482, 2026-09-16: job 104616413571 showed conclusion:"success" while the
# rollup still printed "pending", stalling this script's loop well past the point where
# `gh pr view --json mergeStateStatus` already read CLEAN). Only rows whose URL points at
# a recognizable Actions job get this treatment; a check with no job URL (a Terraform
# Cloud run, SonarCloud's own dashboard link, etc.) has no equivalent direct endpoint and
# is trusted as-is. Applied once per poll, reused for both the loop's exit condition and
# the final summary, so the two never disagree about the same stale row.
correct_ci_output() {
  local raw="$1"
  local corrected=""
  local name bucket elapsed url job_id conclusion
  while IFS=$'\t' read -r name bucket elapsed url; do
    [ -z "$name" ] && continue
    if [ "$bucket" = "pending" ]; then
      job_id=$(printf '%s' "$url" | grep -oE '/job/[0-9]+$' | grep -oE '[0-9]+' || true)
      if [ -n "$job_id" ]; then
        conclusion=$(gh api "repos/${REPO}/actions/jobs/${job_id}" --jq '.conclusion // empty' 2>/dev/null || true)
        if [ -n "$conclusion" ]; then
          if [ "$conclusion" = "success" ] || [ "$conclusion" = "neutral" ] || [ "$conclusion" = "skipped" ]; then
            bucket="pass"
          else
            bucket="fail"
          fi
        fi
      fi
    fi
    corrected="${corrected}${name}"$'\t'"${bucket}"$'\t'"${elapsed}"$'\t'"${url}"$'\n'
  done <<< "$raw"
  printf '%s' "$corrected"
}

PREV_CI_TOTAL=-1
STABLE_COUNT=0

while true; do
  CI_OUTPUT_RAW=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1 || true)
  CI_OUTPUT=$(correct_ci_output "$CI_OUTPUT_RAW")
  CI_PENDING=$(printf '%s\n' "$CI_OUTPUT" | grep -c $'\tpending\t' || true)
  CI_ROWS=$(printf '%s\n' "$CI_OUTPUT" | grep -c . || true)
  if [ "$CI_PENDING" -eq 0 ] && [ "$CI_ROWS" -eq "$PREV_CI_TOTAL" ]; then
    STABLE_COUNT=$((STABLE_COUNT + 1))
  else
    STABLE_COUNT=0
  fi
  PREV_CI_TOTAL="$CI_ROWS"
  GATE_TERMINAL=0
  printf '%s\n' "$CI_OUTPUT" | awk -F'\t' -v gate="$GATE_NAME" '$1==gate && $2!="pending"{found=1} END{exit !found}' && GATE_TERMINAL=1

  CODEX_URL=""
  CODERABBIT_URL=""
  CODERABBIT_STATUS_DESC=""
  if [ "$WAIT_CODEX" -eq 1 ] || [ "$WAIT_CODERABBIT" -eq 1 ]; then
    COMMENTS_JSON=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json comments 2>/dev/null || echo '{"comments":[]}')
  fi

  if [ "$WAIT_CODEX" -eq 1 ]; then
    # The exact preamble wording isn't a stable contract — observed drifting between rounds
    # (backticks added around /pr-review, "4-agent" -> "4-perspective") on the same PR in the
    # same session, which silently hung a literal-substring match forever. Confirmed again on
    # PR #510, 2026-09-24: round 1 dropped the leading emoji and used a plain hyphen instead of
    # the em dash ("Automated review via /pr-review - Codex") while round 2 of the same PR/
    # session reverted to the canonical "🤖 ... — Codex" wording — sampled against 19 other
    # recent PRs (#450 onward), every one used the canonical wording, so this is occasional
    # per-invocation variance, not a lasting format change. A `.*` between /pr-review and Codex
    # tolerates the connector (hyphen, em dash, backticks) and an optional emoji prefix without
    # needing to enumerate each variant by hand.
    CODEX_URL=$(printf '%s' "$COMMENTS_JSON" | jq -r --arg since "$SINCE" '
      [.comments[] | select(.createdAt >= $since) | select(.body | test("Automated review via `?/pr-review`?.*Codex"))]
      | sort_by(.createdAt) | last | .url // empty')
  fi

  if [ "$WAIT_CODERABBIT" -eq 1 ]; then
    # CodeRabbit's actual findings-bearing review is a PR *review* object (state: COMMENTED),
    # never a plain issue comment — gh pr view --json comments structurally cannot see it, only
    # CodeRabbit's own bookkeeping issue-comments (the walkthrough-stack summary and the "review
    # command invocation received" ack, both posted within seconds of the @coderabbitai review
    # trigger, well before the real review lands minutes later). Querying --json comments here
    # silently hung this script forever on PR #433 (2026-08-26) even after the real review had
    # already posted, because it was checking the wrong API surface entirely — not a timing
    # issue, a structural one. The REST reviews endpoint is the correct surface for a real
    # review: it has both a numeric id and a ready-made html_url (unlike `gh pr view --json
    # reviews`, whose .id is a GraphQL node id like "PRR_kwDO..." that does not match GitHub's
    # numeric #pullrequestreview-<id> anchor — round-2 finding, PR #433).
    # The REST API's user.login is "coderabbitai[bot]" (the raw GitHub App slug), not the
    # "coderabbitai" GraphQL normalizes it to elsewhere in this script — verified live against
    # PR #433's actual review payload; a bare-string match against "coderabbitai" here silently
    # never matches anything (round-2 finding, PR #433: this exact mismatch was caught only by
    # testing the fix's own jq filter against real data before trusting it).
    # --paginate: this endpoint defaults to 30 results/page (max 100) — without it, a PR that
    # accumulates more than 30 reviews would silently drop the newest one off the first page and
    # this script could wait forever despite a real review already existing (round-6 finding, PR
    # #433). gh api --paginate concatenates array-shaped pages into one combined array, so the jq
    # filter below needs no change.
    REVIEWS_JSON=$(gh api --paginate "repos/${REPO}/pulls/${PR_NUMBER}/reviews" 2>/dev/null || echo '[]')
    CODERABBIT_URL=$(printf '%s' "$REVIEWS_JSON" | jq -r --arg since "$SINCE" '
      [.[] | select(.submitted_at >= $since) | select(.user.login == "coderabbitai[bot]")]
      | sort_by(.submitted_at) | last | .html_url // empty')

    # Fallback: a rate-limited CodeRabbit run posts only a plain issue comment, never a review
    # (the script's own contract above promises this counts as terminal too — round-2 finding,
    # PR #433: fixing the review-detection path above accidentally dropped this case entirely).
    # Exclude the two always-posted bookkeeping acks (the walkthrough-stack summary and the
    # "review command received" reply, both fired within seconds of the trigger, identified by
    # their own literal auto-generated-comment markers) so a genuine rate-limit notice — or
    # anything else CodeRabbit might post as a plain comment — is the only thing that satisfies
    # this fallback.
    if [ -z "$CODERABBIT_URL" ]; then
      CODERABBIT_URL=$(printf '%s' "$COMMENTS_JSON" | jq -r --arg since "$SINCE" '
        [.comments[] | select(.createdAt >= $since) | select(.author.login == "coderabbitai")
         | select(.body | test("auto-generated comment: summarize by coderabbit\\.ai") | not)
         | select(.body | test("auto-generated reply by CodeRabbit") | not)]
        | sort_by(.createdAt) | last | .url // empty')
    fi

    # Second fallback: some rate-limited runs post *no* distinguishing plain comment at all —
    # both of CodeRabbit's own comments are the two bookkeeping acks the block above deliberately
    # excludes, so CODERABBIT_URL stays empty forever even though CodeRabbit genuinely finished
    # (PR #435, 2026-08-27: confirmed live — zero qualifying comments/reviews, yet `gh pr checks`
    # already showed a terminal `CodeRabbit  pass  ...  Review rate limited` row). That line comes
    # from a legacy commit Status, not a Checks-API check-run — `gh pr view --json
    # statusCheckRollup`'s StatusContext type drops the description field entirely (verified live:
    # only context/state/startedAt/targetUrl come back), so the real source is the REST commit
    # statuses endpoint below, keyed by the PR's own head SHA. Any terminal (non-pending) status
    # entry for the "CodeRabbit" context counts — its description is only for the human-readable
    # summary at the bottom, not part of the terminal-state decision itself.
    if [ -z "$CODERABBIT_URL" ]; then
      HEAD_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq '.headRefOid' 2>/dev/null || true)
      if [ -n "$HEAD_SHA" ]; then
        CODERABBIT_STATUS_DESC=$(gh api "repos/${REPO}/commits/${HEAD_SHA}/status" 2>/dev/null | jq -r '
          [.statuses[]? | select(.context == "CodeRabbit") | select(.state != "pending")]
          | sort_by(.updated_at) | last | .description // empty')
      fi
    fi
  fi

  ALL_DONE=1
  [ "$CI_PENDING" -eq 0 ] || ALL_DONE=0
  # No pending row is not enough — wait for the aggregate gate (or a stable check list).
  if [ "$CI_PENDING" -eq 0 ] && [ "$GATE_TERMINAL" -eq 0 ] && [ "$STABLE_COUNT" -lt "$STABLE_POLLS" ]; then
    ALL_DONE=0
  fi
  [ "$WAIT_CODEX" -eq 0 ] || [ -n "$CODEX_URL" ] || ALL_DONE=0
  [ "$WAIT_CODERABBIT" -eq 0 ] || [ -n "$CODERABBIT_URL" ] || [ -n "$CODERABBIT_STATUS_DESC" ] || ALL_DONE=0

  [ "$ALL_DONE" -eq 1 ] && break
  sleep "$POLL_INTERVAL"
done

if [ "$GATE_TERMINAL" -eq 0 ]; then
  echo "⚠️  No '${GATE_NAME}' row appeared; treated the check list as final after ${STABLE_POLLS} unchanged polls — re-run this script once more before trusting it." >&2
fi

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
  if [ -n "$CODERABBIT_URL" ]; then
    echo "CodeRabbit: ${CODERABBIT_URL}"
  elif [ -n "$CODERABBIT_STATUS_DESC" ]; then
    echo "CodeRabbit: ${CODERABBIT_STATUS_DESC} (no review/comment posted — confirmed via the commit status API)"
  else
    echo "CodeRabbit: (no response detected)"
  fi
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
