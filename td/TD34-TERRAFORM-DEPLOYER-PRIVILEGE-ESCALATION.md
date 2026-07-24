# TD34 — Normal Terraform deployer can modify its own project-level permissions

## Status

- **State**: 🟡 Open
- **Type**: Technical Debt / Infrastructure Security
- **Priority**: High — a compromise of the trusted infrastructure deployment path can become project-wide privilege escalation
- **Context**: `infra/terraform/envs/staging/main.tf`, `infra/terraform/envs/prod/main.tf`, `.github/workflows/infra-deploy.yml`, M17-S08 / M17-S24 deployer-role design
- **Created**: 2026-07-24
- **Discovered**: while remediating TD32's missing IAP API activation prerequisite (PR #207)

---

## Problem

`ikaro-tf-deployer@<project>` currently has
`roles/resourcemanager.projectIamAdmin`. That role includes
`resourcemanager.projects.setIamPolicy`, so the identity that performs normal
Terraform applies can modify the project's allow policy. In practice, it can
grant itself (or another principal) additional project-level roles.

This predates TD32. TD32 made the consequence explicit: Terraform needs to
manage `iap.googleapis.com`, which requires Service Usage permissions. The
deployer can grant itself `roles/serviceusage.serviceUsageAdmin` because it
already administers project IAM. That is an auditable Terraform change, but
it demonstrates the underlying privilege-escalation boundary.

This is **not** an information leak from the public repository. A reader of
the repository cannot impersonate the service account. Exploitation requires
control of the trusted deployment path: for example, an unauthorized merge to
`main`, a compromised GitHub Actions dependency/workflow, or compromised WIF
trust. The existing `main` restriction, protected environments, pinned
actions, and keyless WIF reduce that likelihood; they do not constrain the
blast radius once `ikaro-tf-deployer` is obtained.

## Why this matters

- A normal infrastructure apply has a larger blast radius than its declared
  resource diff suggests: it can alter project IAM and then use the newly
  granted capability.
- A compromise can persist by adding another principal or service account to
  the project policy, even after the original workflow run ends.
- Keeping API activation and broad project-IAM mutation on the same routine
  deployer prevents a meaningful separation between ordinary infrastructure
  delivery and foundation-security changes.
- Checkov correctly classifies predefined administrator roles such as
  `roles/serviceusage.serviceUsageAdmin` as privileged. A resource-scoped
  exception can document an intentional role, but it cannot solve the
  pre-existing self-escalation path.

## Required security outcome

The normal environment deployer must be unable to grant itself, another
principal, or another service account any new project-level permission. IAM
policy and project-service activation must be managed by a separate,
more-protected foundation deployment boundary.

## Proposed approach

Create a dedicated Terraform foundation layer for each project. It owns:

- project-level IAM bindings, including runtime service-account project roles;
- enabled Google APIs (`google_project_service`), including IAP;
- custom roles and IAM guardrails, if any are genuinely required;
- the dedicated foundation service account's WIF binding.

The foundation layer uses a dedicated service account and state prefix. Its
GitHub Actions workflow must be separately protected: only trusted `main`
changes that touch the foundation layer may request its WIF identity, and its
environment requires stronger, independent approval than normal staging/prod
application or infrastructure delivery. It remains keyless; no JSON service
account key is introduced.

Move every `google_project_iam_member` and `google_project_service` resource
that needs project-policy mutation out of the normal environment roots into
that foundation layer. Migrate state deliberately (Terraform `moved` blocks
or import/state migration under the protected workflow) so existing bindings
are adopted rather than removed and recreated.

Then remove `roles/resourcemanager.projectIamAdmin` and
`roles/serviceusage.serviceUsageAdmin` from `ikaro-tf-deployer`. Give the
normal deployer only resource-specific permissions needed for routine
resources. Any remaining instance-, service-, or secret-scoped IAM update
must be evaluated individually; move it to the foundation layer when the
provider operation ultimately changes project policy or otherwise enables
self-escalation.

An initial root-of-trust bootstrap is unavoidable in any cloud architecture:
an existing organization/project administrator must establish the foundation
identity and its WIF trust once. This is a controlled bootstrap of the
foundation boundary, not a recurring operator command and not a normal
deployment path. After it exists, all ongoing changes are reviewed,
version-controlled Terraform applies.

## Acceptance criteria

- [ ] A dedicated, keyless foundation Terraform layer and WIF service account
  exist for staging and production, with separate state from normal
  environment applies.
- [ ] Project-level IAM bindings and `google_project_service` resources are
  owned by the foundation layer; routine environment roots no longer mutate
  the project IAM policy or enable/disable project services.
- [ ] `ikaro-tf-deployer@ikaro-staging` and `ikaro-tf-deployer@ikaro-prod`
  no longer have `roles/resourcemanager.projectIamAdmin`,
  `roles/serviceusage.serviceUsageAdmin`, or any equivalent permission that
  can modify project allow policies.
- [ ] A live negative verification proves the normal deployer is denied when
  attempting to add a project IAM binding or enable an API, while the
  foundation identity can perform the intended reviewed change.
- [ ] The foundation workflow's WIF binding cannot be impersonated by pull
  requests, arbitrary branches, or the normal environment-deployer workflow;
  it uses a separately protected GitHub environment and pinned actions.
- [ ] Migration preserves existing IAM bindings and enabled APIs without a
  window in which runtime service accounts lose required access.
- [ ] CI/drift verification detects an unexpected return of project-IAM
  administration or Service Usage administration to either normal deployer.
- [ ] Documentation distinguishes the foundation deployment boundary from
  normal infrastructure applies and records the one-time root-of-trust
  bootstrap procedure without exposing credentials or live policy dumps.

## Non-goals

- Replacing keyless GitHub OIDC/WIF with service-account keys.
- Allowing local `terraform apply`, direct `gcloud` mutation, or a permanent
  human break-glass account for routine changes.
- Treating the TD32 relay VM itself as the escalation vector; it is not. This
  TD fixes the broader deployment-identity boundary that TD32 exposed.

## Open questions for story discovery

1. Which currently managed IAM bindings can safely move together in the first
   foundation migration without creating circular dependencies?
2. What minimal resource-specific permissions remain on the normal deployer
   after project-level IAM/API ownership moves out?
3. Which GitHub environment approval and WIF attribute conditions provide a
   materially independent foundation boundary, rather than another path
   controlled by the same routine `main` merge?
4. Can organization-level IAM Deny or Principal Access Boundary policies add
   a defense-in-depth guarantee that the normal deployer cannot regain
   project-IAM mutation, and are they available under the current organization
   administration model?
