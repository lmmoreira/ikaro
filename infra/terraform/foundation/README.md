# Terraform foundation control plane

This directory is the separately protected Terraform boundary for TD34. It
will own project IAM, service-account IAM, enabled APIs, custom roles, and
Terraform control identities. Normal `infra/terraform/envs/*` roots must not
manage those security-boundary resources after the migration.

## State and identities

Each foundation root has a separate state prefix in `gs://ikaro-tfstate`:

| Environment | Prefix | Foundation deployer | GitHub Environment |
|---|---|---|---|
| staging | `foundation/staging` | `ikaro-tf-foundation@ikaro-staging` | `staging-foundation` |
| prod | `foundation/prod` | `ikaro-tf-foundation@ikaro-prod` | `production-foundation` |

The foundation deployer is keyless. Google permits WIF impersonation only for
`lmmoreira/ikaro` on `refs/heads/main` with the matching protected GitHub
Environment claim. The planner is repository-scoped and read-only so a PR can
plan after its read permissions are introduced in TD34's ownership-transfer
phase.

### Phase-3 enablement

Before moving any existing IAM/API resource, the control plane grants the
protected foundation deployer only project-IAM, service-account-IAM, and
Service Usage administration. It deliberately excludes `roles/owner` and
resource-specific administrator roles; those are added only with the reviewed
ownership-transfer slice that needs them. The foundation planner receives only
the existing IAM-policy reader custom role, service-account viewer, and Service
Usage viewer access. Those roles are sufficient to refresh IAM bindings,
foundation identities, and enabled APIs without mutation.

## One-time bootstrap

`foundation-deploy.yml` has a manual `bootstrap=true` dispatch that runs only
from `main`. It first produces a sanitized staging plan, then waits at the
protected `staging-foundation` Environment before re-planning and applying.
Production follows the same plan-then-apply sequence using the existing
`production-infrastructure` Environment, because its current deployer WIF
binding is deliberately restricted to that bootstrap identity. The workflow
uses the existing protected normal deployer exactly once to create the
foundation identities, their WIF bindings, and state-prefix access. It then
proves that the new foundation identity can be impersonated through the
independently protected foundation GitHub Environment. Plan summaries contain
only resource addresses and actions; saved plan artifacts are deleted and
never uploaded.

Before dispatching bootstrap, configure `staging-foundation` and
`production-foundation` with `main`-only branch policy, required review, and
no administrator bypass. Store `TF_FOUNDATION_SA_STAGING` and
`TF_FOUNDATION_SA_PROD` as environment secrets. These values are service
account identifiers, not bearer credentials; environment scope prevents a
normal workflow from accidentally using the foundation target.

The bootstrap workflow is temporary. TD34's de-privilege phase must remove it
after foundation applies own the complete IAM/API surface and the normal
deployer has lost the permissions needed to create or configure foundation
identities. Do not use `gcloud` or local `terraform apply` for bootstrap or
ongoing foundation changes.

## Permanent foundation workflow

After phase-3 enablement, internal pull requests produce separate, sanitized
staging and production plans using the repository-scoped read-only foundation
planner. A manual `apply=true` dispatch from `main` produces those plans first,
then applies staging and production serially through their matching protected
foundation Environments using only the foundation deployer. Planner account
emails are public identifiers, not credentials; no protected environment is
requested by a pull-request plan.

### Shared-state bucket policy reads

`ikaro-tfstate` belongs to the production project, while both foundation states
manage condition-scoped IAM bindings on that bucket. Terraform refreshes every
`google_storage_bucket_iam_member` through `storage.buckets.getIamPolicy`,
which is distinct from object access to a state prefix. The production
foundation state therefore grants the existing read-only IAM-policy-reader
custom role to both foundation deployers and the staging foundation planner.
That cross-project read binding was installed during the TD34 migration and is
now managed by the foundation layers.

### Historical state-prefix bridge

During the TD34 migration, a temporary state-prefix bridge granted the legacy
deployers access to initialize the empty `foundation/<env>/` prefixes and
install the permanent foundation bindings. The bridge and its migration-only
Terraform module have now been removed; the foundation identities own these
prefixes directly.

## Migration order

1. Bootstrap this control plane and verify foundation WIF.
2. Adopt IAM/API resources into foundation state without recreating bindings.
3. Remove their ownership from normal environment roots.
4. Revoke the normal deployer's broad IAM and service-account capabilities.
5. Add and run live negative-permission and drift checks.
