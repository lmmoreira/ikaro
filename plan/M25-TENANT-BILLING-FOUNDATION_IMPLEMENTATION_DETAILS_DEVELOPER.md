# M25 — Tenant Billing: Foundation & Dark Enforcement — Implementation Details (Developer)

This document explains the concepts, decisions and bugs worth understanding from M25: how the platform decides whether a tenant may operate, why that decision lives in exactly one layer, how the same decision reaches routes, event handlers and cron jobs without any of them containing an `if`, how an operator suspends a tenant safely, and what the first real boot of the relay VM taught us that no CI run could.

---

## 1. Overview

M25 builds the Billing foundation **without charging anyone and without changing anything a user can see**. It delivers a `billing` schema, the `Subscription` / `BillingAccount` / `FeaturePrice` aggregates, one shared question every context can ask ("is this tenant operational, and is feature X entitled?"), an injectable clock, a provider port with a fake, the operator touchpoints (suspend, unsuspend, grace, exempt), and the whole **enforcement** machinery: route gating, event-delivery gating, cron gating, the hotsite's effective-published state and the suspended experience for staff, customers and visitors.

The central idea: enforcement ships **dark**. Every existing tenant is backfilled as an `exempt` subscription (S05), so all of the machinery is live and tested but denies nobody until a tenant is actually suspended. There is deliberately no global "enforcement on/off" flag (decision M25-D3): it was considered at S07 discovery and dropped, because the real emergency lever is a reviewed SQL update to the subscription row, and a flag would be one more thing that could drift from the truth.

Thirty-six stories shipped (S21b merged into S21a at discovery, S23 dropped, S27 built and then dropped). Five groups:

- **S01–S08 (data and domain):** the Asaas sandbox spike, schema, price catalog, exempt backfill, `TaxId`, env contract, aggregates.
- **S09–S15 (provisioning, access, operator):** registrations, trial subscription from `TenantProvisioned`, the clock, `TenantAccessPort`, the provider port, operator use cases and audit table.
- **S16–S24, S33 (enforcement, backend):** decorators, one global guard, annotation of every route, the event gate, the shared tenant-job runner, and the CI detector.
- **S25–S31b, S34 (enforcement, product):** effective-published hotsite, the suspended experience, the customer notice email, the web registry, a Playwright E2E.
- **S32 (live verification):** run the operator script against real staging, which found two infrastructure defects.

The throughline: **one decision, one owner, many callers that ask instead of re-deciding.** Sections 2 and 3 show it for routes and events (and a mistake reverted inside this milestone); section 4 applies it to operators; sections 6 and 7 show that "tests pass" and "it works on a real VM" are different claims.

---

## 2. How Access State Is Decided and Cached, and Why Only the Backend Enforces It

### The one question, asked through one port

```ts
// apps/backend/src/shared/ports/tenant-access.port.ts
/**
 * The one synchronous contract for "is this tenant operational, and is feature X entitled?".
 * Takes an explicit `tenantId` (never `RequestContext`: a cron has none). Billing implements it
 * behind a cache; every context injects `TENANT_ACCESS_PORT` without importing Billing.
 */
export interface TenantAccessPort {
  getAccess(tenantId: string): Promise<TenantAccess>;
  listSuspendedTenantIds(): Promise<string[]>;
  findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]>;
}
```

Three choices to internalize. It takes an explicit `tenantId`, because a cron has no request and a Pub/Sub handler has no JWT. The two batch methods return ids only, so a cron asks once instead of calling `getAccess` per tenant and can never read another tenant's state. And `TenantAccess` carries two internal markers, `provisional` (a tenant inside its 15-minute provisioning window with no subscription row yet) and `degraded` (the lookup failed): the system fails *open* on infrastructure trouble, so a Billing read failure never becomes an outage for paying tenants.

### The cache lives in the repository, not the port

```ts
// apps/backend/src/contexts/billing/infrastructure/repositories/caching-subscription.repository.ts
 * Asymmetric TTLs: an operational subscription 300 s, a `SUSPENDED` one
 * 10 s, so a paying tenant comes back fast. `save()` evicts after commit, which covers every writer
 * ... with no code of their own; `CachePort` has no cross-instance broadcast, so other instances
 * rely on the TTL.
 * ...
  // Deliberately bypasses the cache: a locking read backing a write-time check must see the
  // current committed row, never a stale cached copy.
  findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    return this.repo.findByTenantIdForUpdate(tenantId);
  }

  async save(subscription: Subscription): Promise<void> {
    await this.repo.save(subscription);
    await scheduleAfterCommit(() => this.invalidate(subscription.tenantId));
  }
```

