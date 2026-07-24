# TD34 — Normal Terraform deployer can modify its own project-level permissions

## Status

- **State**: 🟡 Open
- **Phase**: phase 3 ownership transfer underway
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

The same review must cover service-account IAM. The normal deployer also has
service-account administration capabilities, including the ability to modify
a service account's IAM policy. If it can add itself as a
`roles/iam.serviceAccountTokenCreator` or `roles/iam.serviceAccountUser` on a
more-privileged runtime or foundation service account, it can impersonate that
identity and inherit its permissions. Project-policy mutation is therefore not
the only escalation path this TD must remove.

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
principal, or another service account any new project-level permission or
service-account impersonation capability. Project IAM policy, service-account
IAM policy, and project-service activation must be managed by a separate,
more-protected foundation deployment boundary.

## Progress record

### Completed foundation boundary and IAP transfer

The reviewed Terraform-only bootstrap and permanent Foundation workflow are
live for staging and production. Each environment has a keyless Foundation
deployer and planner, an isolated state prefix, and a separately protected
GitHub Environment. The Foundation deployer holds the reviewed control-plane
roles needed for this TD: project IAM administration, service-account
administration, and Service Usage administration. The Foundation planner has
only the narrow IAM-policy reader, service-account viewer, and Service Usage
viewer roles needed to produce read-only plans.

`iap.googleapis.com` has been adopted into Foundation state in both projects.
The normal environment roots relinquished their duplicate IAP state entries
with `removed { lifecycle { destroy = false } }`, so the API stayed enabled
throughout. The normal deployers' `roles/serviceusage.serviceUsageAdmin`
bindings were then revoked in both live projects. The relay VM now relies on
the Foundation-owned IAP prerequisite rather than a normal-root dependency.

The temporary Foundation state-prefix and exact shared-state-bucket bridge
remain intentionally in the production normal root. They are migration
capabilities and must be removed only after Foundation owns the remaining IAM
surface and the normal deployer no longer needs them.

### Current legacy-role adoption batch

The next Foundation batch is implemented and awaiting PR creation/merge/apply
on `feat/td34-adopt-legacy-deployer-roles`. It adopts, without mutation, the
pre-existing broad project-role bindings of the normal deployers:

- staging: 12 imports;
- production: 13 imports, including its existing conditional
  `roles/storage.admin` binding that excludes the shared state bucket.

Live read-only Foundation plans verified these are imports only: zero creates,
updates, or destroys. The two temporary production state-bridge bindings are
deliberately excluded because they remain managed by
`modules/foundation-state-bootstrap` until phase 5.

### Remaining ownership-transfer scope

The normal Terraform states still contain 109 IAM-related objects in staging
and 115 in production. This includes runtime service-account creation,
project-level bindings, service-account IAM, and resource IAM for Cloud Run,
Pub/Sub, Storage, Secret Manager, Artifact Registry, Cloud SQL, Compute/IAP,
and Scheduler. These must move in reviewed batches: Foundation adopts each
live binding first, then the normal state relinquishes it without destroying
the binding. Cross-state moves must continue to use explicit imports/state
removal, never Terraform `moved` blocks.

## Proposed approach

Create a dedicated Terraform foundation layer for each project. It owns:

- project-level IAM bindings, including runtime service-account project roles;
- service-account IAM bindings, especially impersonation and token-creation
  grants;
- enabled Google APIs (`google_project_service`), including IAP;
- custom roles and IAM guardrails, if any are genuinely required;
- the dedicated foundation service account's WIF binding.

The foundation layer uses a dedicated service account and state prefix. Its
GitHub Actions workflow must be separately protected: only trusted `main`
changes that touch the foundation layer may request its WIF identity, and its
environment requires stronger, independent approval than normal staging/prod
application or infrastructure delivery. It remains keyless; no JSON service
account key is introduced.

### Approved target boundary

The selected design is a **complete migration**, not a relay-only exception:

- `ikaro-tf-foundation@ikaro-staging` and
  `ikaro-tf-foundation@ikaro-prod` are the only Terraform identities allowed
  to manage project IAM, service-account IAM, project services, and custom
  roles.
- Each environment has a distinct Terraform state prefix and a distinct
  workflow. Normal environment applies and foundation applies must never
  share a state file or own the same IAM/API resource.
- The workflows use distinct, protected GitHub Environments:
  `staging-foundation` and `production-foundation`. Their WIF principal
  conditions bind the repository, `main`, and the corresponding environment
  claim. They must not accept the normal infrastructure environments, pull
  requests, tags, or arbitrary branches.
- Normal `ikaro-tf-deployer` identities retain only the narrowly scoped
  permissions required to create and update ordinary non-IAM resources. They
  cannot manage project policy, service-account policy, service-account keys,
  service activation, custom roles, or the foundation identities.
- The relay VM is recreated only after its project API, IAP policy, instance
  policy, and runtime permissions are already owned and applied by the
  foundation layer. This removes permission-propagation ordering from the
  normal relay flip path.

