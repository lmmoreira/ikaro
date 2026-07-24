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

TFVARS="infra/terraform/envs/${ENV}/terraform.tfvars"
BRANCH="chore/relay-vm-down-${ENV}"
OTHER_BRANCH="chore/relay-vm-up-${ENV}"

git fetch origin main >/dev/null
git checkout --detach origin/main >/dev/null

if grep -q '^create_relay_vm = false' "$TFVARS"; then
  echo "✅ create_relay_vm is already false for ${ENV} — nothing to do."
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