The `TenantAccessAdapter` itself says it "holds no cache of its own", so every reader of the subscription gets the cache, and every writer evicts it with no cache code. TTLs are asymmetric because a suspension is rare (seeing it five minutes late on another instance is fine) while a reinstatement is the moment someone is waiting. Eviction runs `scheduleAfterCommit`: invalidating inside the transaction would let another request refill the cache with the old row before the commit lands. Only a *present* subscription is cached, so the provisioning window ends exactly on time.

### One table, one evaluator

```ts
// packages/types/src/tenant-access.ts
export const SUSPENSION_POLICIES = {
  DEFAULT_DENY: { admits: 'NONE' },
  MANAGER_BILLING: { admits: ['MANAGER'] },
  CUSTOMER_HISTORY: { admits: ['CUSTOMER'] },
  PUBLIC_MANIFEST: { admits: 'EVERYONE' },
  ...
} as const satisfies Record<string, { admits: SuspensionAdmits }>;

export function evaluateTenantAccess(access, requirement, role): TenantAccessVerdict {
  if (!access.operational) {
    const policy = requirement.policy ?? 'DEFAULT_DENY';
    return isAdmittedWhileSuspended(policy, role) ? 'ALLOW' : 'TENANT_SUSPENDED';
  }
  const { feature, noFeatureGate } = requirement;
  if (feature !== undefined && noFeatureGate !== true) {
    if (!access.features.some((entry) => entry.key === feature)) return 'FEATURE_NOT_ENTITLED';
  }
  return 'ALLOW';
}
```

(Parameter types elided for length; the file also lists `STAFF_NOTICE`, `AUTH_TENANT_SWITCH`, `ANY_AUTHENTICATED` and `PUBLIC_NONE`.) The ordering encodes a subtle bug the file's own comment records: a suspended tenant holds no entitled features, so checking entitlement first would refuse the public hotsite manifest (which declares `@RequiresFeature('HOTSITE')` beside `PUBLIC_MANIFEST`) with `FEATURE_NOT_ENTITLED`. A suspended tenant is decided by the route's policy alone. A new policy is one table entry; no guard changes.

### Routes declare, one guard reads

```ts
// apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts
@Controller('bookings')
@RequiresFeature('BOOKING')
@SuspensionAccess('DEFAULT_DENY')
export class BookingController {
  ...
  // A customer can still open a booking's detail while the tenant is suspended (UC-121) ...
  // Explicit, not an omission.
  @Get(':id')
  @SuspensionAccess('CUSTOMER_HISTORY')
```

The class-level default is the safe one; an exception is a method-level decorator with a comment. The global guard (`apps/backend/src/shared/guards/tenant-access.guard.ts`) is a **Guard, never an Interceptor** (an Interceptor does not run for a Guard-rejected request) and, because guards run before `RequestInterceptor` builds `RequestContext`, it reads `x-tenant-id` and `x-actor-role` from the headers. A request with no `x-tenant-id` passes through (scheduler, Pub/Sub, health); a failed lookup passes through with a warning that passes `tenantId` explicitly; a verdict of `FEATURE_NOT_ENTITLED` or `TENANT_SUSPENDED` throws a typed 403 Problem Detail.

