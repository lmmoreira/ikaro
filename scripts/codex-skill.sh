#!/usr/bin/env bash

set -euo pipefail

CLAUDE_COMMANDS_DIR=".claude/commands"
CLAUDE_SKILLS_DIR=".claude/skills"
CODEX_DIR=".agents/skills"

if [[ ! -d "$CLAUDE_COMMANDS_DIR" && ! -d "$CLAUDE_SKILLS_DIR" ]]; then
  echo "No Claude commands or skills directory found. Nothing to do."
  exit 0
fi

mkdir -p "$CODEX_DIR"

for file in "$CLAUDE_COMMANDS_DIR"/*.md; do
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
  echo "✓ Synced command skill $name"
done

for skill_dir in "$CLAUDE_SKILLS_DIR"/*; do
  [[ -d "$skill_dir" ]] || continue

  name=$(basename "$skill_dir")
  target_dir="$CODEX_DIR/$name"

  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  cp -R "$skill_dir"/. "$target_dir"/

  echo "✓ Synced vendored skill $name"
done

echo "Done."
