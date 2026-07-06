#!/usr/bin/env bash

set -euo pipefail

CLAUDE_DIR=".claude/commands"
CODEX_DIR=".agents/skills"

if [[ ! -d "$CLAUDE_DIR" ]]; then
  echo "No Claude commands directory found at '$CLAUDE_DIR'. Nothing to do."
  exit 0
fi

mkdir -p "$CODEX_DIR"

for file in "$CLAUDE_DIR"/*.md; do
  [[ -e "$file" ]] || continue

  name=$(basename "$file" .md)
  skill_dir="$CODEX_DIR/$name"
  skill_file="$skill_dir/SKILL.md"

  mkdir -p "$skill_dir"

  # Replace any existing skill file or symlink with a real copy.
  if [[ -e "$skill_file" || -L "$skill_file" ]]; then
    rm -f "$skill_file"
  fi

  cp "$file" "$skill_file"
  echo "✓ Copied $name"
done

echo "Done."
