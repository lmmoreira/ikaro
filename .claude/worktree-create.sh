#!/usr/bin/env bash
set -euo pipefail

REPO="/home/leonardo/Projetos/leonardo/ikaro"
INPUT=$(cat)

NAME=$(echo "$INPUT" | jq -r '.name // empty')

if [ -z "$NAME" ]; then
  echo "WorktreeCreate: missing name in hook input — input was: $INPUT" >&2
  exit 1
fi

# Replace any '/' in the name with '-' so the worktree always lands directly
# under .claude/worktrees/ (EnterWorktree rejects nested paths).
DIR_NAME="${NAME//\//-}"
WPATH="$REPO/.claude/worktrees/$DIR_NAME"

if [ -d "$WPATH" ]; then
  echo "WorktreeCreate: worktree already exists at $WPATH" >&2
  exit 1
fi

git -C "$REPO" fetch origin main --quiet

git -C "$REPO" worktree add "$WPATH" -b "$NAME" "origin/main" \
  || { echo "WorktreeCreate: git worktree add failed" >&2; exit 1; }

for app in backend bff; do
  SRC="$REPO/apps/$app/.env"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$WPATH/apps/$app/.env" \
      || { echo "WorktreeCreate: failed to copy apps/$app/.env" >&2; exit 1; }
    echo "WorktreeCreate: copied apps/$app/.env" >&2
  fi
done

SRC="$REPO/apps/web/.env.local"
if [ -f "$SRC" ]; then
  cp "$SRC" "$WPATH/apps/web/.env.local" \
    || { echo "WorktreeCreate: failed to copy apps/web/.env.local" >&2; exit 1; }
  echo "WorktreeCreate: copied apps/web/.env.local" >&2
fi

echo "$WPATH"
