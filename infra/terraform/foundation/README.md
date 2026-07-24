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

## One-time bootstrap

`foundation-deploy.yml` has a manual `bootstrap=true` dispatch that runs only
from `main`. It uses the existing protected normal deployer exactly once to
create the foundation identities, their WIF bindings, and state-prefix access.
It then proves that the new foundation identity can be impersonated through
the independently protected foundation GitHub Environment.

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

## Migration order

1. Bootstrap this control plane and verify foundation WIF.
2. Adopt IAM/API resources into foundation state without recreating bindings.
3. Remove their ownership from normal environment roots.
4. Revoke the normal deployer's broad IAM and service-account capabilities.
5. Add and run live negative-permission and drift checks.
