#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/hashicorp/agent-skills.git"
DEFAULT_REF="main"
REF="${1:-$DEFAULT_REF}"

SKILLS=(
  "terraform/code-generation/skills/terraform-style-guide"
  "terraform/code-generation/skills/terraform-test"
  "terraform/code-generation/skills/terraform-search-import"
  "terraform/module-generation/skills/refactor-module"
  "terraform/module-generation/skills/terraform-stacks"
)

cd "$(git rev-parse --show-toplevel)"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Cloning $REPO_URL at ref '$REF'..."
git clone "$REPO_URL" "$tmp_dir/repo" >/dev/null 2>&1
git -C "$tmp_dir/repo" checkout "$REF" >/dev/null 2>&1

commit_sha="$(git -C "$tmp_dir/repo" rev-parse HEAD)"
vendored_on="$(date +%F)"

mkdir -p .claude/skills

for skill in "${SKILLS[@]}"; do
  skill_name="$(basename "$skill")"
  source_dir="$tmp_dir/repo/$skill"
  target_dir=".claude/skills/$skill_name"

  if [ ! -d "$source_dir" ]; then
    echo "Missing upstream skill path: $skill" >&2
    exit 1
  fi

  rm -rf "$target_dir"
  cp -R "$source_dir" "$target_dir"

  cat > "$target_dir/VENDORED_FROM.md" <<EOF
Upstream repository: $REPO_URL
Upstream path: $skill
Pinned commit: $commit_sha
Vendored on: $vendored_on
Local modifications: none to upstream skill content; this file is repo-local metadata.
EOF

  echo "Updated $skill_name"
done

echo
echo "Vendored commit: $commit_sha"
echo "Updated skills:"
printf '  - %s\n' "${SKILLS[@]}"
echo
echo "Review with:"
echo "  git diff -- .claude/skills .copilot/context.md scripts/update-vendored-hashicorp-skills.sh"