### Controlled migration sequence

1. **Teardown and baseline:** destroy the partially created staging relay VM;
   capture the managed IAM/API inventory and verify no unrelated state drift.
2. **Bootstrap:** a reviewed, Terraform-only foundation bootstrap creates the
   foundation state, service accounts, WIF bindings, and minimum custom roles.
   The current privileged deployer may perform this one bootstrap because it
   is the existing root of trust; that capability is removed in the final
   phase. A temporary, condition-scoped bridge is permitted only for
   `foundation/staging/*`, `foundation/prod/*`, and the exact shared state
   bucket IAM policy needed to install the foundation identities' permanent
   state bindings; it is removed with the normal deployer's broad permissions.
   No operator `gcloud` command or service-account key is used.
3. **Ownership transfer:** move every project-, service-account-, and
   resource-level IAM/API object from the environment state into the matching
   foundation state using an explicit, reviewed `terraform state mv`/import
   runbook. Cross-state ownership cannot use Terraform `moved` blocks. The
   transfer is ordered so each live binding is adopted before its former owner
   is removed.
4. **De-privilege:** remove the normal deployer's IAM, Service Usage, custom
   role, and service-account-administration capabilities. Replace only proven
   routine requirements with resource-specific permissions that do not permit
   IAM-policy mutation or impersonation.
5. **Enforce and prove:** apply the foundation layer first, then normal
   infrastructure; run positive and negative live permission checks; and add
   CI policy checks that prevent the broad roles from returning. Remove the
   one-time bootstrap workflow and its normal-deployer path in this phase, so
   it cannot remain a second route to foundation identity creation.

### Bootstrap evidence and phase-3 prerequisite

The controlled bootstrap completed successfully for staging and production on
2026-07-24. It created separate foundation state, the keyless foundation
deployer/planner identities, their WIF bindings, and their permanent
foundation-state bindings. The protected foundation environments authenticated
as the expected foundation identities without printing credential content.

The initial identity-creation bootstrap deliberately granted the Foundation
deployers no project roles. That bootstrap is complete. The reviewed phase-3
enablement then granted the Foundation deployers the exact control-plane roles
listed in the progress record above, and the permanent protected Foundation
plan/apply path is live. This is a completed enablement step, not a
normal-deployer permission workaround.

### Phase-3 ownership-transfer design

1. **Enable the protected foundation control plane.** The existing bootstrap
   path grants the foundation deployer the reviewed project-, service-account-,
   service-usage-, and resource-IAM management roles needed for this TD. It
   must not grant `roles/owner`, create a key, or weaken the WIF condition.
2. **Establish the permanent foundation workflow.** A separately protected
   foundation plan/apply path uses only the foundation deployer after the
   enablement apply. The old normal-deployer bootstrap workflow remains only
   until phase 5 removes it.
3. **Split IAM from ordinary-resource modules.** Existing modules continue to
   own networks, buckets, services, databases, topics, and other ordinary
   resources. Foundation modules own only their IAM/API resources and receive
   the needed resource names/IDs as inputs. This prevents a state move from
   accidentally moving ordinary infrastructure ownership.
4. **Adopt before removing.** For every binding and enabled API, use an
   explicit cross-backend state-transfer/import runbook under the protected
   workflow. Verify the foundation plan is a no-op adoption before removing
   the former normal-state address. Never use a `moved` block across states.
5. **De-privilege only after transfer.** Replace the normal deployer's broad
   roles with proven, resource-specific non-IAM-mutation permissions, remove
   the temporary state/bucket bridge, and remove the one-time bootstrap path.

The initial inventory covers project IAM and services, service-account IAM,
and resource IAM for Cloud Run, Pub/Sub, Storage, Secret Manager, Artifact
Registry, Cloud SQL, Compute/IAP, Scheduler, and the relay VM. The transfer
must also move service-account creation into foundation ownership; a normal
deployer that can create or administer service accounts remains an escalation
path.

### Mandatory final cleanup and proof

Phase 5 is incomplete until every temporary bootstrap capability is removed
from live IAM and Terraform configuration:

- Remove `module.foundation_state_bootstrap` from the production environment
  root, including its temporary `storage.objectAdmin` grants on
  `foundation/staging/*` and `foundation/prod/*` and its temporary exact-bucket
  `storage.admin` grants on `ikaro-tfstate`.
- Remove the legacy normal-deployer bootstrap jobs from
  `.github/workflows/foundation-deploy.yml`. The permanent protected
  foundation workflow is the only remaining route to foundation applies.
- Revoke normal deployers' project-wide project-IAM, Service Usage,
  service-account-administration, and broad resource-administration roles
  after each corresponding resource is owned by foundation state. Replace a
  proven ordinary-resource need only with a non-IAM-mutation permission.
