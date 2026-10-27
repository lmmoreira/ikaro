#!/usr/bin/env bash
# Per-story infrastructure for a local Playwright run. `pnpm infra:e2e` starts it from nothing,
# `pnpm infra:e2e:down` destroys it, containers, network and the database volume.
#
# It runs only from a git worktree (.claude/worktrees/<name>): the stack lives and dies with the
# story, and `down -v` deletes the compose volume, which is the shared dev database. The compose
# file binds ./init-db.sh by absolute path into the Postgres container, so the stack must also be
# torn down before the worktree is removed or the container can no longer start
# (docs/TESTING_STRATEGY.md § Running Playwright locally).
set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

case "$ROOT" in
  */.claude/worktrees/*) ;;
  *)
    echo "infra:e2e runs only from a git worktree under .claude/worktrees/ (it deletes the dev database volume)." >&2
    echo "Current checkout: $ROOT" >&2
    exit 1
    ;;
esac

compose() {
  docker compose -f "$ROOT/docker/docker-compose.yml" "$@"
}

case "$MODE" in
  up)
    compose down -v --remove-orphans
    cd "$ROOT"
    pnpm infra:up
    pnpm db:migrate
    pnpm db:seed
    ;;
  down)
    compose down -v --remove-orphans
    ;;
  *)
    echo "usage: infra-e2e.sh up|down (use pnpm infra:e2e or pnpm infra:e2e:down)" >&2
    exit 2
    ;;
esac
