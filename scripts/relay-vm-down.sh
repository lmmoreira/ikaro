#!/usr/bin/env bash
# scripts/relay-vm-down.sh
# Flips create_relay_vm to false for the given env, opens a PR. Never runs
# terraform destroy — merging the PR triggers the pipeline's apply-<env> job
# instead (infra/terraform/README.md: manual terraform apply is forbidden).
#
# Usage: bash scripts/relay-vm-down.sh <staging|prod>
# To start a new session: bash scripts/relay-vm-up.sh <staging|prod>

set -euo pipefail

REPO="lmmoreira/ikaro"
ENV="${1:-}"

if [[ "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "❌ Usage: $0 <staging|prod>" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [ -n "$(git status --short)" ]; then
  echo "❌ Working tree has uncommitted changes — commit or stash first." >&2
  exit 1
fi

# Restore whatever branch/ref the caller was on when this script exits, for
# any reason (success, early exit, error) — this script detaches HEAD to do
# its work and shouldn't leave the caller stranded there (cross-tool PR
# review finding on #203).
original_ref="$(git symbolic-ref --short -q HEAD || git rev-parse HEAD)"
trap 'git checkout "$original_ref" >/dev/null 2>&1 || true' EXIT

TFVARS="infra/terraform/envs/${ENV}/terraform.tfvars"
BRANCH="chore/relay-vm-down-${ENV}"
OTHER_BRANCH="chore/relay-vm-up-${ENV}"

git fetch origin main >/dev/null
git checkout --detach origin/main >/dev/null

if grep -q '^create_relay_vm = false' "$TFVARS"; then
  echo "✅ create_relay_vm is already false for ${ENV} — nothing to do."
  exit 0
fi

# Don't clobber a PR that's already in flight (cross-tool PR review finding
# on #203) — force-pushing over an open, unmerged PR is confusing even
# though it wouldn't lose the underlying tfvars change (same 1-line diff
# either way).
existing_pr=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number,url --jq '.[0]' 2>/dev/null || true)
if [ -n "$existing_pr" ]; then
  echo "⏳ A PR is already open for ${ENV}: $(echo "$existing_pr" | grep -o '"url":"[^"]*' | cut -d'"' -f4)"
  echo "   Merge or close it before running this again."
  exit 0
fi

# Self-cleaning: delete either branch (local + remote) once its PR has
# actually merged, so this doesn't need a separate manual cleanup step.
for old_branch in "$BRANCH" "$OTHER_BRANCH"; do
  if git show-ref --verify --quiet "refs/heads/${old_branch}"; then
    merged_pr=$(gh pr list --repo "$REPO" --head "$old_branch" --state merged --json number --jq '.[0].number' 2>/dev/null || true)
    if [ -n "$merged_pr" ]; then
      git branch -D "$old_branch" >/dev/null 2>&1 || true
      git push origin --delete "$old_branch" >/dev/null 2>&1 || true
      echo "🧹 Cleaned up merged branch ${old_branch} (was PR #${merged_pr})"
    fi
  fi
done

read -r -p "Flip create_relay_vm=false for ${ENV} and open a PR? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted — no changes made."
  exit 0
fi

git checkout -B "$BRANCH" origin/main

sed -i.bak 's/^create_relay_vm = true/create_relay_vm = false/' "$TFVARS"
rm -f "${TFVARS}.bak"

git add "$TFVARS"
git commit -m "$(cat <<EOF
chore(infra): flip create_relay_vm=false for ${ENV} (TD32)

Tears down the on-demand IAP relay VM after a session — merging this PR
triggers the pipeline's apply-${ENV} job to destroy it (real destroy, not
a stop, so cost drops to zero). Run scripts/relay-vm-up.sh ${ENV} to open
a new session later.
EOF
)"

git push -u origin "$BRANCH" --force-with-lease

gh pr create --repo "$REPO" \
  --title "chore(infra): flip create_relay_vm=false for ${ENV} (TD32)" \
  --body "Tears down the on-demand IAP relay VM for ${ENV} (\`modules/relay-vm\`, TD32). Merging triggers the pipeline's \`apply-${ENV}\` job — this PR carries only the tfvars flip, never a local \`terraform destroy\`. Run \`scripts/relay-vm-up.sh ${ENV}\` to open a new session later." \
  --head "$BRANCH" --base main

echo
echo "Next: wait for CI, then merge (gh pr merge --squash --delete-branch)."
echo "The pipeline destroys the VM once merged — verify with:"
echo "  gcloud compute instances list --project=ikaro-${ENV}"
