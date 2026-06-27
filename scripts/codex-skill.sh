#!/usr/bin/env bash

set -euo pipefail

CLAUDE_DIR=".claude/commands"
CODEX_DIR=".codex/skills"

if [[ ! -d "$CLAUDE_DIR" ]]; then
  echo "No Claude commands directory found at '$CLAUDE_DIR'. Nothing to do."
  exit 0
fi

mkdir -p "$CODEX_DIR"

for file in "$CLAUDE_DIR"/*.md; do
  [[ -e "$file" ]] || continue

  name=$(basename "$file" .md)
  target="$(pwd)/$file"
  skill_dir="$CODEX_DIR/$name"
  skill_file="$skill_dir/SKILL.md"

  mkdir -p "$skill_dir"

  if [[ -L "$skill_file" ]] && [[ "$(readlink "$skill_file")" == "$target" ]]; then
    echo "✓ $name already linked"
    continue
  fi

  ln -snf "$target" "$skill_file"
  echo "✓ Linked $name"
done

echo "Done."