Annotating every existing route took five stories (S17, S18a/b, S19, S20), made safe by the **route-completeness detector**: it started in *warn* mode in S16 and S24 (#783) made a missing annotation fail CI. A detector that blocks from day one breaks every unrelated open branch; one that never blocks is decoration. Warn-then-enforce is the pattern.

### The lesson: S16 added a BFF gate, S33 removed it

S16 (#775) gated every request **twice**: a BFF guard read each BFF route's annotations and asked the backend's access endpoint through its own 300 s / 10 s cache, then the backend guard ran on the real call. S33 (#784) recorded why that was wrong:

> Both decide from the same backend data, so the BFF check adds no independent safety. It costs 92 duplicate annotation lines on 27 controllers, 15 duplicate spec files, a second cache, a second fail-open path and stacked staleness (a suspension is visible through the BFF within about 600 s, a reinstatement within about 20 s). Entitlement is a business rule and belongs to the service that owns the data.
>
> (plan/M25-TENANT-BILLING-FOUNDATION.md, M25-S33)

Defense in depth needs two checks that can fail *independently*. A BFF check that asks the backend's own answer is the same decision made twice, with a second cache that lets the copies disagree for up to ten minutes. It also was never the only gate: crons, Pub/Sub and operator scripts call the backend without the BFF. The generalized rule now sits in the project instructions: **a layer never re-implements a decision another layer already makes from the same data**; annotate the owning layer instead. In practice (`docs/ENGINEERING_RULES_SHARED.md`): "A new BFF route needs no annotation; the backend route it calls does", and the BFF forwards the typed 403 unchanged. The accepted trade-off was recorded up front: a public request for a suspended tenant now reaches the backend and is answered from its 10 s suspended cache.

How S33 was done safely is reusable. Before deleting about 55 files, it required a **parity table** in the PR body of every BFF handler's declared (feature, policy) against the backend routes it calls. Wherever the BFF had been stricter (so removal loosens behaviour), the fix was to annotate the **backend** route, "never to keep a BFF check". It also removed the whole BFF cache layer S16 introduced, with the condition for its return: "only with a measured need, behind a port."

---

## 3. The Declarative Event Gate and the Dropped S23 Sender Gate

A suspended tenant must not trigger side effects such as confirmation emails or availability alerts. Events are at-least-once, so "don't publish" is wrong (the event is already a fact), and a check in 21 notification handlers is wrong too. S23 originally planned a second gate in `BaseNotificationUseCase` at send time; S21a (#778) solved the problem structurally, which made S23 redundant.

### A decorator around the bus, configured per subscription

Handlers inject `EVENT_BUS`, which is a decorator over the Pub/Sub adapter:

```ts
// apps/backend/src/shared/ports/event-bus.port.ts
 * Per-subscription delivery policy (M25-S21a, UC-125). Opt-in: a subscription that passes no
 * options, or only `skipWhenSuspended: false`, always runs. ...
 * A skipped event is acknowledged and dropped, never replayed.
export interface SubscribeOptions {
  skipWhenSuspended?: boolean;
  requires?: FeatureKey;
}
```

```ts
// apps/backend/src/shared/infrastructure/event-bus/gated-event-bus.ts
    if (this.shouldSkip(access, options)) {
      // Returning normally acknowledges the message: a skipped event is dropped, never replayed.
      this.logger.log('Event skipped for tenant', { tenantId: event.tenantId, eventId: event.eventId, ... });
      return;
    }
    return handler(event);
```

A handler opts in at its own subscription (`{ skipWhenSuspended: true }` in `booking-requested.handler.ts`), and one that must run for a suspended tenant says so explicitly, as `tenant-provisioned-billing.handler.ts` does with `{ skipWhenSuspended: false }`.

- **Why a decorator, not code in the Pub/Sub adapter.** The transport must not depend on Billing: `TENANT_ACCESS_PORT` reaches `OUTBOX_PUBLISHER`, whose relay publishes through the bus, so an access-aware transport would close a dependency cycle. The relay stays on the raw `EVENT_BUS_TRANSPORT`. Because the wrapper applies at `subscribe()`, the pull path, push path and in-memory bus all run the same gate.
- **The default is "run", and forgetting is a CI failure.** The architecture-check rule requiring a literal `{ skipWhenSuspended }` on every `subscribe()` is the event-side twin of the route detector. S21a shipped it failing from its first commit, declaring every existing subscription in the same PR so no branch was ever undeclared.
- **Skipped means acknowledged and dropped,** not nacked, because replaying would skip forever. It is a business decision: when the tenant returns, missed emails are not sent late.
- The gate fails open on a lookup error or an envelope without a tenant, like the route guard.

### Why S23 was dropped

S23 planned a send-path gate, a `SKIPPED_TENANT_SUSPENDED` status in `notification_logs` (a CHECK replacement on a live table), a `bypassSuspensionGate` template flag and an overridable hook. The plan records why it died at discovery:

> Every email Notification sends is triggered by an event subscription ... and the event-subscription gate of S21a runs at delivery time and already acknowledges the event of a suspended tenant before the handler runs. A gate in the send path would ask the same question milliseconds later. What it would have added was only a `SKIPPED_TENANT_SUSPENDED` row in `notification_logs`, paid for with a status widening ... (CLAUDE.md §7: mounting complexity).
>
> (plan/M25-TENANT-BILLING-FOUNDATION.md, M25-S23)

It is the section 2 lesson seen from the other side: a status column, a CHECK replacement, a flag and a hook were being added to patch a design whose question was already answered one layer earlier. `notification_logs.status` stays `PENDING | SENT | FAILED`. UC-123 is delivered by `skipWhenSuspended: true` on the send handlers and `false` on the three that must always run (`dead-letter`, `staff-invited`, `tenant-provisioned`).

### Crons ask the same port

A scheduled job has no envelope or request, so it uses the shared tenant-job runner (S22, #776):

```ts
// apps/backend/src/shared/application/jobs/tenant-job-runner.ts
  // `operational` skips suspended tenants; `includingSuspended` is for data-maintenance crons.
  scope?: 'operational' | 'includingSuspended';
  ...
  // Fails open, like `getAccess`: a failing Billing read must not stop every tenant's cron. The
  // cost is that one tick may process a suspended or unentitled tenant.
```

It asks for the suspended ids once per run, filters the due tenants, logs one line only when something was skipped, and runs the rest sequentially. A failure for one tenant never stops the others, but after all were tried the run throws once, so Pub/Sub redelivers (jobs are idempotent). Route guard, event bus and job runner all fail open on a Billing read error, deliberately.

### A scenario built and then dropped (S27)

Open question O-L1 asked whether loyalty points should keep expiring while a tenant is suspended. The first design ("no") was fully built on a branch (a pause ledger table, a pure `effectiveExpiry` function, two consumers, a Foundation apply, a new customer-facing field), and the product owner dropped it on 2026-11-15 as "too much machinery and risk surface for a scenario that is rare and not needed today"; its PR was closed unmerged. The shipped answer is documentation only (#789): points keep expiring, and warning emails stay suppressed by `skipWhenSuspended: true`. Willingness to throw away a finished branch is part of the same rule.

---

## 4. Operator Suspend / Unsuspend / Exempt, the Audit Table, and Secrets on stdin

An operator (a platform administrator, not a tenant manager) can suspend a tenant for abuse, lift that suspension, extend a past-due grace period, or set or clear `exempt` (UC-111, UC-137; S15a #772, S15b #774). The suspend use case shows the shared shape:

```ts
// apps/backend/src/contexts/billing/application/use-cases/suspend-tenant-by-operator.use-case.ts
    return this.txManager.run(async () => {
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const now = this.clock.now();
      const previousReason = subscription.suspensionReason;
      if (subscription.suspendByOperator(now, input.correlationId)) {
        await this.subscriptions.save(subscription);
        await this.audits.save(
          OperatorAudit.record({ tenantId: input.tenantId, actor: input.operator, action: 'SUSPEND',
            reason: input.reason, details: { previousReason }, now }),
        );
      }
      return toOperatorBillingState(subscription);
    });
```

(Formatting condensed.) Row lock first, via `findByTenantIdForUpdate` (lock B-R1), which bypasses the cache. The aggregate decides: `suspendByOperator` returns whether anything changed, so a tenant already suspended for any reason is left alone, with no audit row and no event, "so a payment suspension can never be turned into one the operator can lift". State, outbox event and audit row commit together, with no network I/O inside the transaction. The clock is injected, which is what lets the dev clock-advance script (S12, #760) test time-dependent behaviour.

### The audit table

`billing.operator_audit` is append-only. The domain object bounds what can be stored:

```ts
// apps/backend/src/contexts/billing/domain/operator-audit.ts
export const OPERATOR_AUDIT_ACTIONS = ['GRACE', 'SUSPEND', 'UNSUSPEND', 'SET_EXEMPT'] as const;
/** The serialized `payload` (reason included) may not exceed this many UTF-8 bytes. */
export const OPERATOR_AUDIT_PAYLOAD_MAX_BYTES = 4096;
```

The table has no `reason` column, so the reason lives in the bounded JSONB `payload`. `--reason` and `--operator` are mandatory on every write and checked before any network call. The script states the honest limit: the platform key is shared, so the audit records **the name the operator claims**, not a verified identity.

### Why the script passes secrets on stdin

The backend is on internal ingress, so operator scripts run from the relay VM's SSH shell, where any logged-in user can run `ps` and read every process's command line. `curl -H "X-Internal-Key: $KEY"` leaks the key to the whole host for the duration of the call; `provision-tenant.sh` did exactly that until S15b extracted a shared helper.

```bash
# scripts/lib/relay-auth.sh
# curl with headers on stdin. Usage: _relay_curl_with_headers <header>... -- <curl arguments...>
_relay_curl_with_headers() {
  local config="" header
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    config+="header = \"$1\""$'\n'
    shift
  done
  shift # the "--"
  printf '%s' "$config" | curl -sS --fail-with-body --config - "$@"
}
```

`curl --config -` reads `header = "Name: value"` lines from stdin, and `printf` is a shell **builtin**, so no process exists whose arguments `ps` could list. Only the fixed non-secret `Metadata-Flavor: Google` marker stays a plain `-H`. The helper also refuses to send credentials over plain HTTP to a remote host and health-checks the backend before anything mutates. The rule is in `docs/ENGINEERING_RULES_INFRA.md`: a new script reuses the helper instead of writing its own curl calls.

A small example of care in `scripts/billing-operator.sh`: `--set` and `--clear` together are refused ("Both flags would silently let the last one win: clearing exempt on a free tenant starts a paid trial"). Rejecting an ambiguous command is cheaper than picking a winner when the winner can start a paid trial.

---

## 5. Smaller Concepts

### Tax-id value objects (S06, #759)

Validation rules come from the country's `CountrySpec.taxId` (`packages/i18n/src/country-defaults.ts`; Brazil: `required: true, types: ['CNPJ', 'CPF']`; the US is optional with `['EIN', 'OTHER']`), not from the VO.

```ts
// apps/backend/src/shared/value-objects/tax-id.vo.ts
  static create(raw: string, spec: TaxIdSpec, declaredType?: TaxIdType): TaxId {
    if (typeof raw !== 'string' || raw.trim() === '') throw required();
    const types = candidateTypes(spec, declaredType);
    return types.includes('OTHER') ? createFreeText(raw, spec) : createChecked(raw, types);
  }
```

Lessons: free text is never a silent fallback ("a mistyped EIN is refused, not stored unchecked"; an SSN has an EIN's shape, so only the declared type distinguishes them). Alphanumeric CNPJ (issued since July 2026) is handled by valuing each character as its ASCII code minus 48, so numeric CNPJs stay valid. One typed `TaxIdValidationError` carries a `SignupErrorCode`, so every context maps it to a 422 through the shared VO-error mapper. `isAllowedFor(spec)` lets `BillingAccount` enforce country/type consistency on an id reconstituted from storage. Adding `EIN` replaced two CHECK constraints in a new expand-only migration (`NOT VALID` plus a separate `VALIDATE`), because the S03 migration had already run in staging.

### Other mechanisms, briefly

- **Dark by backfill (S05, #757):** make the *data* inert so the live code path is the tested one.
- **`BillingProviderPort` with a fake and a contract suite (S14, #768):** the real Asaas adapter in M26 must pass the same suite; the S01 sandbox spike (#749) recorded provider facts first.
- **One provisioning pattern (S09-S11):** reserve a registration, `POST /internal/tenants` carries its `registrationId`, `TenantProvisioned` creates the trial. Publisher and consumer ship in the same release, because the bus does not version-route.

---

## 6. The Relay VM Module: the Heredoc Dedent Trap and the Truncated-Binary Guard (S32)

The relay VM is a short-lived Compute Engine instance operators SSH into to reach the internal-ingress backend and staging database. It runs a Cloud SQL Auth Proxy as a systemd service and has the operator scripts under `/usr/local/bin`. Its boot logic is a startup script handed over as instance metadata by `infra/terraform/modules/relay-vm`. S32 was meant to be a plain live check, but on the staging VM **neither operator script was installed and the proxy service was inactive**.

### Defect 1: the heredoc dedent trap

The startup script was an inline `<<-EOT` heredoc. Terraform strips indentation only down to the **least-indented literal line**. An interpolated script (`${var.tenant_provision_script}`) lands at column 0 and counts as a literal line, so nothing was stripped. The terminator of the systemd unit's here-document (`UNIT`) stayed indented, bash never ended the here-document, and the rest of the script, including the embedded `provision-tenant.sh`, was written *into the unit file*. The VM booted with no error and did none of the work. It had been broken since 2026-07-28 (per the plan) and nothing had booted it since: a module with a green test suite that no real machine had run.

The fix is a real template file, flush-left, rendered with `templatefile()`, installing each script from base64 so no content can collide with a delimiter:

```hcl
# infra/terraform/modules/relay-vm/main.tf
  startup_script = templatefile("${path.module}/startup-script.sh.tftpl", {
    db_instance_connection_name = var.db_instance_connection_name
    scripts = {
      for path, content in merge({ "provision-tenant.sh" = var.tenant_provision_script }, var.additional_scripts) :
      path => base64encode(content)
    }
  })
```

```bash
# infra/terraform/modules/relay-vm/startup-script.sh.tftpl
%{ for path, content_b64 in scripts ~}
install -d -m 0755 "$(dirname "/usr/local/bin/${path}")"
printf '%s' '${content_b64}' | base64 -d > "/usr/local/bin/${path}"
chmod 0755 "/usr/local/bin/${path}"
%{ endfor ~}
```

The scripts install **first**, "so a failure further down (the proxy, its unit) can never again leave the VM without them". `additional_scripts` (default `{}`) makes a third operator script one map line per environment, and `tenant_provision_script` keeps its name so Foundation kept planning between the two PRs. Downloading scripts from a bucket at boot was rejected: a bucket, IAM and a new failure mode for nothing.

A regression test pins the class of bug. `terraform test` cannot run bash, so it asserts on the rendered text:

```hcl
# infra/terraform/modules/relay-vm/tests/resources_unit_test.tftest.hcl
    error_message = "The systemd unit here-document must end with a terminator at column 0, or bash swallows the rest of the startup script."
```

The plan records the tests were mutation-checked and the rendered script checked with `bash -n`. The general rule (`docs/ENGINEERING_RULES_INFRA.md`): "A module with a green suite that no real VM has booted is unproven."

### Defect 2 (second boot): the truncated binary

After the fix the first boot worked. A **second** boot, after a hard reset, found `cloud-sql-proxy` killed by SIGBUS: the earlier download had been cut short before the disk flushed it, leaving a 24 MiB file that was truncated yet executable, and the old "is there an executable file" guard accepted it. The fix trusts the binary only when its pinned checksum matches:

```bash
# infra/terraform/modules/relay-vm/startup-script.sh.tftpl
if ! echo "cd689d58...e4e6f6  /usr/local/bin/cloud-sql-proxy" | sha256sum -c - >/dev/null 2>&1; then
  curl -fsSL -o /usr/local/bin/cloud-sql-proxy.download "https://storage.googleapis.com/..."
  echo "cd689d58...e4e6f6  /usr/local/bin/cloud-sql-proxy.download" | sha256sum -c -
  chmod +x /usr/local/bin/cloud-sql-proxy.download
  mv -f /usr/local/bin/cloud-sql-proxy.download /usr/local/bin/cloud-sql-proxy
  sync
fi
```

(Hash and URL abbreviated here; the file holds the full values.) An executable bit describes a file entry, a checksum describes its content. The script re-verifies on every boot, verifies before moving into place, and syncs after, so a half-written file never sits under the real name. Shipped in #812; the VM was torn down in #813.

---

## 7. Live Verification on Staging, and What It Found

Project rule: a story touching Terraform, IAM, Pub/Sub or CI/CD runs a concrete live check before its PR is presented as ready, because "tests pass, bots clean" has been wrong before. S32's round trip on a permanent staging test tenant (kept `exempt` while idle so a trial never lapses into a suspension): `list`, `exempt --clear`, `suspend`, a repeated `suspend`, `unsuspend`, `exempt --set`. Per the plan's recorded results:

- `billing.operator_audit` held exactly **four rows** (SET_EXEMPT, SUSPEND, UNSUSPEND, SET_EXEMPT), each with the operator's name as `actor` and the reason in `payload.reason`. The repeated `suspend` wrote no row and published no second event, matching the use case's no-op design.
- `SubscriptionSuspended` and `SubscriptionReactivated` each appeared once in the audit-log consumer's log.
- Bad arguments were refused before any network call; `exempt --clear` on Ikaro's own tenant returned `403 BILLING_EXEMPT_PROTECTED` with no audit row.
- **33 `ps` samples during calls showed no key or token**, the direct proof of the stdin design.
- S28's email: one reason-neutral email reached the one logged-in customer; the guest booking, the pending booking and another tenant's customer got nothing; `unsuspend` sent nothing; dead-letter subscriptions stayed empty.

**What live verification found that CI could not:** the heredoc defect and missing scripts (module tests, `terraform validate` and Checkov were all green); the truncated binary, which only exists across two boots and a hard reset; and a wrong success criterion. S25's criteria asked for a success *log line* from the hotsite revalidation consumers, but "their success path logs nothing, only a failure warns", so the page flipping is the evidence (a log line is tracked as TD51 Story 7). The lesson is now a discovery check in `.claude/commands/story-discovery.md`: when a criterion says "the log shows X", confirm the code logs X.

**Accepted gaps, left visible in the plan:**
- The "two different customers each get one email" case was not run live (it needs a second logged-in identity); unit and integration specs cover it.
- Hotsite revalidation was seen flipping the public page to "Unavailable" and back, but the manifest's `isPublished` and the published list were not read directly, because the BFF is not reachable from outside.
- Both boot checks ran with the fixed script set by hand as instance metadata, since the Foundation environment roots had not yet passed the two extra scripts through `additional_scripts`. That follow-up is carried into M26-S24.
- Tfsec was not run; the repository's gate is Checkov, which was clean.

---

## 8. PR Map

From `git log main --grep '(M25-S'`:

| Stories | PRs |
|---|---|
| S01 spike; S03 schema; S04 catalog; S05 backfill; S06 `TaxId` | #749; #751; #754; #757; #759 |
| S08 aggregates; S09/S10/S11 provisioning; S12 clock; S13 access port; S14 provider port | #762; #765/#767/#769; #760; #771; #768 |
| S15a/S15b operator; S16 gating framework; S22 job runner; S21a event gate | #772/#774; #775; #776; #778 |
| S17, S18a, S18b, S19, S20 route annotation; S24 detector enforcing; S33 BFF gate removed | #777, #779, #780, #781, #782; #783; #784 |
| S25 hotsite; S26 tenant lists; S27 docs; S28 customer email | #786; #787; #789; #791 |
| S29 web enforcement; S30 Unavailable page; S31a surfaces; S34 registry; S31b E2E | #802; #805; #808; #809; #810 |
| S32 relay VM and live verification (teardown) | #812 (#813) |

S23 has no PR (dropped); S21b was merged into S21a.

---

## 9. Takeaways

1. **One decision, one owner.** The access decision is one function, enforced by one backend guard, one event-bus decorator and one job runner, all asking one port. The BFF gate (S16, removed in S33) and the dropped S23 sender gate are the cautionary tales.
2. **Make the safe thing the default, and forgetting a CI failure.** `DEFAULT_DENY`, a route detector, a required explicit `skipWhenSuspended`.
3. **Roll a new detector out in two steps** (warn, then enforce) when many open branches would otherwise break.
4. **Fail open for infrastructure errors, closed for decisions.** A failed Billing lookup lets traffic through and logs; a known suspension denies.
5. **Prefer inert data to a flag.** The exempt backfill makes "dark" real and testable.
6. **A secret never goes in a process argument.** Headers on stdin, written by a shell builtin.
7. **A module no real machine has booted is unproven.** Template the script, pin its invariants in tests, then boot it, twice.
8. **Dropping work is a valid outcome.** S23 and S27 were complete designs removed because a simpler structure already did the job.

---

## 10. What This Document Does Not Cover or Verify

- PR numbers, story titles and dates come from the git log and the plan file. The S27 closed-unmerged PR appears only in the plan, so it is not in the table.
- Quoted plan prose (S33, S23, S27, S32) was read from `plan/M25-TENANT-BILLING-FOUNDATION.md`; code excerpts were read from the named files (some condensed with `...`). No test or script was run.
- The inline-heredoc start date (2026-07-28) comes from the plan, not from reading that commit.
- The live results (audit rows, `ps` samples, email counts, empty dead-letter subscriptions) are the plan's recorded results; the raw output is not in the repository.
- Web-side enforcement (S29, S30, S31a, S34) and the hotsite effective-published logic (S25) are named but not taught with excerpts; those files were not read.