- Remove project-wide `roles/iam.serviceAccountUser` from normal deployers.
  Recreate it only as resource-level access to the specific runtime service
  accounts needed to attach workloads, never to a foundation identity.
- Run live negative checks showing that normal deployers cannot change project
  IAM, enable APIs, change a service account policy, mint a privileged service
  account token, or access foundation state. The protected foundation identity
  must succeed at the intended reviewed operation.

The foundation deployer's reviewed IAM/API-management capability set is the
new protected control-plane boundary, not a temporary workaround. It may be
reduced further only through a tested custom-role replacement that preserves
foundation ownership; it must never be replaced with `roles/owner`.

This is intentionally phased into reviewable pull requests. A single apply
cannot safely transfer state ownership and revoke the identity that is still
executing it. The temporary bootstrap privilege is a bounded migration
precondition, never a recurring permission in the normal deployment path.

Move every project-, service-account-, and resource-level IAM resource, plus
every `google_project_service`, out of the normal environment roots into that
foundation layer. This includes Secret Manager, Storage, Pub/Sub, Cloud Run,
Artifact Registry, Cloud SQL, Compute/IAP, and cross-project bindings: a
resource-level IAM administrator can otherwise remain an escalation path.
Migrate state deliberately under the protected workflow so existing bindings
are adopted rather than removed and recreated.

Then remove `roles/resourcemanager.projectIamAdmin` and
`roles/serviceusage.serviceUsageAdmin` from `ikaro-tf-deployer`, and remove
or narrowly replace any service-account-administration permission that can
change a service account's IAM policy or create/obtain credentials. Give the
normal deployer only resource-specific permissions needed for routine
resources. Any remaining instance-, service-, or secret-scoped IAM update
must be evaluated individually; move it to the foundation layer when the
provider operation can change project or service-account policy, create keys,
or otherwise enable self-escalation.

An initial root-of-trust bootstrap is unavoidable in any cloud architecture:
an existing organization/project administrator must establish the foundation
identity and its WIF trust once. This is a controlled bootstrap of the
foundation boundary, not a recurring operator command and not a normal
deployment path. After it exists, all ongoing changes are reviewed,
version-controlled Terraform applies.

## Acceptance criteria

- [x] Dedicated, keyless foundation Terraform layers and WIF service accounts
  exist for staging and production, with separate state from normal
  environment applies.
- [x] `staging-foundation` and `production-foundation` are independently
  protected GitHub Environments; their WIF conditions accept only the
  matching foundation workflow's `main` deployment.
- [x] `iap.googleapis.com` is owned by Foundation state in staging and
  production, and normal deployers no longer have
  `roles/serviceusage.serviceUsageAdmin`.
- [ ] Project-level, service-account-level, and resource-level IAM bindings,
  custom roles, and `google_project_service` resources are owned by the
  foundation layers; routine environment roots no longer mutate IAM policy
  or enable/disable project services.
- [ ] `ikaro-tf-deployer@ikaro-staging` and `ikaro-tf-deployer@ikaro-prod`
  no longer have `roles/resourcemanager.projectIamAdmin`,
  `roles/serviceusage.serviceUsageAdmin`, or any equivalent permission that
  can modify project allow policies.
- [ ] The normal deployers also cannot modify any service account's IAM
  policy, create a service-account key, or grant themselves
  `roles/iam.serviceAccountTokenCreator` / `roles/iam.serviceAccountUser` on
  a runtime or foundation service account.
- [ ] A live negative verification proves the normal deployer is denied when
  attempting to add a project IAM binding, enable an API, change a service
  account's policy, or acquire a privileged service-account token, while the
  foundation identity can perform the intended reviewed change.
- [x] The foundation workflow's WIF binding cannot be impersonated by pull
  requests, arbitrary branches, or the normal environment-deployer workflow;
  it uses a separately protected GitHub environment and pinned actions.
- [ ] Migration preserves existing IAM bindings and enabled APIs without a
  window in which runtime service accounts lose required access.
- [ ] CI/drift verification detects an unexpected return of project-IAM
  administration or Service Usage administration to either normal deployer.
- [x] Documentation distinguishes the foundation deployment boundary from
  normal infrastructure applies and records the one-time root-of-trust
  bootstrap procedure without exposing credentials or live policy dumps.

## Non-goals

- Replacing keyless GitHub OIDC/WIF with service-account keys.
- Allowing local `terraform apply`, direct `gcloud` mutation, or a permanent
  human break-glass account for routine changes.
- Treating the TD32 relay VM itself as the escalation vector; it is not. This
  TD fixes the broader deployment-identity boundary that TD32 exposed.

## Story-discovery decisions

- The partially created staging relay VM must be destroyed before the
  migration begins.
- The scope is the complete foundation migration. A relay-only control
  identity would leave the normal deployer able to escalate through the other
  IAM resources it still owns and is therefore rejected.
- A separately protected foundation GitHub Environment per project is
  required for a material WIF trust boundary; reusing the normal
  infrastructure environment is insufficient.
