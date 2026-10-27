#!/usr/bin/env bash
# WorktreeCreate hook, registered in .claude/settings.json. It replaces Claude Code's default git
# worktree creation, so the worktree it returns is ready to work in: branched from origin/main,
# with the gitignored env files copied from the main checkout, full history and dependencies
# installed.
#
# Contract (https://code.claude.com/docs/en/hooks#worktreecreate): the worktree name arrives as
# JSON on stdin ({"name": "..."}); the LAST stdout line must be the absolute worktree path; a
# non-zero exit fails the creation. Everything else is printed to stderr.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
INPUT=$(cat)

fail() {
  echo "WorktreeCreate: $*" >&2
  exit 1
}

NAME=$(echo "$INPUT" | jq -r '.name // empty')
[ -n "$NAME" ] || fail "missing name in hook input"

command -v pnpm >/dev/null 2>&1 || fail "pnpm not found on PATH"

# Replace any '/' in the name with '-' so the worktree always lands directly
# under .claude/worktrees/ (EnterWorktree rejects nested paths). The branch keeps the
# name as given, so a name like feat/td50-s02-x creates exactly that branch.
DIR_NAME="${NAME//\//-}"
WPATH="$REPO/.claude/worktrees/$DIR_NAME"

[ ! -d "$WPATH" ] || fail "worktree already exists at $WPATH"

git -C "$REPO" fetch origin main --quiet >&2

git -C "$REPO" worktree add "$WPATH" -b "$NAME" "origin/main" >&2 \
  || fail "git worktree add failed"

# A worktree that is not fully prepared is removed again, so a failed creation leaves neither a
# directory nor a branch behind to collide with the next attempt.
READY=0
cleanup() {
  if [ "$READY" != 1 ]; then
    git -C "$REPO" worktree remove --force "$WPATH" >/dev/null 2>&1 || true
    git -C "$REPO" branch -D "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Gitignored files a worktree never gets from git.
for rel in apps/backend/.env apps/bff/.env apps/web/.env.local apps/web/.env.playwright.local; do
  if [ -f "$REPO/$rel" ]; then
    cp "$REPO/$rel" "$WPATH/$rel" || fail "failed to copy $rel"
    echo "WorktreeCreate: copied $rel" >&2
  else
    echo "WorktreeCreate: $rel not found in the main checkout, not copied" >&2
  fi
done

# A shallow clone fakes divergence from main and breaks `git merge origin/main`.
if [ "$(git -C "$WPATH" rev-parse --is-shallow-repository)" = "true" ]; then
  git -C "$WPATH" fetch --unshallow origin >&2 || fail "git fetch --unshallow failed"
fi

# The workspace postinstall also builds the shared packages, so type-checks work straight away.
(cd "$WPATH" && pnpm install --frozen-lockfile) >&2 || fail "pnpm install failed"

READY=1
echo "$WPATH"
