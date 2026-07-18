# M17 — Cloud Deploy: GCP Infrastructure, CI/CD, Hardening & Observability

**Phase:** Cloud ☁️ — GCP + Cloudflare charges begin in Wave 1
**Goal:** The platform runs on GCP behind Cloudflare with fully automated trunk-based CI/CD: every merge to `main` auto-deploys to staging; production is promoted behind a single manual approval — same git SHA, backend/BFF as byte-identical image digests, web rebuilt from the same source SHA (Next.js public env vars are build-time, see D8). Terraform lives in this repo (`infra/terraform/`) with its own pipeline. Database migrations run as a dedicated pipeline stage (Cloud Run Job) separate from app deploys. Observability covers all three pillars (logs, metrics, traces) via OpenTelemetry + a collector sidecar — vendor-neutral instrumentation, GCP-managed storage, zero VMs.
**Depends on:** M13 (dashboard frontend complete)
**Supersedes:** M14, M15, M16 (all stories reconciled against the implemented codebase as of 2026-07-07 and merged here; the original files remain as historical reference with supersession notes)

---

## 0. Decisions Log (agreed 2026-07-07 — do not re-litigate; raise a doc bug if code contradicts these)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Cloud Run for everything** — backend, BFF, web as services; migrations as a Cloud Run Job. **No Cloud Functions/lambdas, no VMs.** | Existing Dockerfiles run as-is; scale-to-zero gives lambda economics without rewriting NestJS/Next.js into function handlers. |
| D2 | **Pub/Sub push subscriptions** in cloud (adapter gains a push-receiver mode; streaming pull stays for local emulator). | The current adapter uses streaming pull (`subscription.on('message')`) which requires an always-on instance. Push = true scale-to-zero in both envs, Pub/Sub-managed retry/DLQ, OIDC-authenticated delivery. |
| D3 | **Cron via Cloud Scheduler → Pub/Sub → push**, dispatched through the *same* shared `/pubsub/push` receiver as domain events (D2) — not a separate guard on the `/cron/*` controllers. Cron ticks travel on a distinct trigger channel (not a `DomainEvent`), since a tick has no real `tenantId`. `/cron/*` controllers become thin publishers, kept for local/manual triggering only. | Scheduler cannot reach an internal-ingress Cloud Run service over HTTP; Pub/Sub push can. One push-guarded endpoint instead of three keeps the OIDC-guard surface minimal and local dev/prod on one code path (2026-07-09 discovery, see S03). `CRON_SECRET` on the BFF becomes unused in cloud. |
| D4 | **Backend is internal-ingress only.** No public URL, no Cloud Armor + IAP stack (old M15-S12 is cut). | Three layers already exist: internal ingress (network) + `InternalApiGuard` shared secret (M115-S03) + `PLATFORM_ADMIN_KEY` timing-safe check (M02-S05). Operator access via IAM-authenticated `gcloud run services proxy`. |
| D5 | **Edge (prod only): Cloudflare (DNS/CDN/WAF/SSL, free plan) → GCP Global External ALB with serverless NEGs → web + BFF.** Staging uses raw `*.run.app` URLs (no LB) to stay in budget. | Cloudflare free can't rewrite the Host header, so it cannot point at `*.run.app` directly; the ALB is required for custom domains. Staging LB would add ~$18/mo for no launch value. |
| D6 | **No SA JSON keys anywhere.** CI authenticates via Workload Identity Federation (OIDC). | Keyless = nothing to leak or rotate. Paired with an org policy disabling SA key creation. |
| D7 | **Direct VPC egress** for Cloud Run (no Serverless VPC Access connector). | Connector = always-on billed instances (~$8–15/mo/env); direct egress is GA and free. |
| D8 | **Single Artifact Registry in `ikaro-prod`;** staging deployer has read+write, so the *same image SHA* validated in staging is promoted to prod (backend/BFF). | Matches docs/23. Exception: the **web** image is built per environment because `NEXT_PUBLIC_*` vars are inlined at build time (see M17-S26). |
| D9 | **Observability: OTel SDK (OTLP-only in code) → otel-collector sidecar → GCP managed backends** (Cloud Trace, Cloud Monitoring, Cloud Logging). No Grafana VM at launch. Scope (2026-07-08): OTel covers backend + BFF; **web ships no OTel at launch** — its observability is Cloud Run built-in metrics + structured logs. | All 3 pillars from day one at ~$0. The only vendor coupling is one exporter block in the collector YAML — swapping to self-hosted Grafana/Tempo/Loki or another vendor is a config change + `terraform apply`, zero code. |
| D10 | **4 GitHub environments** (`staging`, `production`, `staging-infrastructure`, `production-infrastructure`), not 11. Solo reviewer: repository owner. | One approval covers a whole prod deploy (migrations + 3 services). Per-service environments = 4 approvals per deploy with no security gain for a solo operator. |
| D11 | **Domain: `ikaro.online`** (owned). Prod: `ikaro.online` (web + path-based hotsites `/{slug}`), `bff.ikaro.online` (BFF). | Subdomains share the `ikaro.online` site → cookies flow same-site between web and BFF with `SameSite=Lax`. |
| D12 | **Budget: ~$50/month total as a design target, not a hard cap** (staging + prod, pre-traffic). Billing alerts at $25/$50/$75. Security controls may exceed the target with documented rationale (e.g. S36 origin lockdown → worst case ~$52); expensive scaling items (e.g. S46 MCP) stay metrics-gated. | Drives: db-f1-micro both envs at launch (prod upgrades via a tfvars change when the first paying tenant lands), no staging LB, scale-to-zero everywhere, 10% prod trace sampling. Named tradeoff (2026-07-07): shared-core tiers (`db-f1-micro`, `db-g1-small`) are **excluded from the Cloud SQL SLA** — SLA coverage begins at dedicated-core tiers (S13 ladder rung 2); accepted pre-traffic. |
| D13 | **HashiCorp agent-skills** vendored into `.claude/skills/` before any HCL is written. | Terraform authored to HashiCorp's published module/style conventions from day one. |

### Anti-lock-in guardrails (enforced across all stories)
1. Application code never imports `@google-cloud/*` outside an adapter in an `infrastructure/` layer (the Pub/Sub and GCS adapters are the only existing cases — keep it that way).
2. Telemetry leaves the app **only** as OTLP or structured-JSON stdout. Vendor exporters live exclusively in the collector config.
3. No Pub/Sub-exclusive features (ordering keys, exactly-once) without a `PORTABILITY:` comment in the adapter.
4. Postgres stays plain Postgres — no Cloud SQL-specific extensions.

### Portability ledger (what is GCP-specific, what the boundary is, and why we accepted it)

| Decision | GCP-specific part | Portable boundary | Migration cost | Accepted because |
|---|---|---|---|---|
| Pub/Sub push (D2) | topics/subs/DLQ/OIDC push | `IEventBus` port + one adapter + push guard | ~weeks (new adapter, e.g. Service Bus/SNS-SQS) | port confines damage; push is the only $0-idle option |
| Cloud Run (D1) | service/job definitions | plain Docker images | ~days (any container runtime) | containers, not Terraform, carry the portability |
| Cloud SQL private networking | PSA peering, auth proxy | plain Postgres 15 + `pg_dump` | ~days | zero engine-specific features (guardrail 4) |
| Cloud Run Jobs (migrations) | job trigger plumbing | `typeorm migration:run` in the image | ~hours (any runner with DB access) | trivial surface |
| Cloud Monitoring/Trace (D9) | dashboards, alert policies, exporter YAML block | OTLP + collector config + structured stdout | ~days (swap exporter, rebuild dashboards) | dashboards are cheap; instrumentation is the expensive part and stays portable |
| Secret Manager | secret refs in Cloud Run | env-var contract in `env.validation.ts` | ~hours | apps read env vars, not SM APIs |
| WIF / IAM | bindings | OIDC federation concept (exists on AWS/Azure) | rework, concepts map 1:1 | keyless > portable-but-leakable keys |
| Cloudflare (core: DNS/CDN/WAF) | none (cloud-neutral) | — | zero | fronts any origin |
| Cloudflare for SaaS (S40) | custom-hostname + cert issuance API | tenant `custom_domain` data + verification port live in the app | ~days (Fastly/edge equivalent, or ALB certs per domain) | custom-hostname SSL is inherently edge-provider-specific; accepted |
| Brevo (was SendGrid — switched 2026-07-15, S10: SendGrid rejected the account during compliance vetting, and had separately retired its free plan) | delivery API (SMTP relay) | M11 email port — provider-specific types confined to its adapter (`EMAIL_ADAPTER` switches, tracked as `td/TD26-BREVO-EMAIL-ADAPTER.md`) | ~hours (SES/Resend/Mailgun/SMTP adapter) | port already exists; cheapest swap in the stack |

---

## 1. Target Architecture

```
                         ┌────────────────────────── PROD ───────────────────────────┐
 Internet ──► Cloudflare │ (DNS · CDN · WAF · DDoS · Universal SSL — free plan)      │
                  │      └────────────────────────────────────────────────────────────┘
                  ▼
        GCP Global External ALB  (serverless NEGs; Cloud Armor origin lockdown: allow only Cloudflare IPs)
            │ ikaro.online              │ bff.ikaro.online
            ▼                           ▼
        Cloud Run: ikaro-web        Cloud Run: ikaro-bff          (both scale-to-zero)
                                        │ VPC direct egress + InternalApiGuard
                                        ▼
                                Cloud Run: ikaro-backend  (ingress: internal-only, scale-to-zero)
                                    │            │                    ▲
                       private IP   │            │ publish            │ OIDC push (events + cron)
                                    ▼            ▼                    │
                             Cloud SQL PG15   Pub/Sub topics ──► push subscriptions (+ DLQs)
                             (private, SSL)        ▲
                                                   │ publish
 GCS buckets (uploads private / hotsite public)  Cloud Scheduler (cron → Pub/Sub)
 Secret Manager (all secrets)                    Cloud Run Job: ikaro-migrate (CI-triggered)

 Each Cloud Run service = app container + otel-collector sidecar (OTLP in → Cloud Trace/Monitoring out)
 Logs: structured JSON stdout → Cloud Logging (automatic). CI → GCP: Workload Identity Federation.
 STAGING: same minus Cloudflare/ALB — services on *.run.app URLs (web/BFF public, backend internal).
```

### Hostnames & URLs

| Env | web | BFF | backend |
|---|---|---|---|
| staging | `https://ikaro-web-<hash>-rj.a.run.app` | `https://ikaro-bff-<hash>-rj.a.run.app` | internal only |
| prod | `https://ikaro.online` | `https://bff.ikaro.online` | internal only |

> **Staging cookie caveat (accepted):** web and BFF on `*.run.app` are different *sites* (`run.app` is on the Public Suffix List), so the BFF auth cookie is third-party there. Works in Chrome (current default policy); blocked in Safari/strict modes. Solo-dev testing on Chrome is fine. Escape hatch if it ever blocks work: instantiate the edge module for staging (+~$18/mo) — config-only.

### Cost model (pre-traffic estimate)

| Item | Staging | Prod |
|---|---|---|
| Cloud SQL db-f1-micro + 10GB | ~$9 | ~$9 (upgrade path: `db_tier` var → `db-g1-small` ~$26) |
| Cloud Run ×3 + sidecars (scale-to-zero) | ~$0–2 | ~$0–5 |
| Global ALB forwarding rule | — | ~$18 |
| Pub/Sub, GCS, Secret Manager, Scheduler | <$1 | <$2 |
| Cloud Logging/Trace/Monitoring (free tiers) | ~$0 | ~$0–3 |
| Cloudflare free plan | — | $0 |
| Cloud Armor origin lockdown (S36, prod from go-live) | — | ~$6–8 |
| **Total ≈ $10–12** | | **≈ $34–45** |

---

## 2. Security Model (read before implementing any story)

| Surface | Control |
|---|---|
| Human access (dev/operator) | Google account + **2FA enforced**; `gcloud auth login`; per-resource IAM. **No VPN, no SSH, no bastion** — there is nothing to SSH into. All access lands in Cloud Audit Logs. |
| Developer → Cloud SQL | Cloud SQL Auth Proxy (IAM-authenticated, TLS). DB has no public IP. |
| Developer → internal backend | `gcloud run services proxy ikaro-backend --region=southamerica-east1` (IAM-authenticated tunnel). Used for tenant provisioning (UC-024). |
| CI → GCP | Workload Identity Federation scoped to `repository == lmmoreira/ikaro` + branch conditions. Zero long-lived keys; org policy blocks SA key creation. |
| BFF → backend | VPC direct egress (**`ALL_TRAFFIC`** — `*.run.app` resolves to public IPs; private-ranges-only egress would bypass the VPC and internal ingress would reject the call) → internal ingress + Cloud Run IAM ID token (S47) + `InternalApiGuard` (`INTERNAL_API_KEY`, M115-S03). |
| Pub/Sub → backend | Push with Google-signed **OIDC token**; backend guard verifies issuer, audience, and the invoker SA email. |
| Secrets | Secret Manager only. Values **never** in Terraform state, tfvars, git, or CI logs — **no exceptions** (decision revised 2026-07-07: an earlier draft had Terraform generate `db-password`; rejected because `tf-planner` credentials are PR-mintable and read state, so any secret in state is readable from a tampered PR workflow). Terraform creates secret containers + IAM only; all values — including the DB password — are populated via the tightly-scoped activation runbooks (S27/S37). Runtime injection via secret references. |
| Edge | Cloudflare proxy (DDoS/WAF) in front of ALB; Cloud Armor rule restricting the ALB to Cloudflare IP ranges, enabled at go-live (M17-S36). |
| Dev-auth bypass | `ENABLE_DEV_AUTH=true` only in staging; BFF refuses to start with it when `APP_ENV=production` (M17-S06 — `APP_ENV`, not `NODE_ENV`: both cloud envs build with `NODE_ENV=production`). |
| Tenant provisioning | internal ingress + IAM proxy + `PLATFORM_ADMIN_KEY` (timing-safe, sent via `X-Platform-Admin-Key` — S52: the `Authorization` header is owned by the proxy's injected IAM ID token) + strict rate limit. |
| IAM bindings in Terraform | Every `google_*_iam_member`/`_binding`/`_policy` resource must carry an explicit, deliberately-reviewed `member`/`members` value — never `allUsers`/`allAuthenticatedUsers`/an external-domain principal without that being the specific point of the resource (e.g. `modules/storage`'s public hotsite bucket, M17-S14). Do not assume an org-level policy will catch a mistake — current org-policy state lives in the gitignored, operator-local `docs/BOOTSTRAP_LOG.md`, not in this repo's public history. |

---

## 3. Waves Overview

| Wave | Stories | Theme | Cloud cost? |
|---|---|---|---|
| 0 | S01–S06, S30, S32, S47, S52 | App prerequisites (all local, no accounts needed) | No |
| 1 | S07–S10, S48 | Accounts & Day-0 bootstrap (GCP, Cloudflare, OAuth, Brevo) + legacy-doc banners | Starts |
| 2 | S11–S22 | Terraform: modules + staging/prod envs | Yes |
| 3 | S23–S26 | Pipelines: infra, staging deploy, prod promote | Yes |
| 4 | S27–S28 | Staging live + E2E against staging | Yes |
| 5 | S29, S31, S33–S36, S49–S50 | Hardening + observability + DR & governance | Yes |
| 6 | S37 | Production go-live | Yes |
| 7 | S38–S46, S51 | Post-launch product: custom domains, edge caching, photo cost/LGPD controls, docs refresh, managed connection pooling, LGPD lifecycle | Yes |

Waves are strictly sequential; stories inside a wave may run in the listed order (some are parallelizable — noted per story). Every story follows the standard workflow: `/story-discovery M17-SXX` → branch → implement → `/pre-pr` → PR.

> **Living source of truth rule (anti-drift, added 2026-07-07):** until S42 retires this file into the permanent docs, **M17 is the current-truth document** (S48's banners point here). Any story whose implementation diverges from §0–§2 or from its own story text — a changed WIF attribute shape, a different probe timing, a renamed resource — must update this file **in the same PR** (doc gate applies). The legacy docs get one full rewrite at S42, after reality is settled; this file must never be wrong in the meantime.

---

## Wave 0 — App prerequisites (local only)

---

### M17-S01 — Vendor HashiCorp agent-skills for Terraform ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** none (external: https://github.com/hashicorp/agent-skills)

**Description:**
Before any HCL is written, vendor HashiCorp's official agent skills into this repo so all Terraform stories are authored to professional conventions (module structure, style guide, plan review discipline).

**Steps:**
1. Clone `hashicorp/agent-skills`; review the available skills and select the Terraform-relevant ones (style/authoring, module structure, plan review — exact set per what the repo ships at implementation time).
2. Copy the selected skill folders into `.claude/skills/<skill-name>/` (vendored copy, not a submodule — pin the upstream commit hash in a `VENDORED_FROM.md` inside each skill folder).
3. Register the skills in `CLAUDE.md` §17 table and add a row to §10: “Writing Terraform / infra code → load the vendored HashiCorp Terraform skills + `plan/M17-CLOUD-DEPLOY.md` §0–§2”.
4. Do NOT modify skill content — vendored verbatim so upstream diffs stay reviewable.

**Acceptance criteria:**
- [ ] Skills appear in the available-skills list of a fresh Claude Code session
- [ ] Each vendored folder contains `VENDORED_FROM.md` with upstream repo URL + commit SHA
- [ ] `CLAUDE.md` §10 and §17 updated (this file edit requires the usual doc-gate approval)
- [ ] No skill content edited

**Dependencies:** none

---

### M17-S02 — Pub/Sub push-receiver mode in the event bus adapter ✅ Done

**Agent:** `backend-ts`
**Complexity:** L
**Docs to load:** `docs/03-DOMAIN_EVENTS.md`, `docs/ENGINEERING_RULES.md` (event handler rules), `docs/CODE_STANDARDS.md`

**Description:**
`GcpPubSubEventBusAdapter` (`apps/backend/src/shared/infrastructure/gcp-pubsub-event-bus.adapter.ts`) consumes via streaming pull, which requires an always-on instance. Add a **push mode**: Pub/Sub POSTs each message to an HTTP endpoint on the backend; the adapter dispatches to the same registered handlers. Pull mode remains for local dev (emulator has full push support limitations; pull is simpler locally).

**What to implement:**
1. **Mode switch:** env `PUBSUB_CONSUMER_MODE=pull|push` (default `pull`; validated in `env.validation.ts`). In `push` mode, `onApplicationBootstrap` does NOT open streaming-pull subscriptions; it only builds the handler registry keyed by subscription name.
2. **Push endpoint:** `POST /pubsub/push` controller in `apps/backend/src/shared/infrastructure/` (composition-only; delegates to the adapter). Pub/Sub push body format:
   ```json
   { "message": { "data": "<base64 envelope>", "messageId": "…", "attributes": {}, "deliveryAttempt": 3 }, "subscription": "projects/<p>/subscriptions/ikaro-BookingCompleted-loyalty" }
   ```
   Decode base64 → the existing event envelope JSON → route to the handler registered for that subscription name (strip the `projects/<p>/subscriptions/` prefix). Return `204` on success (ack); rethrow → `5xx` (nack → Pub/Sub retries → DLQ after max attempts). Handler idempotency via `eventId` dedup already exists in use cases — unchanged.
3. **`PubSubPushGuard`** (new, in `src/shared/guards/`): verifies the `Authorization: Bearer <OIDC>` token Google attaches to push requests — signature against Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`), `iss` = `https://accounts.google.com`, `aud` = the push endpoint URL (env `PUBSUB_PUSH_AUDIENCE`), `email` = expected invoker SA (env `PUBSUB_PUSH_SERVICE_ACCOUNT`) and `email_verified=true`. Use `google-auth-library`'s `OAuth2Client.verifyIdToken` (already a transitive dep of `@google-cloud/pubsub`; add as direct dep). Guard rejects with `403` Problem Detail on any failure. Applied only to `/pubsub/push` (and `/cron/*` after S03). `InternalApiGuard` must exempt this route — it carries an OIDC token, not `INTERNAL_API_KEY`. **No existing exemption pattern to reuse** (discovery, 2026-07-09): `InternalApiGuard` is a global `APP_GUARD` with zero path exemptions today, and `/health/*` currently (incorrectly) requires `X-Internal-Key` too. Add a `@Public()` decorator (`SetMetadata('isPublic', true)`) checked via `Reflector` inside `InternalApiGuard.canActivate()`; apply it to both `HealthController` (closing that pre-existing gap) and `PubSubPushController` (whose real auth is `PubSubPushGuard`, not the shared-secret guard).
4. **Publish-side attribute:** ensure `publish()` sets `eventName` as a message attribute (needed for observability/filtering; verify — add if missing).
5. **`PUBSUB_AUTO_CREATE`:** already env-controlled — in push mode auto-create must be OFF (Terraform pre-provisions everything); assert at bootstrap that `push` + `PUBSUB_AUTO_CREATE=true` is a startup error. **Also (discovery, 2026-07-09):** `APP_ENV !== 'local'` + `PUBSUB_AUTO_CREATE=true` is its own separate startup error, regardless of consumer mode — a pull-mode staging/production env must never auto-create either, since Terraform owns all Pub/Sub resources there once deployed. This is broader than the push-mode check above and doesn't wait on S06's `NODE_ENV`-keyed rules.
6. **Retry/DLQ ownership moves to Pub/Sub in push mode:** the adapter's app-level delivery-attempt logic (`PUBSUB_MAX_DELIVERY_ATTEMPTS`) must be inert in push mode — Pub/Sub's subscription retry policy + dead-letter config (S19) own retries; app-level attempt counting on top would double-dead-letter. Guard: `push` mode ignores the var (log a warning if set) and the handler simply acks (2xx) or nacks (5xx).
7. **`APP_ENV` (moved up from S06 — discovery, 2026-07-09):** add `APP_ENV=local|staging|production` (validated enum, default `local`) to the backend env schema in this story. S06 was already going to introduce this to distinguish staging from prod (`NODE_ENV=production` is shared by both cloud envs and can't make that distinction) — S02 needs it now to gate guard enforcement below without relying on the `NODE_ENV` coincidence. S06 no longer introduces the enum itself (see S06 cross-reference).
8. **Guard enforcement derived from `APP_ENV` (no separate toggle — discovery, 2026-07-09):** `PubSubPushGuard` short-circuits to allow whenever `APP_ENV === 'local'`; OIDC verification only runs when `APP_ENV !== 'local'` (staging/production). No settable override var — nothing to misconfigure, no startup-error rule needed. This is what lets a developer `curl` `/pubsub/push` locally with a hand-built synthetic envelope, without a real Google-signed OIDC token. S03 reuses the same guard (and the same `APP_ENV` derivation) for `/cron/*`.
9. **`PORTABILITY:` comment:** per anti-lock-in guardrail #3 (§0 Decisions Log), add a `PORTABILITY:` comment on the push-mode branch in the adapter, referencing the D2 ledger row — push mode is inherently Pub/Sub-shaped; the `IEventBus` port + this single adapter confine the migration cost.

**Security notes:** the push endpoint is on the internal-ingress backend AND OIDC-verified — two layers. Never trust the `subscription` field for auth (it is attacker-controllable in principle); auth comes exclusively from the OIDC token.

**Testing:** unit tests for the guard (valid/expired/wrong-aud/wrong-email tokens — use a stubbed verifier port so no network); integration test posting a synthetic push envelope through the endpoint with the guard overridden, asserting the correct use case fires; pull-mode integration tests unchanged and still green. Add a 4th row to `docs/ENGINEERING_RULES.md`'s Event Handlers test-wiring table documenting this pattern (push-endpoint integration spec: guard overridden via DI, synthetic envelope posted through supertest) — the existing table only covers handler unit / story integration / controller integration specs.

**Acceptance criteria:**
- [ ] `PUBSUB_CONSUMER_MODE=push` → no streaming pull opened; `POST /pubsub/push` routes messages to the correct handler by subscription name
- [ ] Handler throw → `5xx` response (message will be redelivered); success → `204`
- [ ] Guard rejects: missing token, bad signature, wrong `aud`, wrong SA email → `403` Problem Detail
- [ ] `push` + `PUBSUB_AUTO_CREATE=true` fails startup with a clear error
- [ ] `APP_ENV !== 'local'` + `PUBSUB_AUTO_CREATE=true` fails startup with a clear error, even in pull mode
- [ ] Local dev (`pnpm dev`, emulator) untouched: pull mode default, all existing integration tests pass
- [ ] No `@google-cloud/*` import outside the adapter/guard infrastructure files
- [ ] `APP_ENV` enum (`local|staging|production`, default `local`) validated in backend `env.validation.ts`
- [ ] `/health/*` reachable without `X-Internal-Key` (via `@Public()`); `/pubsub/push` reachable without `X-Internal-Key` but still rejects without a valid OIDC token when `APP_ENV != local`

**Dependencies:** none (parallelizable with S04–S05)

---

### M17-S03 — Cron delivery via Scheduler → Pub/Sub → trigger handlers ✅ Done

**Agent:** `backend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-018/019/020, M11 IA file, S02 implementation (`PubSubPushGuard`, `PubSubPushController`, `GcpPubSubEventBusAdapter`), `docs/ENGINEERING_RULES.md` § Event Handlers (test-wiring table) + § `RequestContext` is HTTP-request-scoped only (`*.job.ts` category)

**Description:**
The cron controllers already exist on the backend (`cron-booking.controller.ts` → `POST /cron/reminders`; `cron-loyalty.controller.ts`) but their in-code comments (“MVP: no auth guard”) are stale — both already sit behind the global `InternalApiGuard`. Rather than bolting `PubSubPushGuard` onto these controllers directly (a second push-consuming code path parallel to S02’s `/pubsub/push`), cron reuses the *same* shared push receiver: Scheduler publishes to a cron topic → push subscription → `/pubsub/push` → routed by subscription name to a trigger handler, exactly like a domain event (2026-07-09 discovery — the original design in this section pointed push subscriptions directly at the cron controllers; corrected here before any Terraform or guard code existed for that shape).

A cron tick is not a domain event, though — it carries no `tenantId` (the job itself fans out across all tenants internally) and no business fact, only “run now.” Modeling it as a `DomainEvent` subclass (even a `tenantId`-optional one) would let a sentinel/fake tenant leak into logging, OTel span attributes, and DLQ payloads that assume every `DomainEvent` carries a real tenant — a real tension with §2 invariant #3 even if scoped to a subclass. Instead, a **third, dedicated port** — `ITriggerBus` (`TRIGGER_BUS` token) — carries `registerTrigger(name, handler)` / `publishTrigger(name)`, mirroring exactly why `IPushableEventBus` is already kept separate from `IEventBus` (`pushable-event-bus.port.ts:3-6`: “not a general event-bus capability every `IEventBus` implementation needs to support”). `GcpPubSubEventBusAdapter` implements all three ports; `app.module.ts` aliases `TRIGGER_BUS` to `EVENT_BUS` via `useExisting`, same pattern as `PUSHABLE_EVENT_BUS` (`app.module.ts:67`). `dispatchPushMessage` checks the trigger map by subscription name before falling into the `DomainEvent`-typed path. Local dev (pull mode) and prod (push mode) both exercise this identical path: the cron controllers become thin publishers (`publishTrigger(...)`) instead of calling jobs directly, so a local `curl` and a real Cloud Scheduler tick run through the exact same wiring — no parallel implementation to drift apart.

`BookingReminderJob` and `AdminScheduleReminderJob` (bundled today under one `/cron/reminders` call) are independent — verified in code: disjoint tenant loops, own `correlationId`, own published event, no shared state or ordering dependency. Same for loyalty’s `ExpirePointsUseCase`/`NotifyExpiringPointsUseCase` (bundled under `cron-loyalty.controller.ts`): disjoint time windows (past-due vs. not-yet-due), no shared state. Each becomes its own trigger handler — satisfies the “handler calls exactly one use case” rule (§7) and gives each independent Pub/Sub retry/DLQ isolation. This also fixes a latent bug in today’s bundled design: if `BookingReminderJob.run()` throws mid-loop, `AdminScheduleReminderJob.run()` never runs at all for that invocation (sequential `await` in one controller method, no isolation).

**Job-pattern unification (2026-07-09 discovery):** `docs/ENGINEERING_RULES.md:104` already documents “Cron jobs (`*.job.ts`)” as a distinct invocation-context category (alongside event handlers) — but only `booking/application/jobs/` actually follows it; loyalty’s two cron-triggered pieces are named/located like ordinary use cases even though neither `findExpiringBefore(date)` nor `findExpiringSoon(from, to)` takes a `tenantId` (both are already genuine cross-tenant fan-out queries, architecturally identical to the booking jobs’ `tenantPort.findAllActive()` loop — they’re shaped like jobs today, just misnamed). Blast radius checked: `ExpirePointsUseCase`/`NotifyExpiringPointsUseCase` are referenced only in `loyalty.module.ts` and `cron-loyalty.controller.ts` — both already being touched by this story. Rename and relocate to match booking’s flat-file layout exactly, including the injectable-clock signature:
- `application/use-cases/expire-points/expire-points.use-case.ts` → `application/jobs/expire-points.job.ts`, class `ExpirePointsUseCase` → `ExpirePointsJob`, `execute()` → `run(now: Date = new Date())`
- `application/use-cases/notify-expiring-points/notify-expiring-points.use-case.ts` → `application/jobs/notify-expiring-points.job.ts`, class `NotifyExpiringPointsUseCase` → `NotifyExpiringPointsJob`, `execute(warningDays?)` → `run(now: Date = new Date(), warningDays?: number)`

**What to implement:**
1. **`ITriggerBus` port + adapter:** new port (`registerTrigger(name: string, handler: () => Promise<void>)`, `publishTrigger(name: string)`), implemented by `GcpPubSubEventBusAdapter`, aliased via `useExisting` in `app.module.ts` (mirrors `PUSHABLE_EVENT_BUS`). `dispatchPushMessage` checks the trigger map by subscription name before the `DomainEvent`-typed path. Local pull mode: `onApplicationBootstrap` opens a pull subscription per registered trigger the same way it does per domain-event subscription.
2. **Job-pattern unification:** rename/relocate/re-parameterize `ExpirePointsUseCase`→`ExpirePointsJob` and `NotifyExpiringPointsUseCase`→`NotifyExpiringPointsJob` per above, update `loyalty.module.ts` registration and both jobs’ spec files.
3. **Four trigger handlers** (one job each; `handle()` calls it and rethrows, zero domain logic):
   - `BookingReminderTriggerHandler` (trigger `cron-reminders`, consumer `booking-reminder`) → `bookingReminderJob.run()`
   - `AdminScheduleReminderTriggerHandler` (trigger `cron-reminders`, consumer `booking-admin-schedule-reminder`) → `adminScheduleReminderJob.run()`
   - `ExpirePointsTriggerHandler` (trigger `cron-loyalty-expiry`, consumer `loyalty-expire-points`) → `expirePointsJob.run()`
   - `NotifyExpiringPointsTriggerHandler` (trigger `cron-loyalty-expiry-warning`, consumer `loyalty-notify-expiring-points`) → `notifyExpiringPointsJob.run()`

   **Loyalty gets two distinct triggers, not one (2026-07-09 discovery, mid-implementation):** the pre-M17 docs (`docs/03-DOMAIN_EVENTS.md`) had actual point expiry running **daily** (02:00 UTC) and the expiry-*warning* running **weekly** (Mondays 06:00 UTC) — two different Scheduler jobs. An earlier draft of this story and of S21 collapsed both onto one weekly trigger, which would have silently regressed expiry from daily to weekly (an already-expired entry staying visible/spendable in a customer's balance for up to 6 extra days). Corrected: `cron-loyalty-expiry` stays daily (`ExpirePointsTriggerHandler` only), `cron-loyalty-expiry-warning` is the new weekly trigger (`NotifyExpiringPointsTriggerHandler` only). See S21 for the corrected Scheduler cadences.
4. **Cron controllers become publishers:** `CronBookingController.reminders()` → `triggerBus.publishTrigger('cron-reminders')`, returns `{ ok: true }` once published (not once the jobs complete). `CronLoyaltyController.runExpiry()` → `triggerBus.publishTrigger('cron-loyalty-expiry')`; `CronLoyaltyController.runExpiryWarning()` → `triggerBus.publishTrigger('cron-loyalty-expiry-warning')` — two different triggers, matching the two different Scheduler cadences. No `PubSubPushGuard` on these controllers — they stay behind the existing global `InternalApiGuard`, used only as the local/manual trigger path. Delete `cron-booking.controller.spec.ts`’s job-ordering test (`runs booking job before admin job`) — no ordering guarantee once the two jobs are independently-triggered handlers.
5. **Test doubles:** add trigger support to `apps/backend/src/test/infrastructure/in-memory-event-bus.ts` (no-op recorder) and `routing-in-memory-event-bus.ts` (real dispatch-to-handler routing, for integration specs). Add a row to `docs/ENGINEERING_RULES.md`’s “Test wiring for event handlers” table for the trigger-handler pattern (same table S02 added its push-endpoint row to).
6. **Idempotency — deliberately dropped, not deferred quietly (2026-07-10 discovery):** an earlier draft of this story added a `cron_run_log` table (booking + loyalty, `hasRun`/`markRun`) as a coarse per-tenant/day dedup gate. On review it turned out to be a false guarantee: `markRun()` can never be atomic with the `eventBus.publish()` calls it's meant to gate (a Postgres transaction can't span a Pub/Sub publish — the classic dual-write problem), so the table only protected against a narrow crash-window race while doing nothing for the more likely case of two overlapping/concurrent deliveries both passing the `hasRun()` check before either writes `markRun()`. It also duplicated ~26 lines of near-identical repository code per context, which is what tripped SonarCloud's new-code duplication gate. Removed entirely — `BookingReminderJob`, `AdminScheduleReminderJob`, and `NotifyExpiringPointsJob` revert to their pre-M17 shape (no dedup gate), same as before this story. The real fix is a **transactional outbox + inbox pattern** (a `shared` schema, atomic by construction, covering all `eventBus.publish()` call sites, not just cron) — tracked as its own initiative in `td/TD24-OUTBOX-INBOX-PATTERN.md`, not bolted onto this story. **Closed (TD24-S03, landed):** all 3 jobs now construct a `Command` with a deterministic `dedupKey` and publish through `OUTBOX_PUBLISHER` inside a per-tenant-batch `txManager.run()` — a retried/overlapping delivery collapses to one outbox row via Postgres `UNIQUE(dedup_key)`, the atomic guarantee `cron_run_log` could never provide. See `td/TD24-OUTBOX-INBOX-PATTERN.md` §Design and S03's own integration tests for the mechanism.
7. Remove/deprecate `CRON_SECRET` on the BFF: it protects nothing anymore (cron never transits the BFF; confirmed zero enforcement usage in BFF source beyond `env.validation.ts`). Delete from `apps/bff/src/config/env.validation.ts` + `.env.example` + docs reference.
8. Local dev: document (README section) how to trigger cron locally — `curl -X POST localhost:3001/cron/reminders` publishes the trigger; the pull-mode consumer (already open per S02 local default) picks it up asynchronously. Note this now depends on the local Pub/Sub emulator being up, and the curl response no longer waits for job completion.
9. **Doc sweep (§7 DoD — this story changes the flow these docs describe):** `docs/03-DOMAIN_EVENTS.md:381-382,396`, `docs/14-API_CONTRACTS.md:939-969`, `docs/02-DOMAIN_MODEL.md:53,58,440`, `docs/QUICK_REFERENCE.md:189`, `docs/04-USE_CASES.md:658-662` all describe the old “Cloud Scheduler fires an authenticated HTTP POST directly at `/cron/*`” model — update to the Pub/Sub-trigger-channel model. `docs/23-INFRASTRUCTURE_SETUP.md` has the same stale content but is already banner-flagged under M17-S08 with its full rewrite deferred to S42 — no action there.

**Acceptance criteria:**
- [ ] `publishTrigger`/`registerTrigger` round-trip proven in both pull mode (local) and push mode (`/pubsub/push` routes by subscription name to the trigger handler, not the `DomainEvent` path)
- [ ] All four trigger handlers exist, each calling exactly one job
- [ ] `ExpirePointsJob`/`NotifyExpiringPointsJob` exist in `loyalty/application/jobs/`, matching booking’s file layout and `run(now, …)` signature; no remaining reference to the old `*UseCase` names (`grep -r ExpirePointsUseCase NotifyExpiringPointsUseCase`)
- [ ] `CronBookingController`/`CronLoyaltyController` publish triggers and no longer call jobs directly; still `InternalApiGuard`-protected, no `PubSubPushGuard`
- [ ] A failure in one handler (e.g. `BookingReminderTriggerHandler`) does not prevent the other’s subscription from being delivered/retried (spec proves isolation)
- [ ] `CRON_SECRET` removed from BFF env schema — no dangling references (`grep -r CRON_SECRET`)
- [ ] No `@google-cloud/*` import outside adapter/guard infrastructure files (trigger channel lives in the same adapter as the event channel)
- [ ] `InMemoryEventBus`/`RoutingInMemoryEventBus` support triggers; `docs/ENGINEERING_RULES.md` test-wiring table has a row for the pattern
- [ ] Doc sweep (item 9) complete — no live `docs/*.md` still describes direct Scheduler→HTTP cron delivery outside the already-banner-flagged S08 set

**Dependencies:** M17-S02

---

### M17-S04 — Real readiness checks (`/health/ready`) on all 3 services ✅ Done

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § health check contract

**Description:**
`HealthController` exists in backend and BFF but `/health/ready` is a stub (always `{status:'ok'}`). Cloud Run readiness/startup probes depend on it being real. (Absorbs old M14-S07.)

**Readiness chains all the way down, not just to the next hop's liveness (corrected 2026-07-10 during implementation review):** an earlier draft of this story had each service's `/health/ready` check only the *liveness* of the service one hop below (BFF → backend's `/health/live`; web → BFF's `/health/live`), reasoning that chaining `/ready` through `/ready` would cascade a single DB blip into pulling all three services out of rotation at once. That reasoning borrows from Kubernetes' continuous readiness-gated traffic pulling, which **Cloud Run does not have** — S18 confirms Cloud Run exposes only a startup probe (gates a *new* instance before it joins rotation) and a liveness probe (restarts the container on failure); a running instance that loses a downstream dependency is never pulled from rotation (Cloud Run can't do that — S35's uptime/alert stack is the mitigation). Since `/health/ready` is only ever consumed by (a) the startup gate and (b) external uptime-check alerting — never by continuous traffic-pulling — there is no cascading-blast-radius cost to chaining it all the way down, and doing so is strictly more useful: it makes each hop's readiness answer "can the whole chain beneath me serve a real request," which is exactly what a startup gate and an uptime alert need. `/health/live` stays untouched by this — dependency-free at every service, since it's the only signal that should ever trigger a Cloud Run restart.

**What to implement:**
- **backend `GET /health/ready`:** `@nestjs/terminus` — TypeORM ping (`SELECT 1`, 2s timeout). Return `503` with per-check detail when failing (sanitize the failure body — don't leak the raw indicator error message on this `@Public()` route; log full diagnostics server-side). Do NOT check Pub/Sub here (publisher is lazy; a Pub/Sub blip must not take the API out of rotation) — log-only.
- **BFF `GET /health/ready`:** HTTP check → `GET ${BACKEND_INTERNAL_URL}/health/ready` (2s timeout, chained — see above).
- **web:** Next.js route handlers `app/api/health/live/route.ts` (static 200) and `app/api/health/ready/route.ts` (checks `GET ${bff}/health/ready` server-side via the canonical server fetch helper — no auth needed for health). Keep route files thin per repo rules; extract any logic to `shared/lib/` with unit tests.
- All health routes: excluded from rate limiting (verify throttler skip), excluded from `InternalApiGuard`, and later excluded from tracing (S33 notes this).
- `/health/live` stays dependency-free on all services (process-up = 200) — never chained, never gated on anything downstream.

**Acceptance criteria:**
- [ ] Backend `/health/ready` → `503` when Postgres is stopped (`pnpm infra:down`), `200` when healthy; `/health/live` → `200` even with DB down
- [ ] BFF `/health/ready` → `503` when backend is down
- [ ] Web `/health/ready` → `503` when BFF is down
- [ ] All checks have explicit timeouts (no hanging probes)
- [ ] Unit/integration specs per service in the same commit

**Dependencies:** none (parallelizable)

---

### M17-S05 — AppLogger ↔ Cloud Logging alignment (vendor-neutral core) ✅ Done

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § logging contract

**Description:**
`packages/observability` `AppLogger` already emits structured JSON with `tenantId` + `correlationId` (AsyncLocalStorage). Align the output so Cloud Logging parses it natively, without making the logger GCP-dependent. (Absorbs old M14-S08; the “audit all call sites” part shrinks to a verification pass.)

**What to implement:**
1. Emit a top-level `severity` field (`DEBUG|INFO|WARNING|ERROR`) — Cloud Logging’s level field; keep the existing `level` field too (vendor-neutral consumers use it).
2. `message` as top-level string; ERROR logs include `metadata.stack`.
3. Trace correlation: when an active OTel span exists (after S33), add `logging.googleapis.com/trace: projects/${GCP_PROJECT}/traces/${traceId}` + `logging.googleapis.com/spanId`. Implement behind a tiny formatter hook so the GCP-specific field names live in ONE clearly-commented function (`// GCP-specific field names — swap here on vendor change`). `GCP_PROJECT` optional env; fields omitted when unset (local dev).
4. `LOG_LEVEL` env respected (`INFO` default, `DEBUG` dev).
5. Verification pass: `pnpm lint` zero `no-console`; spot-check that use cases/event handlers log start/completion with `tenantId` + `correlationId` (fix stragglers found — do not boil the ocean).

**Acceptance criteria:**
- [x] A log line in dev shows: `severity`, `level`, `message`, `service`, `tenantId`, `correlationId`, ISO timestamp
- [x] Trace fields appear only when a span is active AND `GCP_PROJECT` is set
- [x] GCP field names isolated to one function with the portability comment
- [x] `packages/observability` specs updated in the same commit

**Dependencies:** none (S33 later activates the trace fields)

---

### M17-S06 — Production environment guards ✅ Done

**Agent:** `backend-ts` + `bff-ts`
**Complexity:** S
**Docs to load:** M115 IA file (Dev Login), `docs/CODE_STANDARDS.md`

**Description:**
Codify “this must never run in production” rules as startup errors, so a copy-pasted env file can’t create a hole.

**`APP_ENV`** (fixes a real contradiction found in the 2026-07-07 full-plan review — **enum now introduced in M17-S02, not here**, discovery 2026-07-09): both cloud environments run `NODE_ENV=production` (that is how the Docker images are built — running Nest/Next otherwise is wrong), so `NODE_ENV` **cannot** distinguish staging from prod. `APP_ENV=local|staging|production` (validated enum, default `local`) was added to the **backend** schema in **M17-S02** (it needed the enum to gate `PubSubPushGuard` enforcement without relying on the `NODE_ENV` coincidence). This story adds the same enum to the **BFF** schema; `S18` sets it per environment for both apps. Environment-specific runtime policy keys on `APP_ENV`; `NODE_ENV` remains build/runtime mode only. Without this split, S27's `ENABLE_DEV_AUTH=true` in staging would trip rule 1 and the staging BFF would refuse to boot.

**Rules to enforce in `env.validation.ts` (Zod `superRefine`) of the respective app:**
1. **BFF:** `APP_ENV=production` + `ENABLE_DEV_AUTH=true` → startup error (staging explicitly allowed — E2E depends on it; verify whether M115-S02 added a `NODE_ENV`-based guard and migrate it to `APP_ENV`).
2. **backend:** `APP_ENV != local` + `PUBSUB_CONSUMER_MODE` ≠ `push` → startup error (staging/prod run push; pull outside local would silently drop events at scale-to-zero).
3. **backend:** `APP_ENV != local` + `EMAIL_ADAPTER=mailhog` → startup error (MailHog is local-only; no override var).
4. **both:** `JWT_SECRET` length ≥ 64 in production. Note (2026-07-08): the backend **base** schema currently enforces min 32 (`apps/backend/src/config/env.validation.ts`) while the BFF enforces 64 — tighten the backend base schema to 64 in this story (one shared secret, one rule; update `.env.example`), not just a prod `superRefine`.

(Rules dropped, discovery 2026-07-09: (a) `PUBSUB_PUSH_GUARD_ENFORCE` no longer exists — S02 derives guard enforcement directly from `APP_ENV !== 'local'` inside `PubSubPushGuard`, with no separate settable var, so there's nothing left to misconfigure here; (b) a separate `PUBSUB_AUTO_CREATE=true` rule keyed to `NODE_ENV` is unnecessary here — S02's `superRefine` already enforces the broader `APP_ENV !== 'local'` + `PUBSUB_AUTO_CREATE=true` → error, which covers both cloud envs regardless of consumer mode; re-adding a `NODE_ENV`-keyed version would be a pure duplicate.)

**Also in this story — `DB_POOL_SIZE` (backend):** add `DB_POOL_SIZE` to the backend env schema (optional int, default 10 for local dev) and wire it into the TypeORM datasource options (`poolSize`/`extra.max` — verify the exact option the pg driver honors in this TypeORM version). This is the serverless connection-math lever: every Cloud Run instance opens its own pool, so cloud envs set a small value (S18 sets `DB_POOL_SIZE=3`) to keep `max_instances × pool` under the DB tier's `max_connections`. See M17-S46 for the managed-pooling upgrade path.

**Acceptance criteria:**
- [ ] Each rule has a spec (valid prod env passes; each violation produces a descriptive startup error naming the offending var)
- [ ] `DB_POOL_SIZE` validated, defaulted, and demonstrably applied to the pg pool (spec or runtime assertion)
- [ ] `.env.example` files updated with the new vars and safe defaults
- [ ] No behavior change in dev/test modes

**Dependencies:** M17-S02 (`APP_ENV` enum + `PUBSUB_CONSUMER_MODE` var name exists), M17-S03 (cron var names exist)

---

### M17-S30 — Rate limiting finalization

> Moved from Wave 5 (2026-07-07 second review): pure app code with no cloud dependency — landing it before staging is publicly reachable closes the unthrottled window.

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § rate limiting

**Description:**
Preserved from old M16-S07 minus the Cloud Armor pairing (D4). Throttler is already wired in `app.module.ts` — finalize: public unauthenticated **60/min per IP**; authenticated **300/min per JWT sub**; `/auth/*` token issuance **10/min per IP**; `/health/*` and `/pubsub|cron` paths bypassed; backend’s `POST /internal/tenants` **3/hour** (enforced at the app layer via `PlatformAdminGuard` context — note the endpoint is internal-ingress + IAM-proxied anyway; the limit is brute-force insurance on `PLATFORM_ADMIN_KEY`). `429` responses are RFC 9457 with pt-BR detail; standard `X-RateLimit-*` headers. **Cloud Run caveat (document in code):** per-instance in-memory throttling is per-instance — with `max_instances` small this is acceptable at MVP; a shared store (Memorystore) is the documented scale-up path, not built now (FinOps).

**Client-IP extraction (added 2026-07-07 — per-IP tiers are useless or spoofable if this is wrong):** behind the prod chain (Cloudflare → ALB → Cloud Run) the socket peer is never the client. Resolve the throttle key in one env-selected helper (`APP_ENV`): **prod** keys on `CF-Connecting-IP` — trustworthy *only* because S36 origin lockdown guarantees traffic entered via Cloudflare (state the coupling in a code comment); **staging** (no Cloudflare/ALB) keys on the rightmost `X-Forwarded-For` hop, appended by Cloud Run's front end; the leftmost XFF value is attacker-controlled and must never be trusted. Unit-test all branches.

**Acceptance criteria:**
- [ ] 61st anonymous request in a minute → 429 Problem Detail (pt-BR)
- [ ] Authenticated limit keyed by JWT `sub`, not IP
- [ ] Health/push/cron paths never throttled (specs)
- [ ] Headers decrement correctly; specs for each tier
- [ ] IP-extraction helper specs: prod `CF-Connecting-IP`, staging rightmost-XFF, spoofed leftmost-XFF ignored

**Dependencies:** none (prod's trust in `CF-Connecting-IP` becomes real when S36 enables origin lockdown — a config/runtime concern, not a code dependency)

---

### M17-S32 — Signed OAuth `state` (CSRF) wrapping the existing payload

> Moved from Wave 5 (2026-07-07 second review): pure app code with no cloud dependency — closes a known CSRF hole before staging exposes the OAuth flow publicly.

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § security, `apps/bff/src/features/auth/oauth-state.ts`, `google.strategy.ts`

**Description:**
Old M16-S11 redesigned: `state` today carries functional routing data (`''`, `<slug>`, `__staff__`, `__staff__:<slug>`) with **no integrity/anti-CSRF protection**. Naively replacing it with a nonce breaks staff/tenant login routing. Instead: `state` becomes a short-lived signed JWT `{ loginType?, tenantSlug?, nonce: uuidv7() }` (5-min TTL) via the existing `JwtIssuerService`.

**What to implement:**
- `encodeOAuthState()` → returns the signed JWT; `decodeOAuthState()` → verifies signature + TTL, returns payload; invalid/expired/missing → `400` Problem Detail on the callback (never a silent fallback to customer flow — fail closed).
- Keep slug validation (`SLUG_REGEX`) inside the payload creation.
- Update `google.strategy.ts` + all `encodeOAuthState` call sites + specs (tampered token, expired token, missing state, valid staff and customer flows).

**Acceptance criteria:**
- [ ] Redirect to Google carries a JWT `state`; callback verifies it
- [ ] Tampered/expired/missing state → 400 (three specs)
- [ ] Staff login with `?tenantSlug=` still routes correctly end-to-end (existing E2E `hotsite-auth-bar.spec.ts` stays green)

**Dependencies:** none

---

### M17-S47 — BFF attaches Google ID tokens to backend calls (Cloud Run IAM auth)

**Agent:** `bff-ts`
**Complexity:** M
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, M115 IA § S03 (InternalApiGuard)

**Description:**
**Found in review (2026-07-07):** S18 sets the backend to `--no-allow-unauthenticated` (Cloud Run IAM layer), but the BFF currently authenticates only at the app layer (`X-Internal-Key`). Without a Google-signed ID token, every BFF→backend call would be rejected by Cloud Run **before** `InternalApiGuard` runs — staging would break at S27. This story adds the missing IAM leg while keeping `X-Internal-Key` as the second, app-layer defense.

**What to implement:**
1. `BACKEND_AUTH_MODE=none|iam` in BFF `env.validation.ts` (`none` default for local dev; startup guard: `NODE_ENV=production` requires `iam`).
2. In `iam` mode, the BFF's backend HTTP client attaches `Authorization: Bearer <ID token>` to **every** backend request — including the `/health/ready` dependency ping (S04). Use `google-auth-library`'s `getIdTokenClient(audience)` where `audience` = the backend's run.app URL (env `BACKEND_AUDIENCE`, defaulting to `BACKEND_INTERNAL_URL`); the library fetches tokens from the Cloud Run metadata server and caches/refreshes them automatically — no keys involved (the BFF's runtime SA identity is used; S17 already grants it `run.invoker` on the backend).
3. Wrap the token client behind a small port (`IIdentityTokenProvider`) so unit tests use an InMemory double and no `google-auth-library` import leaks outside the adapter (anti-lock-in guardrail 1).
4. Note the header layering: Cloud Run consumes `Authorization`; `X-Internal-Key` and actor headers (`X-Actor-*`) are untouched and continue to serve the app layer.

**Acceptance criteria:**
- [ ] `iam` mode: all backend calls (including readiness ping) carry a fresh ID token with the backend audience; expired tokens are transparently refreshed (spec via stubbed provider)
- [ ] `none` mode: behavior identical to today (local dev unaffected; all existing BFF specs green)
- [ ] `NODE_ENV=production` + `BACKEND_AUTH_MODE=none` → startup error (spec)
- [ ] No `google-auth-library` import outside the token-provider adapter
- [ ] `.env.example` updated

**Dependencies:** M17-S04 (readiness ping exists). **Blocker for M17-S18 and M17-S27** — without this, IAM-authenticated backend rejects all BFF traffic.

---

### M17-S52 — `PlatformAdminGuard` header migration (`X-Platform-Admin-Key`)

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** M02 IA § PlatformAdminGuard, `docs/CODE_STANDARDS.md`

**Description:**
**Found in review (2026-07-08):** `PlatformAdminGuard` reads the platform admin key from the `Authorization` header (`apps/backend/src/contexts/platform/infrastructure/guards/platform-admin.guard.ts`). In cloud, tenant provisioning goes through `gcloud run services proxy` (§2), which injects its own `Authorization: Bearer <IAM ID token>` into every forwarded request — the two uses of the header collide, and the S37 go-live runbook would fail at the first-tenant step. Move the key to a dedicated header **before** any cloud story depends on it.

**What to implement:**
1. `PlatformAdminGuard` reads `X-Platform-Admin-Key` (timing-safe comparison unchanged). No fallback to `Authorization` — one header, fail closed.
2. Update the guard specs, the internal-tenant controller unit + integration specs, and every doc/runbook snippet showing the provisioning curl (grep `PLATFORM_ADMIN_KEY` across `docs/` and this file).
3. Grep for any tooling sending the key via `Authorization` and migrate call sites.

**Acceptance criteria:**
- [ ] Guard accepts the key only via `X-Platform-Admin-Key`; an `Authorization`-borne key → 401 (spec)
- [ ] Timing-safe comparison preserved (spec)
- [ ] All docs/runbook snippets show the new header; `grep -rn "Authorization.*PLATFORM_ADMIN"` finds nothing
- [ ] Rate-limit behavior on the provisioning route (S30) unaffected

**Dependencies:** none (must land before M17-S27 exercises provisioning)

---

## Wave 1 — Accounts & Day-0 bootstrap (manual runbooks; cloud charges begin)

> Wave 1 stories are **runbooks**: manual steps executed once and documented. Output goes to `docs/BOOTSTRAP_LOG.md` (**gitignored** — contains real IDs/emails). Each story’s PR contains only the runbook/docs + `.gitignore` updates, never credentials.

---

### M17-S07 — Google Cloud account, organization, billing & budget alerts ✅ Done

**Agent:** `devops`
**Complexity:** M
**Docs to load:** none (greenfield)

**Description:**
Create the Google Cloud footprint from zero, with security posture set BEFORE any resource exists.

**Runbook steps:**
1. **Cloud Identity Free + Organization (recommended, do first):** sign up for Cloud Identity Free using `ikaro.online` (requires a TXT DNS verification — doable at the current registrar before Cloudflare migration). This creates a GCP **Organization**, which unlocks org policies (step 5) and clean IAM. Create an admin identity (e.g. `admin@ikaro.online`) — do not run the platform from a personal gmail.
2. **Enforce 2FA** on the admin account (authenticator app minimum; hardware key recommended). Document recovery codes storage (offline).
3. **Break-glass admin (moved from S50, 2026-07-07):** create a second admin identity now (e.g. `breakglass@ikaro.online`) — the lockout risk it covers is live from this story onward, not from Wave 5. Hardware security key, stored offline and physically separate from daily hardware; never used day-to-day; any use is written up. S50 writes the policy and runs the login+revoke drill.
4. **Billing account:** create, attach payment method.
5. **Budgets & alerts:** one budget for the billing account: alerts at **$25, $50 (target ceiling), $75** with email notifications; plus per-project budgets after S08.
6. **Org policies** (once org exists): `iam.disableServiceAccountKeyCreation` (enforce — pairs with D6), `iam.automaticIamGrantsForDefaultServiceAccounts` (disable), `compute.requireOsLogin` (defense in depth; no VMs planned). Document any policy that must be exempted later, with rationale.
7. **Secure-by-default policies on new orgs (review finding, 2026-07-08):** newly created Organizations ship with `iam.allowedPolicyMemberDomains` (Domain Restricted Sharing) and `storage.publicAccessPrevention` **enforced by default**. Two later stories break under them with opaque errors: S14's public hotsite bucket (`allUsers: objectViewer`) and S18's `--allow-unauthenticated` on BFF/web (allow-unauthenticated = an `allUsers` grant on `run.invoker`). Keep both enforced at org level and add **project-level exceptions** on `ikaro-staging`/`ikaro-prod`; record the exception commands in `BOOTSTRAP_LOG.md`. S14/S18 reference this step.
8. Install `gcloud` CLI locally; `gcloud auth login` as the admin identity.

**Acceptance criteria:**
- [ ] Organization exists rooted on `ikaro.online`; admin account has 2FA enforced
- [ ] Break-glass admin identity exists; hardware key stored offline (policy + drill land in S50)
- [ ] Budget alerts at $25/$50/$75 verified (send test notification)
- [ ] `iam.disableServiceAccountKeyCreation` enforced at org level
- [ ] Domain-restricted-sharing + public-access-prevention posture set per step 7; project-level exceptions documented (S14/S18 depend on them)
- [ ] `docs/BOOTSTRAP_LOG.md` created, gitignored, records every step with dates
- [ ] No resource created outside this runbook’s scope

**Dependencies:** none

---

### M17-S08 — GCP projects, APIs, Terraform state bucket & Workload Identity Federation ✅ Done

**Agent:** `devops`
**Complexity:** M
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` (reference only — M17 §0 wins on conflicts)

**Description:**
The chicken-and-egg bootstrap: the minimal manual resources Terraform itself needs. Everything else is Terraform (Wave 2).

**Runbook steps:**
1. Create projects `ikaro-staging` and `ikaro-prod` under the org; link billing; add per-project budgets ($15 staging / $40 prod).
2. Enable APIs on both: `run.googleapis.com`, `sqladmin.googleapis.com`, `pubsub.googleapis.com`, `secretmanager.googleapis.com`, `artifactregistry.googleapis.com`, `cloudscheduler.googleapis.com`, `compute.googleapis.com` (LB, prod), `servicenetworking.googleapis.com` (private SQL), `iamcredentials.googleapis.com` (WIF), `monitoring.googleapis.com`, `cloudtrace.googleapis.com`, `logging.googleapis.com`.
3. **State bucket:** `gs://ikaro-tfstate` in `ikaro-prod`, region `southamerica-east1`, **versioning ON**, uniform bucket-level access, public access prevention enforced. State prefixes: `envs/staging`, `envs/prod` (one state per env — never shared).
4. **CI service accounts — three per project, split by blast radius** (review finding, 2026-07-07). **No keys on any** (org policy blocks them):
   - `ikaro-tf-deployer@<project>` — Terraform applies only. Broad infra roles: `roles/run.admin`, `roles/cloudsql.admin`, `roles/pubsub.admin`, `roles/secretmanager.admin`, `roles/compute.networkAdmin`, `roles/iam.serviceAccountAdmin`, `roles/iam.serviceAccountUser`, `roles/storage.admin`, `roles/cloudscheduler.admin`, `roles/monitoring.editor` (prod one additionally `roles/artifactregistry.admin` on the shared registry). `roles/storage.objectAdmin` on the state bucket, **scoped by IAM condition to its own env prefix** (`resource.name.startsWith("projects/_/buckets/ikaro-tfstate/objects/envs/<env>")`) — the staging deployer is mintable from any merge to `main` with no approval, so unscoped access would let it tamper with prod state ahead of the next prod apply.
   - `ikaro-app-deployer@<project>` — app deploy pipelines only. Narrow: `roles/run.developer` (deploy/update services + execute jobs), `roles/artifactregistry.writer` on the shared registry, `roles/iam.serviceAccountUser` **only on the runtime SAs** (not project-wide).
   - `ikaro-tf-planner@<project>` — PR `terraform plan` only. Read-only: `roles/viewer` + `roles/storage.objectViewer` on the state bucket (+ `roles/secretmanager.viewer` for metadata). Cannot mutate anything — safe to expose to PR-triggered workflows.
5. **WIF:** in each project — pool `github-pool`, OIDC provider `github` (`https://token.actions.githubusercontent.com`), attribute mapping `attribute.repository=assertion.repository`, `attribute.ref=assertion.ref`, and a composite `attribute.repo_ref=assertion.repository + "@" + assertion.ref`; provider-level condition `assertion.repository == "lmmoreira/ikaro"`. Bindings (review finding — repo-only is too broad):
   - `tf-deployer` + `app-deployer`: `roles/iam.workloadIdentityUser` bound to `principalSet://…/attribute.repo_ref/lmmoreira/ikaro@refs/heads/main` — **deploy credentials mintable from `main` only**; a tampered PR workflow cannot impersonate them.
   - `tf-planner`: bound to `attribute.repository/lmmoreira/ikaro` (any ref — plans must run on PRs).
   - **Prod tightening (required, 2026-07-07; mechanism corrected 2026-07-08):** prod-project `tf-deployer`/`app-deployer` may only mint inside jobs running in the approved `production`/`production-infrastructure` environments on `main`. ⚠️ Separate principalSet bindings **OR** together — binding `attribute.repo_ref` and a standalone `attribute.environment` side by side would let *either* claim alone impersonate. The AND requires ONE composite mapped attribute, e.g. `attribute.repo_ref_env = assertion.repository + "@" + assertion.ref + "@" + <environment-or-"-">` (guard the missing claim — PR-planner tokens carry no `environment`; verify the exact CEL guard form, e.g. `has()`/ternary, at implementation time), with prod deployers bound to the single principalSet `…/attribute.repo_ref_env/lmmoreira/ikaro@refs/heads/main@production` (infra deployer: `…@production-infrastructure`). `workflow_ref` pinning stays documented-optional (brittle: a workflow file rename silently bricks deploys; the environment claim gives the same guarantee robustly).
6. Smoke-test WIF from a throwaway GitHub Actions run (`google-github-actions/auth@v2` + `gcloud auth print-access-token`): planner works from a PR ref; deployer impersonation **fails** from a non-`main` ref and succeeds from `main`; prod deployer impersonation **fails** from a `main` run outside the approved environment and succeeds inside it.

**Security notes:** `tf-deployer` remains broad by necessity but is exercised rarely and only from `main`; the frequently-run app pipeline holds the narrow credential. Runtime SAs (S17) are least-privilege. Revisit further scope-tightening post-launch (tracked in S42).

**Acceptance criteria:**
- [ ] Both projects exist with APIs enabled and budgets attached
- [ ] `gsutil ls gs://ikaro-tfstate` OK; versioning + public-access-prevention verified
- [ ] All six SAs (3 × 2 projects) exist with the role split above; app-deployer demonstrably cannot run `terraform apply` (missing infra roles) and planner cannot mutate
- [ ] State-prefix condition proven: staging `tf-deployer` writes `envs/staging/*` but is denied on `envs/prod/*` (and vice versa)
- [ ] WIF: planner auth OK from a PR ref; deployer auth REJECTED from a PR ref, OK from `main`; prod deployers REJECTED from `main` outside the approved environments; any other repo rejected entirely
- [ ] Zero SA keys exist (`gcloud iam service-accounts keys list` on each SA shows only Google-managed)
- [ ] Provider resource names + all SA emails recorded in `BOOTSTRAP_LOG.md`

**Dependencies:** M17-S07

---

### M17-S09 — Cloudflare account + `ikaro.online` zone migration ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** none

**Description:**
Create the Cloudflare footprint and move `ikaro.online` DNS to it. No production traffic exists yet, so this is zero-risk to do early.

**Runbook steps:**
1. Create Cloudflare account (free plan) with **2FA enforced**; use the admin email from S07.
2. Add zone `ikaro.online`; import existing DNS records; switch nameservers at the current registrar to Cloudflare’s. Wait for activation.
3. Zone settings: SSL/TLS mode **Full (strict)** (the ALB will present a Google-managed cert); Always Use HTTPS ON; minimum TLS 1.2.
4. Create a scoped **API token** (Zone:DNS:Edit + Zone:Cache Purge for `ikaro.online` only) — needed later by S22 (DNS records) and S41 (cache purge). Store in a password manager now; it enters GitHub/Secret Manager only in the story that consumes it.
5. Optional at this stage: consider Cloudflare Registrar for future renewals (at-cost pricing).

**Acceptance criteria:**
- [ ] Zone active on Cloudflare; `dig NS ikaro.online` shows Cloudflare nameservers
- [ ] SSL mode Full (strict); HTTPS redirect on
- [ ] 2FA on the Cloudflare account
- [ ] Scoped API token created (never a Global API Key) and stored outside the repo
- [ ] Steps recorded in `BOOTSTRAP_LOG.md`

**Dependencies:** M17-S07 (admin identity; TXT verification for Cloud Identity should be done before nameserver switch or re-added after)

---

### M17-S10 — Google OAuth consent + clients, email provider (Brevo) ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § OAuth (reference only — M17 §0 wins)

**Description:**
The two external service prerequisites for a working deployment: Google OAuth (login) and a transactional email provider.

> **Provider switch (2026-07-15):** SendGrid was rejected by Twilio's own compliance/vetting review during account signup (generic denial, no reason disclosed), and had separately retired its free plan in 2025. Switched to **Brevo** instead (see `docs/BOOTSTRAP_LOG.md`'s M17-S10 entry for the full comparison and DNS record trail). The runbook below is updated for Brevo; the underlying steps (domain authentication, DMARC, scoped send-only credentials) are the same shape regardless of provider. The actual code still needs updating to match — tracked as `td/TD26-BREVO-EMAIL-ADAPTER.md`.

**Runbook steps:**
1. **OAuth consent screen** (in `ikaro-prod`, shared by both envs or one per project — one per project preferred for isolation): External type; app name, support email, domain `ikaro.online`. Stays in **Testing** mode until go-live: add every staging tester as a Test User (without this, staging login returns `Error 403: access_denied` — Google policy, not a bug).
2. **OAuth clients** (Web application), one per env:
   - staging: authorized redirect `https://<bff-staging-run-url>/v1/auth/google/callback` (exact BFF path — verify against `GOOGLE_CALLBACK_URL` usage in `apps/bff`). **Chicken-and-egg note:** the BFF run URL doesn't exist until Wave 2 — use Cloud Run's deterministic URL format, computable after S08 (`https://ikaro-bff-<PROJECT_NUMBER>.southamerica-east1.run.app`; project number from `gcloud projects describe`), or create the client with a placeholder and update the redirect URI during S27 (redirect URIs are freely editable; changes take effect in minutes).
   - prod: `https://bff.ikaro.online/v1/auth/google/callback`
   - Record client IDs; secrets go straight to a password manager → Secret Manager in S27/S37.
3. **Brevo** (switched from SendGrid — see note above): create account; verify sender domain `ikaro.online` (DKIM CNAME records + ownership TXT — added via Cloudflare's one-time scoped auto-connect, done after S09); publish a **DMARC** record too (`_dmarc.ikaro.online`, `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com,mailto:<admin>` to monitor — include your own address alongside Brevo's default so you retain visibility, tighten to `p=quarantine` once alignment is confirmed — deliverability + spoofing protection); create two **SMTP keys** (staging, prod) — not general API keys — since SMTP keys are structurally send-only, matching "Mail Send permission only" without needing granular API-key scoping. No IP restriction (Cloud Run has no static outbound IP; no Cloud NAT provisioned).
4. Plan for go-live: consent screen **verification/publishing** takes days–weeks with Google — start the submission during Wave 5, not at go-live day (tracked in S37 checklist).

**Acceptance criteria:**
- [ ] Two OAuth clients exist with correct redirect URIs; test users added
- [ ] Brevo domain authentication (DKIM) verified on `ikaro.online`; DMARC record published
- [ ] API keys scoped to Mail Send only; nothing committed to git
- [ ] `BOOTSTRAP_LOG.md` updated

**Dependencies:** M17-S09 (DNS for domain verification)

---

### M17-S48 — Supersession banners on legacy infra docs ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** none (this story is about the docs themselves)

**Description:**
**Found in review (2026-07-07):** Wave 2+ stories cite `docs/12-DEPLOYMENT_STRATEGY.md`, `docs/23-INFRASTRUCTURE_SETUP.md`, `docs/09-CI_CD_PIPELINE.md`, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md` as references, and CLAUDE.md §10 auto-loads them — but they still describe SA JSON keys, the VPC Access connector, BFF-targeted cron, the GCE observability VM, and the old pipeline structure. An agent loading them mid-M17 gets contradicted. The full rewrite stays at S42 (post-reality); this story just makes the staleness impossible to miss **before any Terraform is written**.

**What to do (doc-only PR, doc gate applies):**
1. Add a banner to the top of each of the four docs: *"⚠️ Partially superseded by `plan/M17-CLOUD-DEPLOY.md` §0 (2026-07-07). On any conflict — SA keys, VPC connector, Cloud Armor+IAP, GCE observability VM, cron transport, pipeline structure — M17 wins. Full rewrite tracked as M17-S42."*
2. Sweep M17 itself: every `Docs to load` line citing one of the four gains the suffix `(reference only — M17 §0 wins)` where it doesn't already have it.
3. Do NOT rewrite doc content — that is S42's job, after the infrastructure exists.

**Acceptance criteria:**
- [ ] All four docs carry the banner
- [ ] Every M17 `Docs to load` reference to them is caveated
- [ ] No content changes beyond banners/caveats

**Dependencies:** none (must merge before any Wave 2 story starts)

---

## Wave 2 — Terraform (`infra/terraform/`)

> **Layout rule for all Wave 2 stories** — modules are generic and env-agnostic; envs compose them:
> ```
> infra/terraform/
> ├── modules/
> │   ├── network/  ├── database/  ├── storage/  ├── registry/  ├── secrets/
> │   ├── iam/      ├── pubsub/    ├── cloudrun-service/  ├── migrate-job/
> │   ├── scheduler/├── edge/      └── monitoring/
> └── envs/
>     ├── staging/   # backend "gcs" { bucket=ikaro-tfstate, prefix=envs/staging }
>     └── prod/      # backend "gcs" { bucket=ikaro-tfstate, prefix=envs/prod }
> ```
> Each env is a **separate root module with its own state** (fixes the shared-state bug in the old M15-S02). No `terraform workspace` usage. Providers pinned to the current major (`hashicorp/google` ≥ v6 and `cloudflare/cloudflare` — check the registry at implementation time). `required_version` pinned. **Version-constraint convention (settled in S11 review, per HashiCorp module conventions — don't reintroduce `~>` in modules):** child modules declare *minimums only* (`>= 7.0`, `required_version >= 1.15`); the env roots own the real pins (`~>` + committed `.terraform.lock.hcl`, Dependabot-updated). Settled versions as of 2026-07-16: google `~> 7.0` (7.40), cloudflare `~> 5.0` (5.22, declared only in `modules/edge`). Register the `terraform` ecosystem in Dependabot in S11 so provider pins receive update PRs instead of decaying into freezes (2026-07-08). Checkov must pass on every story (CI job from M01 already scans `.tf`). **Terraform unit tests (added 2026-07-08):** any module containing *logic* — variable `validation` blocks, `precondition`/`check` blocks, non-trivial locals (lookup maps, derived values) — ships native `terraform test` cases in `tests/*.tftest.hcl` per HashiCorp module conventions (D13/S01), using **`command = plan` + `mock_provider` only**: no credentials, no real resources, no cost. Thin declarative modules (plain resource wrappers with no logic) are exempt — a test that restates the config adds nothing. Tests run in the S24 PR job. Secret VALUES never appear in state/tfvars — Terraform creates secret *containers* only. Until S24 (infra pipeline) exists, applies run from the developer machine via `gcloud auth application-default login`; after S24, ONLY the pipeline applies.

---

### M17-S11 — Terraform skeleton: modules/envs layout + remote state ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** vendored HashiCorp skills (S01), M17 §0–§2

**Description:**
Create the folder structure above with empty-but-valid modules, per-env backends, shared variable conventions (`project_id`, `environment`, `region` default `southamerica-east1`, `labels`), and a root `infra/terraform/README.md` documenting: bootstrap prerequisites (S08), how to plan/apply locally pre-pipeline, state layout, the module dependency graph, and the **unit-test convention** (Wave 2 preamble): modules with logic carry `tests/*.tftest.hcl` (`command = plan` + mocked providers, zero cost), run via `terraform test`. Include one example test in the skeleton so every later story copies a working pattern instead of inventing one. Register the `terraform` Dependabot ecosystem in this story.

**Acceptance criteria:**
- [ ] `terraform init && terraform validate` pass in both envs against the real GCS backend
- [ ] `terraform plan` in staging shows an empty plan (no resources yet)
- [ ] The two envs demonstrably use different state prefixes (`terraform state pull` differs)
- [ ] Checkov + `terraform fmt -check` clean
- [ ] Example `tests/*.tftest.hcl` passes via `terraform test` with no credentials configured (proves the mocked-provider pattern)
- [ ] README covers run instructions, the unit-test convention, + “never apply prod manually after S24”

**Dependencies:** M17-S01, M17-S08

---

### M17-S12 — Network module (VPC, subnet, private services access, direct egress) ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** vendored skills; `docs/23-INFRASTRUCTURE_SETUP.md` § network (reference only — M17 §0 wins)

**Description:**
`modules/network`: VPC `ikaro-vpc-{env}` (no auto subnets), subnet `ikaro-subnet-{env}` `10.0.0.0/24` in `southamerica-east1` (flow logs ON per Checkov; **`private_ip_google_access = true`** — required: the BFF egresses `ALL_TRAFFIC` through this subnet (S18), so its Google-API calls — OAuth token exchange, JWKS fetches — must ride Private Google Access), **private services access** peering range for Cloud SQL (`servicenetworking` connection), firewall: default-deny ingress; egress allowed. **No Serverless VPC Access connector** (D7) — Cloud Run services reference this subnet via direct VPC egress in S18. **No Cloud NAT at launch** (documented decision, 2026-07-07): the backend keeps `PRIVATE_RANGES_ONLY` egress so its non-Google calls (Brevo) go direct from Cloud Run's infrastructure, and the BFF calls only Google APIs (PGA) + the backend (VPC) — nothing needs a NAT path. Revisit only if a VPC-egressing service ever needs a non-Google external API. *Settled in discovery (2026-07-17): PSA reserved range is auto-allocated `/16` (`prefix_length = 16`, name `ikaro-psa-range-{env}`); the module also outputs the servicenetworking connection (`private_services_connection`) so S13's database module can take an explicit graph dependency on the peering (module-composition practice — avoids `depends_on` on the module call); the module is composed in both env roots but applied to staging only — prod stays plan-only until S24/S37.*

**Acceptance criteria:**
- [ ] Applied to staging: VPC + subnet + PSA connection exist
- [ ] Subnet has `private_ip_google_access = true` (the BFF's Google-API calls under `ALL_TRAFFIC` egress depend on it — S18)
- [ ] No `google_vpc_access_connector` resource anywhere
- [ ] Flow logs enabled; Checkov clean
- [ ] Module has typed variables + outputs (`network_id`, `subnet_id`, `private_services_connection`) consumed by later modules

**Dependencies:** M17-S11

---

### M17-S13 — Cloud SQL module (PostgreSQL 17, private IP) ✅ Done

**Agent:** `devops`
**Complexity:** M
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` (context), vendored skills

**Description:**
`modules/database`: instance `ikaro-db-{env}`, PostgreSQL 17, `var.db_tier` (staging `db-f1-micro`; **prod launches on `db-f1-micro` too per D12** — upgrade to `db-g1-small`/custom via tfvars change when the first paying tenant lands; document this in the module README including the brief restart the resize causes), `ipv4_enabled=false` + PSA network, `require_ssl=true`, daily backups 02:00 UTC retention 7, PITR enabled prod-only (`var.enable_pitr`), `deletion_protection=true` prod, **maintenance window pinned off-peak** (e.g. Sunday 06:00 UTC ≈ 03:00 São Paulo), **`disk_autoresize=true` + `disk_autoresize_limit`** (e.g. 30GB) so disk growth never hard-stops writes while cost stays bounded. Database `ikaro` created by Terraform. **The `ikaro` user and its password are NOT Terraform-managed** (decision revised 2026-07-07 — zero secret values in state, no exceptions; see §2): the activation runbooks (S27/S37) create them out-of-band:
```bash
PW=$(openssl rand -base64 32)
gcloud sql users create ikaro --instance=ikaro-db-<env> --password="$PW"
printf '%s' "$PW" | gcloud secrets versions add db-password --data-file=-
unset PW
```
Rationale: `tf-planner` (PR-mintable, S08) reads state; a Terraform-generated password would be exposed to any tampered PR workflow. Future option (documented in module README, not built): Cloud SQL IAM database authentication removes the password entirely, at the cost of a connector dependency in the app.

**Developer access (security):** no public IP ever. Local access via `cloud-sql-proxy` with IAM: grant `roles/cloudsql.client` to the admin identity; README snippet:
```bash
cloud-sql-proxy --auto-iam-authn ikaro-staging:southamerica-east1:ikaro-db-staging --port 5433
```

*Settled in discovery (2026-07-17):* (0) **Engine bumped PostgreSQL 15 → 17** — the original PG15 pick (`docs/22` §6) dates to project inception (~2023, when PG16 was newly GA); this story is the first ever to provision a real Cloud SQL instance, so it's the cheapest possible moment (zero data, no migration) to correct the stale pin. PG18 was considered and set aside only for Cloud SQL-specific immaturity (support added 2026), not upstream risk. Local `docker/docker-compose.yml`, backend Testcontainers (`integration-global-setup.ts`), and every doc asserting "PostgreSQL 15" were updated in the same PR (`docs/22`, `docs/08/09/11/12/19/23`, `infra/terraform/README.md`, `modules/database/README.md`, `plan/M00`, `plan/M01-CI-QUALITY-GATES*`, `plan/README.md`, `.copilot/context.md`) — `plan/M15-GCP-INFRASTRUCTURE.md` intentionally excluded (superseded/historical, not live). (1) **Human DB access uses Cloud SQL IAM database authentication** — `cloudsql.iam_authentication` flag ON, admin identity registered as a `CLOUD_IAM_USER` via `var.iam_admin_user` (no password exists → zero secrets in state; the "future option, not built" note above now refers only to the *app runtime*, which keeps password auth via the S27 runbook). The email value is never committed (public repo): locally it comes from a gitignored `local.auto.tfvars`; post-S24 the pipeline supplies `TF_VAR_iam_admin_user` from a GitHub environment variable (noted in S24). (2) Provider v7 renamed `require_ssl` → `ssl_mode = "ENCRYPTED_ONLY"` (same intent, new attribute). (3) **Apply postponed** (cost decision): the module lands behind an `enable_database` flag at each env root — staging `false` (no instance, no charge) until S18/S27 needs the live DB (~$9/mo once flipped), prod `true` (prod stays plan-only regardless). Live-instance AC items (proxy login, backups in console) move to the S27 checklist.

**Connection capacity note:** `db-f1-micro` allows only ~25 connections, and every Cloud Run instance opens its own TypeORM pool — the invariant `backend max_instances × DB_POOL_SIZE ≤ ~80% of max_connections` is owned by S18. The connection scale-up ladder (verified against Cloud SQL docs, 2026-07-07) is: **(1)** pool math — day zero, free; **(2)** dedicated-core Enterprise tier + raise the `max_connections` database flag (RAM-bounded); **(3)** Enterprise Plus edition + **Managed Connection Pooling** (Google-managed PgBouncer — requires Enterprise Plus, ~$200–300+/mo/env, so ONLY when traffic justifies it): M17-S46. Never a self-hosted pooler VM at any rung.

**Acceptance criteria:**
- [ ] ~~Staging instance up, proxy login, backups in console~~ → **deferred to S27** (apply postponed, see discovery note); staging plan with `enable_database=false` stays empty for this module
- [ ] Prod plan shows the instance with PITR + deletion protection + IAM-auth flag; both env plans/validate clean
- [ ] Checkov clean (no public IP, SSL enforced)
- [ ] Module README documents the 3-rung connection ladder (pool math → tier + `max_connections` flag → Enterprise Plus + MCP, → S46) + proxy usage + the connection-math invariant

**Dependencies:** M17-S12

---

### M17-S14 — GCS storage module (uploads + public hotsite assets) ✅ Done

**Agent:** `devops`
**Complexity:** S
**Docs to load:** M115 IA § S01 (signed URL contract), backend `env.validation.ts` GCS_* vars

**Description:**
**This module was missing from the old M15 entirely.** The app requires two buckets (see `GCS_BUCKET_NAME`, `GCS_PUBLIC_BUCKET_NAME`, `GCS_PUBLIC_BASE_URL`):
- `ikaro-uploads-{env}` — **private** (uniform access, public-prevention enforced). Browser uploads go via V4 signed URLs (M115-S01), so the bucket needs a **CORS config** allowing `PUT`/`GET` from the web origin(s) with the headers the signed-URL flow uses (verify exact headers against `GcsSignedUrlAdapter`).
- `ikaro-public-{env}` — public-read objects (hotsite images): `allUsers: roles/storage.objectViewer`, CORS `GET` from `*`. `GCS_PUBLIC_BASE_URL=https://storage.googleapis.com` (host only — `GcsSignedUrlAdapter.getPublicUrl()` appends `GCS_PUBLIC_BUCKET_NAME` itself; a value that already includes the bucket name doubles it. Matches the env schema default and stays this way until S44 fronts the bucket with `img.ikaro.online`).
- Both: `southamerica-east1`, soft-delete default, lifecycle rule deleting incomplete multipart uploads after 7 days. (Age-based tiering + booking-photo retention/deletion is added later by M17-S45 — uploads bucket only; the public hotsite bucket is permanent.) Signed URLs require the backend runtime SA to have `roles/iam.serviceAccountTokenCreator` **on itself** (keyless signing via IAM signBlob — no key file in cloud; `GCS_KEY_FILE` stays a local-dev-only var). Verify the adapter supports keyless signing; if it insists on a key file, fix the adapter in this story (root-cause rule — no key-file workaround in cloud).
- **Uploads bucket also needs a `tmp/`-prefixed lifecycle rule** (`matches_prefix = ["tmp/"]`, `age = 2` days, `Delete`) — sourced from `td/TD22-ORPHANED-UPLOAD-CLEANUP.md`, additive to this story's own 7-day incomplete-multipart-upload rule and to M17-S45's separate `tenants/`-prefixed retention/tiering rules. Cleans up the app's `tmp/<tenantId>/...` staging convention (hotsite + booking-photo uploads not yet promoted to a permanent path) — TD22 ships the app-side staging/promotion logic independent of this bucket's existence, but the automatic-cleanup guarantee only takes effect once this rule is added here.

**Acceptance criteria:**
- [ ] Uploads bucket rejects public access; public bucket serves objects anonymously
- [ ] CORS verified with a real browser preflight against staging (after S27; leave a checklist item there)
- [ ] Keyless signed-URL generation confirmed working with the runtime SA (no JSON key anywhere)
  - ⚠️ Not verified as of 2026-07-17 — requires the M17-S17 SA + serviceAccountTokenCreator grant and a deployed backend (M17-S18) to test end-to-end; adapter code confirmed to have no key-file dependency (`gcs-signed-url.adapter.ts` falls through to ADC when `GCS_KEY_FILE` is unset).
- [ ] Org-policy exceptions from S07 step 7 (`iam.allowedPolicyMemberDomains` / `storage.publicAccessPrevention`) verified applied — the public bucket's `allUsers` grant fails without them
- [ ] Uploads bucket has a `tmp/`-prefixed lifecycle rule (age 2 days, Delete) per TD22, in addition to the 7-day incomplete-multipart-upload rule

**Dependencies:** M17-S11 (parallel with S12–S13)

---

### M17-S15 — Artifact Registry module (single registry, prod project)

**Agent:** `devops`
**Complexity:** S
**Docs to load:** `docs/12-DEPLOYMENT_STRATEGY.md` § immutable artifacts (reference only — M17 §0 wins)

**Description:**
`modules/registry`, instantiated **only in the prod env** (D8): Docker repo `ikaro-registry` in `southamerica-east1`. Cleanup policies: delete untagged >7 days; keep last 15 tagged versions per image. IAM: prod deployer `roles/artifactregistry.admin`; staging deployer `roles/artifactregistry.writer` (cross-project binding); both projects’ runtime SAs `roles/artifactregistry.reader`. Images: `ikaro-backend:<sha>`, `ikaro-bff:<sha>`, `ikaro-web:<sha>-staging` / `ikaro-web:<sha>-prod` (web per-env build, see D8/S26), `ikaro-otel-collector:<version>` (S34).

**Acceptance criteria:**
- [ ] `docker push` from a WIF-authenticated GitHub Actions run succeeds (staging deployer)
- [ ] Cloud Run in the **staging** project can pull from the prod-project registry (cross-project reader verified)
- [ ] Cleanup policies visible in console; Checkov clean

**Dependencies:** M17-S11

---

### M17-S16 — Secret Manager module (full live catalog)

**Agent:** `devops`
**Complexity:** S
**Docs to load:** `apps/backend/src/config/env.validation.ts` + `apps/bff/src/config/env.validation.ts` (SOURCE OF TRUTH), M115 IA

**Description:**
Terraform creates secret **containers** only in this story — `outputs.tf` exports `secret_ids`/`secret_names` (real Terraform outputs). The consumer column in the table below is **documentation, not a Terraform artifact** — S17 cannot loop over this Markdown table programmatically; `modules/iam` maintains its own local map (secret → SA) mirroring this table by hand, and **the actual per-SA `roles/secretmanager.secretAccessor` bindings are S17's responsibility** (see the module graph in `infra/terraform/README.md`). Keep S17's map and this table in sync manually when either changes. ALL secret values are populated manually via the S27/S37 runbooks — no exceptions (§2). The old M15-S06 list (7 secrets) is stale; the catalog derives from the live env schemas:

| Secret | Consumer | Notes |
|---|---|---|
| `db-password` | backend, migrate job | value populated out-of-band in the S27/S37 runbooks (never via Terraform — §2) |
| `jwt-secret` | backend, BFF, web | same value all three (web verifies JWT in layouts) |
| `internal-api-key` | backend, BFF | M115-S03 shared secret — `InternalApiGuard` is registered only in the backend and gates BFF→backend calls; verified 2026-07-18 that `apps/web`'s revalidate route checks only `HOTSITE_REVALIDATE_SECRET` and web's only other `INTERNAL_API_KEY` references are Playwright E2E dev-login helpers, not a runtime path — web is NOT a consumer |
| `platform-admin-key` | backend | UC-024 provisioning |
| `hotsite-revalidate-secret` | backend, web | ISR on-demand revalidation |
| `google-oauth-client-id` / `google-oauth-client-secret` | BFF | per-env values (S10) |
| `brevo-smtp-key` | backend | per-env keys (S10) |
| `cloudflare-api-token` | infra pipeline (S22), CI purge (S41), backend (S40 runtime) | prod only; provisioned with the edge module (S22/S23 — DNS:Edit scope), scope extended for cache purge + SSL for SaaS when S40/S41 land. Two homes, both intentional (2026-07-08): GitHub environment secret for pipelines (S23/S24); this Secret Manager container for runtime consumers (the S40 verification adapter calls the Cloudflare API from the backend) |

Non-secret config (`EMAIL_ADAPTER`, `EMAIL_FROM`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `GCS_*` names/URLs, `PUBSUB_*`, `LOG_LEVEL`, `JWT_EXPIRES_IN`, `ENABLE_DEV_AUTH`, `BACKEND_INTERNAL_URL`, `NEXT_PUBLIC_*`) goes as plain env vars in the Cloud Run module (S18) — not secrets. IAM: each runtime SA gets `roles/secretmanager.secretAccessor` **per secret it consumes** (loop over an explicit map — no project-wide grant) — **this binding is created in S17**, which hand-maintains its own local consumer map mirroring this table (not a shared Terraform artifact — see note above).

**Acceptance criteria:**
- [ ] All containers exist in staging after apply; **zero secret values in Terraform state — no exceptions** (`terraform state pull | grep -i` spot-check for known value patterns)
- [ ] `outputs.tf` exposes secret ids keyed by name, consumable by S17 (accessor bindings) and S18 (`secret_key_ref`)
- [ ] A `SECRETS.md` in `infra/terraform/` maps secret → consumers → rotation procedure
- [ ] Checkov clean (rotation finding suppressed with documented rationale if flagged)

(Per-secret, per-SA accessor bindings are verified as part of S17's own acceptance criteria, not here — S16 has no SA to bind against yet.)

**Dependencies:** M17-S11

---

### M17-S17 — IAM module (runtime service accounts, least privilege)

**Agent:** `devops`
**Complexity:** S
**Docs to load:** M17 §2 security model

**Description:**
`modules/iam`: three runtime SAs per env — `ikaro-backend@`, `ikaro-bff@`, `ikaro-web@` — plus `ikaro-pubsub-invoker@` (the identity Pub/Sub push mints OIDC tokens as; the Pub/Sub **service agent** needs `iam.serviceAccountTokenCreator` on it — granted in S19). **No custom Scheduler SA** (corrected 2026-07-08): `pubsub_target` Scheduler jobs cannot run as a user SA — the **Cloud Scheduler service agent** performs the publish and gets `pubsub.publisher` on the three cron topics (S21).

| SA | Roles |
|---|---|
| backend | `cloudsql.client`, `pubsub.publisher` (its topics), per-secret accessor, `storage.objectAdmin` on the two buckets, `iam.serviceAccountTokenCreator` on itself (signed URLs), `cloudtrace.agent`, `monitoring.metricWriter` |
| bff | per-secret accessor, `cloudtrace.agent`, `monitoring.metricWriter`, `run.invoker` on backend service |
| web | per-secret accessor (jwt/revalidate — not internal-api-key, web isn't a consumer per the S16 catalog), `run.invoker` on BFF (not strictly needed while BFF is public; harmless) |
| pubsub-invoker | `run.invoker` on backend (push delivery) |
| Cloud Scheduler **service agent** (not a custom SA) | `pubsub.publisher` on the three cron topics |

No SA gets `roles/editor`/`roles/owner`. No keys (org policy enforces).

**Acceptance criteria:**
- [ ] All bindings applied; `gcloud projects get-iam-policy` diff matches the table
- [ ] Backend SA can NOT read secrets it doesn’t consume (spot check)
- [ ] Checkov clean

**Dependencies:** M17-S11, M17-S16

---

### M17-S18 — Cloud Run services module (backend internal, sidecar-ready)

**Agent:** `devops`
**Complexity:** L
**Docs to load:** M17 §0–§2; Dockerfiles in `apps/*/Dockerfile`; both `env.validation.ts` files

**Description:**
`modules/cloudrun-service` (generic: image, env map, secret map, SA, ingress, resources, probes, VPC egress, optional sidecar) + per-env composition of the three services. Until the first pipeline deploy, use a placeholder public image (e.g. `gcr.io/cloudrun/hello`) with probes relaxed via a `bootstrap_mode` variable — flipped off in S27. `lifecycle { ignore_changes = [template[0].containers[0].image] }` on app containers: **the pipeline owns the image, Terraform owns everything else** (prevents every future `terraform apply` from rolling back deploys).

Key settings:
- **backend:** ingress `INGRESS_TRAFFIC_INTERNAL_ONLY`; direct VPC egress (network+subnet from S12, egress `PRIVATE_RANGES_ONLY`); `min=0,max=10` staging / `min=0,max=20` prod (push model makes min=0 safe — D2); CPU 1 / 512Mi; probes (**Cloud Run has startup + liveness probes only — no readiness probe**): startup probe `/health/ready` (gates new instances on real dependencies), liveness `/health/live`; a running instance that loses the DB is **not** pulled from rotation (Cloud Run cannot do that) — the S35 5xx/uptime alerting is the mitigation; env per backend schema incl. `PUBSUB_CONSUMER_MODE=push`, `PUBSUB_AUTO_CREATE=false`, `PUBSUB_PUSH_AUDIENCE=<own run URL>/pubsub/push`, `PUBSUB_PUSH_SERVICE_ACCOUNT=ikaro-pubsub-invoker@…`; secrets via `value_source.secret_key_ref`. `--no-allow-unauthenticated` + `run.invoker` for bff/pubsub-invoker SAs (IAM layer on top of internal ingress).
- **bff:** public (`INGRESS_TRAFFIC_ALL` staging; `INTERNAL_AND_CLOUD_LOAD_BALANCING` prod once S22 lands); allow-unauthenticated (app does its own auth — requires the S07 step-7 org-policy exception: allow-unauthenticated is an `allUsers` grant on `run.invoker`, blocked by default domain-restricted sharing on new orgs; same applies to web); VPC direct egress with **`ALL_TRAFFIC`** (fixes a would-break-staging gap found 2026-07-07: `*.run.app` resolves to public Google IPs, so `PRIVATE_RANGES_ONLY` would route the backend call outside the VPC — it would arrive as external traffic and internal ingress would reject it; under all-traffic egress the BFF's Google-API calls ride the subnet's Private Google Access — S12); `BACKEND_INTERNAL_URL=https://<backend run URL>` (internal ingress accepts VPC-originated calls to the run.app URL); CPU 1 / 512Mi; `min=0`.
- **web:** public (same ingress split as BFF); 256Mi; `min=0`; env: `NEXT_PUBLIC_*` are **build-time** — runtime copies exist only for server-side code; see S26 for the per-env image consequence.
- **web probe paths differ:** web health lives under Next.js route handlers — probes must target `/api/health/live` and `/api/health/ready` (S04), NOT `/health/*` like backend/BFF. A wrong probe path = a service that never turns READY.
- All three: `APP_ENV` set per environment (`staging`/`production` — S06 deployment identity; `NODE_ENV=production` in both), sidecar support wired (container list accepts an optional collector sidecar — activated in S34), `max_instance_request_concurrency` default, second-gen execution environment, labels (`env`, `service`, `managed-by=terraform`).

**Env-var contract check (added 2026-07-08):** the Terraform env/secret maps must mirror the app schemas (`env.validation.ts` is the source of truth — S16), and nothing enforces that today; the failure mode is a startup error discovered at deploy time. Reuse the S19 catalog-sync mechanism: a small script (`scripts/env-contract.ts`, with its own `.spec.ts` per repo rule) exports the cloud-required keys from both `apps/backend/src/config/env.validation.ts` and `apps/bff/src/config/env.validation.ts` and cross-checks them against this module's env + secret map keys; CI fails on mismatch (allowlist for local-only vars like `GCS_KEY_FILE`). This converts "added a var in code, forgot Terraform" from a failed staging deploy into a failed PR.

**Connection-math invariant (owned here):** backend env sets `DB_POOL_SIZE=3` (S06 wires it into TypeORM); the module must assert — via a Terraform `check`/`precondition` on the variables — that `backend max_instances × DB_POOL_SIZE ≤ 0.8 × max_connections` of the chosen `db_tier` (encode the tier→max_connections map as a local). Launch numbers: 10 instances × 3 = 30 > 25 (f1-micro) — so launch caps backend at `max_instances=6` until the tier upgrade (D12 note). Raising max_instances without raising the tier (or enabling S46 MCP) must fail `terraform plan`. **Encode this permanently (2026-07-08) as `tests/connection_math.tftest.hcl`** (Wave 2 preamble rule): `command = plan` + `mock_provider "google"` cases — valid combination plans clean; `max_instances=20` on f1-micro fails with the descriptive error; the tier→max_connections map covers every tier named in the S13 ladder. No credentials or resources involved; runs in the S24 PR job and protects the invariant when S46 later rewrites the math.

**Acceptance criteria:**
- [ ] Staging apply: 3 services READY on placeholder images
- [ ] Connection-math precondition encoded in `tests/connection_math.tftest.hcl` (`command = plan`, mocked provider): valid combo passes, `max_instances=20` on f1-micro fails with a descriptive error — green via `terraform test` with zero credentials
- [ ] Backend has NO public URL access: unauthenticated fetch of its run.app URL from the internet fails; a request from the BFF container succeeds (verify post-S27 — checklist item there)
- [ ] BFF egress mode is `ALL_TRAFFIC`; the BFF→backend call demonstrably traverses the VPC (internal ingress accepts it — verify post-S27 alongside the item above)
- [ ] `terraform plan` after a manual `gcloud run deploy` shows NO image drift (ignore_changes works)
- [ ] All secret env vars are `secret_key_ref` (zero plaintext secrets in state for these)
- [ ] Env-contract check wired into CI with its spec: removing a var from the Terraform map (temp change) fails the check; local-only vars allowlisted
- [ ] Checkov clean

**Dependencies:** M17-S12, S13, S14, S15, S16, S17, **S47** (BFF must attach ID tokens before the backend goes `--no-allow-unauthenticated`, or staging breaks at S27)

---

### M17-S19 — Pub/Sub module (topics/subs generated from the code’s event catalog)

**Agent:** `devops` + `backend-ts`
**Complexity:** M
**Docs to load:** `docs/03-DOMAIN_EVENTS.md`, S02 implementation, `gcp-pubsub-event-bus.adapter.ts`

**Description:**
Terraform must mirror the adapter’s naming **exactly**: topic `ikaro-{EventName}`, subscription `ikaro-{EventName}-{consumer}`, DLQ topic `ikaro-{EventName}-{consumer}-dlq`. The old M15-S08 event list is stale (live catalog: 17 domain events incl. `BookingInfoSubmitted`, `BookingRescheduled`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`, `ServicePointsEarned`, `StaffActivated`, …).

**What to build:**
1. **Sync source:** a small script `scripts/pubsub-catalog.ts` that scans the backend for registered subscriptions — both the adapter's `subscribe()` call sites (domain events) and `registerTrigger()` call sites (cron, S03) — and emits `infra/terraform/pubsub-catalog.json` (`[{ event, consumers: [] }]`). The Terraform module consumes this JSON via `jsondecode(file(...))` + `for_each`. CI check (add to `pr-quality.yml` or a tiny script run in `/pre-pr`): regenerating the JSON produces no diff — **an event/consumer added in code without regenerating the catalog fails CI** (this is the mechanism that prevents Terraform drift forever). **The scanner itself ships a `.spec.ts` in the same commit (added 2026-07-08 — repo rule):** detects a `subscribe()`/`registerTrigger()` call site, deterministic ordering, one event with multiple consumers — a scanner that silently misses a registration pattern would pass the no-diff check while leaving a subscription unprovisioned, the exact failure this mechanism exists to prevent.
2. **Per subscription:** push config → `https://<backend run URL>/pubsub/push` with `oidc_token { service_account_email = ikaro-pubsub-invoker }` (audience defaults to the URL), `ack_deadline_seconds=60`, retry `minimum_backoff=10s`/`maximum_backoff=600s`, DLQ with `max_delivery_attempts=5`, message retention 7 days. Pub/Sub service agent needs `pubsub.publisher` on each DLQ topic, `pubsub.subscriber` on the source, **and `roles/iam.serviceAccountTokenCreator` on `ikaro-pubsub-invoker`** — Pub/Sub (not the SA itself) mints the OIDC push tokens; without this grant every push delivery fails auth (known gotchas — grant all three in the module; token-creator added 2026-07-08).
3. **Cron topics:** `ikaro-cron-reminders` (booking, `*/30 * * * *`), `ikaro-cron-loyalty-expiry` (loyalty daily expiry, `0 2 * * *`), `ikaro-cron-loyalty-expiry-warning` (loyalty weekly warning, `0 6 * * 1`) — three topics as of S03 (S03 splits the previously-bundled controller calls into independent trigger handlers, and keeps loyalty's two concerns on their pre-existing separate cadences rather than merging them). `ikaro-cron-reminders` gets **two** independent push subscriptions; the two loyalty topics get **one** subscription each. All four subscriptions use the *same* shared push config as point 2 above (`/pubsub/push`, not a dedicated cron URL): `ikaro-cron-reminders-booking-reminder`, `ikaro-cron-reminders-booking-admin-schedule-reminder`, `ikaro-cron-loyalty-expiry-loyalty-expire-points`, `ikaro-cron-loyalty-expiry-warning-loyalty-notify-expiring-points`. **Not a fixed count (added 2026-07-11, TD24 cross-reference):** this list is not hardcoded in Terraform — the scanner in point 1 derives it from actual `registerTrigger()` call sites, so it grows automatically as new triggers are registered in code. `td/TD24-OUTBOX-INBOX-PATTERN.md` (S01) adds a 4th trigger, `cron-outbox-relay`, registered the same way as the three above — once that story lands, the scanner picks it up with zero Terraform logic change here. Don't read "three topics" as a ceiling this module enforces.
4. **DLQ handling contract (review finding, 2026-07-07 — this is the decision, not an open question):** DLQs are **alert-only, never consumed by code**. No handler subscribes to a DLQ topic. Flow: S35 alerts on depth > 0 → operator inspects via `gcloud pubsub subscriptions pull <dlq>-inspect` (Terraform creates one pull subscription per DLQ topic for inspection, otherwise messages on a subscriberless topic are silently dropped after retention) → fix root cause → replay by re-publishing the original envelope to the **source** topic (handler idempotency via `eventId` makes replay safe). Payload in the DLQ is the unmodified original envelope. Ownership: platform operator. The replay runbook lands in `docs/RUNBOOKS.md` (S37 item).
5. DLQ depth is alerted on in S35.

**Acceptance criteria:**
- [ ] `pnpm pubsub:catalog` regenerates the JSON deterministically; CI fails on stale catalog (prove with a deliberate temp change)
- [ ] Scanner unit spec green (`subscribe()` detection, deterministic order, multi-consumer event)
- [ ] Staging apply: every topic/sub/DLQ exists; names byte-identical to what the adapter registers
- [ ] Push subs carry OIDC config with the invoker SA
- [ ] Dual audience validation verified (the backend is `--no-allow-unauthenticated`): the push token must pass **both** Cloud Run's IAM check (audience = service URL or a configured custom audience) and the app guard (`PUBSUB_PUSH_AUDIENCE` = full push URL). Pub/Sub defaults the audience to the full endpoint URL (path included) — if Cloud Run rejects a path-suffixed audience, set `oidc_token.audience` explicitly and align both layers (exercise in staging, S27)
- [ ] Pub/Sub service-agent IAM in place: DLQ publisher/subscriber grants + `tokenCreator` on the invoker SA (a push token demonstrably mints)

**Dependencies:** M17-S02, M17-S18 (backend URL)

---

### M17-S20 — Migration Cloud Run Job

**Agent:** `devops` + `backend-ts`
**Complexity:** M
**Docs to load:** `apps/backend/package.json`, `apps/backend/Dockerfile`, `docs/09-CI_CD_PIPELINE.md` § Stage 4.5 (reference only — M17 §0 wins)

**Description:**
Migrations run as Cloud Run Job `ikaro-migrate` (backend image, command override) — inside the VPC, so private Cloud SQL is reachable. **Known blocker to fix first:** `migration:run` currently uses `typeorm-ts-node-commonjs -d src/shared/database/data-source.ts` — dev-only (needs ts-node + `src/`, neither in the prod image).

**What to implement:**
1. **App side:** add `migration:run:prod` running the plain `typeorm` CLI against **compiled** output: `typeorm migration:run -d dist/shared/database/data-source.js`. Verify the Dockerfile’s build keeps migration files + data-source in `dist/` and that `typeorm` is a production dependency reachable in the runtime image (`pnpm deploy` output) — fix the Dockerfile if pruned. Verify `data-source.ts` reads connection config from env only.
2. **Terraform (`modules/migrate-job`):** Cloud Run Job, backend image (placeholder until first deploy; same `ignore_changes` on image), command `["node","node_modules/typeorm/cli.js","migration:run","-d","dist/shared/database/data-source.js"]` (or via the pnpm script if the runtime image has pnpm — pick ONE and document), backend runtime SA, VPC direct egress, DB env vars + `db-password` secret ref, `max_retries=0` (a failed migration must fail loudly, not retry into a half-applied state), timeout 10m.
3. **Local verification:** run the job image against the local Postgres (`docker run --network` with compose) proving compiled-mode migrations work before any cloud execution.

**Acceptance criteria:**
- [ ] `docker run <backend-image> node node_modules/typeorm/cli.js migration:run -d dist/...` succeeds against local Postgres (all migrations apply; idempotent on re-run: “No migrations are pending”)
- [ ] Staging job executes successfully via `gcloud run jobs execute ikaro-migrate --wait` (checklist item in S27 once the real image exists)
- [ ] Failure exit code ≠ 0 propagates (test with a temporarily broken migration in a scratch DB)
- [ ] `max_retries=0` confirmed in the job spec

**Dependencies:** M17-S13, M17-S18

---

### M17-S21 — Cloud Scheduler module

**Agent:** `devops`
**Complexity:** S
**Docs to load:** UC-018/019/020, S03

**Description:**
`modules/scheduler`: four jobs publishing to the cron topics (S19). **Corrected 2026-07-08:** Pub/Sub-target Scheduler jobs have no service-account field (that option exists only for HTTP targets) — the publish is performed by the **Cloud Scheduler service agent** (`service-<project#>@gcp-sa-cloudscheduler.iam.gserviceaccount.com`), which the module grants `pubsub.publisher` on the cron topics. **Corrected 2026-07-09 (mid-S03 discovery):** loyalty's two concerns keep their pre-existing separate cadences from the pre-M17 docs — merging them onto one weekly job would have silently regressed actual point expiry from daily to weekly (an already-expired entry staying visible/spendable in a customer's balance for up to 6 extra days):
- `ikaro-cron-reminders`: `*/30 * * * *`, timezone `UTC` (the job itself resolves each tenant’s local 06:00 window — implemented in M11)
- `ikaro-cron-loyalty-expiry`: `0 2 * * *`, `UTC` (daily — decrements `loyalty_balances.current_points` for already-expired entries)
- `ikaro-cron-loyalty-expiry-warning`: `0 6 * * 1`, `UTC` (weekly, Mondays — `PointsExpiringSoon` heads-up)
- `ikaro-cron-outbox-relay`: schedule from `var.outbox_relay_schedule`, default `*/5 * * * *`, `UTC` (added 2026-07-11, TD24 cross-reference — see `td/TD24-OUTBOX-INBOX-PATTERN.md` S01/D3: the outbox sweep + retention GC tick, consumed by `OutboxRelayTriggerHandler`). Unlike the three jobs above, this one is **not** auto-discovered by S19's scanner-driven topic list being reflected here manually — the job itself must still be hand-authored in this module the same way the other three are, since Scheduler jobs (cadence + topic target) aren't derived from the code scan the way subscriptions are.
Pub/Sub target (not HTTP): `pubsub_target { topic_name, data = base64("{}") }`.

**Acceptance criteria:**
- [ ] All four jobs created; `gcloud scheduler jobs run ikaro-cron-reminders` → message lands on the topic → both subscriptions push to `/pubsub/push`, each dispatched to its own trigger handler (verify post-S27; checklist there)
- [ ] Jobs exist in both envs (staging cron is real: reminder emails go to test users — acceptable; note in README)
- [ ] Scheduler service agent holds `pubsub.publisher` on all four topics; no unused custom Scheduler SA exists

**Dependencies:** M17-S19

---

### M17-S22 — Edge module (prod): Global ALB + serverless NEGs + Cloudflare DNS

**Agent:** `devops`
**Complexity:** L
**Docs to load:** M17 §0 D5/D11, S09 runbook

**Description:**
`modules/edge`, instantiated **prod only**: global external Application LB → two serverless NEGs (web, bff). Host routing: `ikaro.online` + `www.ikaro.online` → web NEG; `bff.ikaro.online` → bff NEG. Google-managed certificate (Certificate Manager) for the three hostnames — **DNS authorization** validation (works while Cloudflare proxies traffic; load-balancer authorization would not). The DNS-authorization CNAME records created at Cloudflare must be **DNS-only (unproxied / gray-cloud)** — a proxied validation record breaks issuance (2026-07-08). HTTP→HTTPS redirect. Cloudflare side (terraform `cloudflare` provider with the S09 token, in the prod env root): proxied A/AAAA (or CNAME) records for the three hostnames → LB IP; `www` → apex redirect via Cloudflare rule. Update prod service ingress to `INTERNAL_AND_CLOUD_LOAD_BALANCING` (S18 variable). Set prod `ALLOWED_ORIGINS=https://ikaro.online`, `FRONTEND_URL=https://ikaro.online`, `GOOGLE_CALLBACK_URL=https://bff.ikaro.online/v1/auth/google/callback`.

**Cookie note (verify in S37 smoke):** BFF cookie on `bff.ikaro.online` is same-site for XHR from `ikaro.online` → `SameSite=Lax` works; no cookie-domain change expected.

**Acceptance criteria:**
- [ ] `curl https://bff.ikaro.online/v1/health/ready` and `https://ikaro.online/api/health/live` return 200 through Cloudflare (post-S37 for real; plan-only in this story if prod not yet applied — story is complete when prod plan is clean and staging-style validation of the module is documented)
- [ ] Cert active for all three hostnames; SSL Labs grade A
- [ ] Direct-to-LB-IP access still works (locked down later by S36 — note the follow-up)
- [ ] Cloudflare records proxied (orange cloud); SSL mode Full (strict) confirmed end-to-end

**Dependencies:** M17-S18; applied to prod during S37

---

## Wave 3 — CI/CD Pipelines

> All workflows authenticate via `google-github-actions/auth@v2` with WIF (`permissions: id-token: write`). No `GCP_SA_KEY_*` secrets exist — if a story or doc mentions them, it is stale. Existing PR workflows (`pr-quality`, `pr-tests`, `pr-security`, `pr-e2e`, `main-sonar`) are untouched. New workflows pin third-party actions to **commit SHAs** (Dependabot keeps the pins fresh) — supply-chain parity with the rest of the plan (2026-07-08). **Workflow static checks (added 2026-07-08):** the workflows are the least-tested code in this milestone — add `actionlint` (expression typos, invalid `needs`/`outputs` references, syntax) and `zizmor` (security audit: untrusted-input injection, unpinned actions — enforces the SHA rule) over `.github/workflows/**` to `pr-quality.yml` in the first Wave 3 story that touches workflows (S24). Zero cost, covers every workflow forever.

---

### M17-S23 — GitHub environments + repository variables

**Agent:** `devops`
**Complexity:** S
**Docs to load:** `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`

**Description:**
Create **4 environments** (D10) in repo settings:

| Environment | Protection |
|---|---|
| `staging` | none (auto-deploy from `main`) |
| `production` | required reviewer: repository owner (solo — the gate is a deliberate pause + diff review before approving) |
| `staging-infrastructure` | none |
| `production-infrastructure` | required reviewer: repository owner |

Repository **variables** (non-sensitive): `GCP_PROJECT_STAGING=ikaro-staging`, `GCP_PROJECT_PROD=ikaro-prod`, `GCP_REGION=southamerica-east1`, `WIF_PROVIDER_STAGING` / `WIF_PROVIDER_PROD` (full resource names from S08), the six SA emails from the S08 split (`TF_DEPLOYER_SA_*`, `APP_DEPLOYER_SA_*`, `TF_PLANNER_SA_*`), `GAR_HOST=southamerica-east1-docker.pkg.dev`. Secrets: only `CLOUDFLARE_API_TOKEN` (added when the edge module lands — S22 needs it for DNS/cert automation; scope extended later by S40/S41) — everything else is WIF or Secret Manager.

**Acceptance criteria:**
- [ ] 4 environments exist; production ones cannot deploy without an approval (test with a dummy workflow)
- [ ] Zero `GCP_SA_KEY*` secrets in the repository
- [ ] Variables resolve correctly from a test workflow run

**Dependencies:** M17-S08

---

### M17-S24 — Infrastructure pipeline (`infra-deploy.yml`)

**Agent:** `devops`
**Complexity:** M
**Docs to load:** `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`, vendored HashiCorp skills

**Description:**
The Terraform lifecycle the user asked for: commit to `infra/` triggers plan/apply. **After this story merges, manual `terraform apply` is forbidden** (README + this doc are the record).

**`.github/workflows/infra-deploy.yml`:**
- **On `pull_request` touching `infra/terraform/**`:** `terraform fmt -check`, `validate`, **`terraform test` per module** (mocked providers — needs no credentials, so it runs before any auth step; Wave 2 preamble rule), Checkov, then `terraform plan` for **both** envs — authenticated as the read-only **`tf-planner`** SAs (S08: PR refs cannot mint deployer credentials, by WIF binding). Post plan output to the **workflow job summary only**, with a short status comment on the PR linking to the run (revised 2026-07-08: the repo is public — full plans in PR comments would publish infra topology: resource names, CIDRs, SA emails). No apply ever on PRs. Public-repo note (2026-07-07): fork PRs are not granted `id-token: write`, so they cannot mint even planner credentials — plans run only on same-repo branches (fine for a solo repo).
- **On `push` to `main` touching `infra/terraform/**`:** job `apply-staging` (environment `staging-infrastructure`, authenticated as **`tf-deployer`** — mintable from `main` only): `terraform apply -auto-approve` for `envs/staging`, using the **plan artifact** from the merged commit where practical. Then job `apply-prod` (environment `production-infrastructure`, `needs: apply-staging`): re-plan prod, **wait for approval**, apply. Reviewer sees the fresh prod plan in the job log before approving.
- **Concurrency:** apply jobs use `concurrency: { group: staging-mutations, cancel-in-progress: false }` (prod: `production-mutations`) — the **same group names the app deploy workflow uses (S25)**, so a PR touching both `infra/**` and `apps/**` cannot run a Terraform apply and an app deploy concurrently (review finding: infra/app race). GCS state locking is the second line of defense.
- **Convention (enforced as a `/pre-pr` checklist line + workflow header comment):** do not mix `infra/terraform/**` and `apps/**` changes in one PR; when unavoidable, note in the PR that infra applies first and re-run the app deploy if it won the race.
- **Drift detection (added 2026-07-08):** a weekly `schedule:` trigger runs `terraform plan -detailed-exitcode` for both envs as **`tf-planner`** (read-only); exit code 2 (non-empty plan) turns the run red. Out-of-band drift is otherwise invisible between applies.
- **`TF_VAR_iam_admin_user` (S13 discovery):** plan/apply jobs must supply this from a GitHub **environment variable** (`vars.IAM_ADMIN_USER`) on `staging-infrastructure` / `production-infrastructure` — **not a GitHub Secret.** The email is an identity, not a credential (it grants nothing by itself; Google auth + the IAM role bindings in `modules/database` are what actually gate access — settled in S13 discovery). Using a Secret here would be the wrong tool: Actions masks secret values in every log line, so a legitimate `terraform plan` diff or error message that includes `user:admin@ikaro.online` would render as `***`, hurting debuggability for zero security gain. Reserve Secrets for values that grant access by themselves (tokens, passwords, keys) — GitHub's own guidance draws this same line. The value is still kept out of git (public repo); the database module's own email-format validation makes a missing/empty value fail `terraform plan` immediately (not a silent deletion of the IAM DB user).
- Failure of staging apply blocks the prod job.

**Acceptance criteria:**
- [ ] PR touching only `infra/**` runs plans + comment, and does NOT trigger app deploy workflows (path filters verified both directions)
- [ ] `actionlint` + `zizmor` run in `pr-quality.yml` over all workflows and pass (Wave 3 preamble)
- [ ] Merge auto-applies staging; prod apply visibly waits for approval
- [ ] Two rapid merges do not run concurrent applies (concurrency proven)
- [ ] Checkov failure blocks merge (branch protection updated if needed)
- [ ] Weekly drift plan: green on clean state; red on injected drift (test once with an out-of-band label change, then revert)

**Dependencies:** M17-S11, M17-S23

---

### M17-S25 — Staging deploy pipeline (`deploy-staging.yml`)

**Agent:** `devops`
**Complexity:** L
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` (reference only — M17 §0 wins), Dockerfiles, S20

**Description:**
On every push to `main` touching `apps/**`, `packages/**`, or lockfile: build → scan → push → migrate → deploy → smoke. Trunk-based, no approval (D10).

**Stages** (workflow authenticates as **`app-deployer`** — the narrow S08 credential; deploy jobs share `concurrency: { group: staging-mutations }` with the infra pipeline, see S24):
1. **Build+scan+push (matrix, parallel):** backend, bff, web. Tags: `ikaro-backend:<sha>`, `ikaro-bff:<sha>`, `ikaro-web:<sha>-staging` (web bakes `NEXT_PUBLIC_BFF_URL=<staging bff run URL>`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` as build args — see D8; add these as Docker `ARG`/`ENV` in `apps/web/Dockerfile` if not present). Trivy scan each image, fail on HIGH/CRITICAL (align config with the existing `pr-security.yml` conventions). Push to the shared GAR (app-deployer WIF). Use registry layer caching (`--cache-from`) to keep the pipeline under ~15 min.
2. **Migrate (environment `staging`):** `gcloud run jobs update ikaro-migrate --image …backend:<sha>` + `gcloud run jobs execute ikaro-migrate --wait`. Non-zero → pipeline stops; nothing deploys against a half-migrated schema.
3. **Deploy (sequential):** `gcloud run deploy ikaro-backend --image …:<sha>` → wait READY → bff → web. Sequential because BFF readiness checks the backend.
4. **Smoke:** `curl -f <bff-run-url>/v1/health/ready` and `<web-run-url>/api/health/ready` with retries/backoff (cold start tolerance). Failure → workflow red (rollback in staging = fix forward or re-run with previous SHA; document both in the workflow header comment).

**Acceptance criteria:**
- [ ] Merge to `main` (app change) auto-deploys staging end-to-end in <15 min
- [ ] Failed Trivy scan → nothing pushed; failed migration → nothing deployed (prove both with deliberate temp failures on a branch, screenshots/log links in PR)
- [ ] Image tags are SHA-based; `latest` never used
- [ ] Doc-only / `infra/`-only commits do not trigger this workflow
- [ ] A commit touching only `apps/web` still builds/deploys all three (keep it simple; per-app change detection is a documented future optimization)

**Dependencies:** M17-S15, S18, S20, S23; staging infra applied (S27 runs the first real pass)

---

### M17-S26 — Production promote pipeline (`deploy-production.yml`)

**Agent:** `devops`
**Complexity:** M
**Docs to load:** `docs/12-DEPLOYMENT_STRATEGY.md` § rollback (reference only — M17 §0 wins), S25

**Description:**
`workflow_dispatch` with input `image_sha`. Promotes the staging-validated artifacts: backend/bff by **exact same image**; web by building `ikaro-web:<sha>-prod` from the same git SHA with prod build args (documented D8 exception — the only rebuild, from identical source).

**Stages:**
1. **Validate input:** images for `<sha>` exist in GAR AND `<sha>` is an ancestor of `main` AND staging currently runs it (query `gcloud run services describe` in staging) — else fail with a clear message.
2. **Approval (environment `production`):** the job summary prints: SHA, `git log --oneline <prod-current-sha>..<sha>`, and the pending migration files diff. One approval covers the whole run.
3. **Build web-prod image** (from the tagged SHA checkout) + Trivy.
4. **Migrate:** prod migrate job with `…backend:<sha>` — `--wait`, hard stop on failure.
5. **Deploy sequential** backend → bff → web; each waits READY.
6. **Smoke:** `https://bff.ikaro.online/v1/health/ready`, `https://ikaro.online/api/health/ready`, plus one real public read (`GET /v1/hotsite/<seeded-slug>` — adjust to the live BFF route). **Build-arg assertion (added 2026-07-08):** the web-prod image is the only rebuilt artifact (D8) and its worst failure — a wrong `NEXT_PUBLIC_*` value baked in — is invisible to health smokes (they exercise the server side, not the client bundle). Curl the prod homepage and assert the served HTML/JS references `bff.ikaro.online` and contains no `run.app`/staging origin.
7. **Rollback procedure (workflow header + `docs/RUNBOOKS.md` section):** re-run with the previous SHA (Cloud Run also keeps previous revisions for instant console rollback of a single service). Migrations follow expand/contract (repo rule) so rolling back code without reverting schema is safe by construction; `migration:revert` is the documented last resort.

**Acceptance criteria:**
- [ ] Cannot run without approval; cannot promote a SHA that never reached staging
- [ ] Backend/BFF images are byte-identical to staging’s (digest comparison in the job log)
- [ ] Smoke failure marks the run failed and prints the rollback one-liner
- [ ] Build-arg smoke: served prod HTML references `bff.ikaro.online`, zero `run.app`/staging origins (prove once with a deliberately wrong build arg on a scratch deploy or dry run)
- [ ] Total promote time (post-approval) < 15 min

**Dependencies:** M17-S25; prod infra applied (S37)

---

## Wave 4 — Staging live

---

### M17-S27 — Staging activation: secrets, first real deploy, full validation

**Agent:** `devops`
**Complexity:** M
**Docs to load:** this file §1–§2, `SECRETS.md` (S16)

**Description:**
Turn staging from placeholder to a working environment. This is a runbook + checklist story; its PR carries only doc updates.

**Steps:**
1. **Flip `enable_database=true` in staging tfvars + apply** (instance creation deferred from S13 — the ~$9/mo charge starts here), then verify the deferred S13 AC: instance private-IP only + SSL enforced, `cloud-sql-proxy --auto-iam-authn` login from the dev machine, backups visible in console. Populate staging secret values (`gcloud secrets versions add`): jwt-secret (`openssl rand -hex 64`), internal-api-key, platform-admin-key, hotsite-revalidate-secret, OAuth pair (S10), Brevo SMTP key. **Create the DB user + password out-of-band per the S13 snippet** (`gcloud sql users create` + `db-password` secret version — never via Terraform, §2). Record rotation dates in `SECRETS.md`.
2. Flip `bootstrap_mode=false` (S18) via the infra pipeline; set staging env vars: `APP_ENV=staging` (which is what makes `ENABLE_DEV_AUTH=true` legal — S06), `ENABLE_DEV_AUTH=true`, `EMAIL_ADAPTER=brevo`, `LOG_LEVEL=DEBUG`.
   **Staging data rule (compensating control, 2026-07-07):** `ENABLE_DEV_AUTH=true` on a public `*.run.app` URL is an authentication bypass for anyone who discovers the URL. Accepted **only** under this rule: staging holds synthetic/test data exclusively — never real customer data, never a copy of prod. Record the rule in `docs/RUNBOOKS.md` (staging section) as part of this story.
3. Trigger `deploy-staging.yml` (empty commit or re-run) → first real images deploy.
4. **Validation checklist (all deferred items from Wave 2 land here):**
   - [ ] 3 services READY with real images; probes green
   - [ ] Backend unreachable from internet; reachable from BFF (S18 check)
   - [ ] Migrations applied (S20 check); tables present via `cloud-sql-proxy` + psql
   - [ ] Google login works on the staging web URL (test user from S10)
   - [ ] Guest booking flow end-to-end on the staging hotsite (creates booking, email lands via Brevo)
   - [ ] Pub/Sub push observed: `BookingRequested` handled, notification sent, no DLQ messages (S19 check)
   - [ ] `gcloud scheduler jobs run` → cron push hits backend (S21 check)
   - [ ] Signed-URL photo upload works from the browser (S14 CORS check)
   - [ ] Tenant provisioning via `gcloud run services proxy` + `PLATFORM_ADMIN_KEY` documented and exercised (creates the staging demo tenant used by E2E)
5. Document every gap found as a follow-up issue — do not hotfix silently.

**Acceptance criteria:** the checklist above, fully checked, committed to this story’s section (edit this file via doc-gate).

**Dependencies:** Waves 2–3 complete (except S22/S26 which are prod-only)

---

### M17-S28 — Playwright E2E against staging

**Agent:** `test-ts`
**Complexity:** M
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § E2E, `apps/web/e2e/helpers/` tree, M115 IA § Dev Login

**Description:**
Absorbs the remainder of old M16-S06. The CI-per-PR E2E infra already exists (AUD-015, `pr-e2e.yml`); the old story’s `E2E_TEST_MODE`/`test-login` design is **superseded by the shipped Dev Login (`ENABLE_DEV_AUTH`, M115-S02)** — do not implement a second bypass.

**What to implement:**
1. Make the E2E suite target a deployed env: `PLAYWRIGHT_BASE_URL` + `PLAYWRIGHT_BFF_URL` already exist in config — verify every spec/helper honors them (no hardcoded localhost; repo rule: helpers in `e2e/helpers/<feature>/`).
2. Auth journeys use Dev Login against staging (`ENABLE_DEV_AUTH=true` there; S06 guarantees prod refuses it) with the staging demo tenant’s seeded accounts (S27) — no personal emails (repo rule).
3. Journeys (golden paths only): guest booking on hotsite; customer login + booking + “Próximos agendamentos”; staff approval via CommandCenter; complete + loyalty points visible; hotsite renders per tenant (modules + `--ba-*` branding).
4. New manual workflow `.github/workflows/e2e-staging.yml` (`workflow_dispatch` + optional weekly cron): runs the suite with staging URLs. Also invoked as an optional post-deploy check from S25 (non-blocking at first; flip to blocking once stable — note in workflow).
5. Screenshots/traces on failure uploaded as artifacts.

**Acceptance criteria:**
- [ ] All journeys green against staging from CI (link a passing run)
- [ ] Same suite still passes locally against the dev stack (`pr-e2e.yml` unaffected)
- [ ] No new login helper duplicates; existing `e2e/helpers` extended per repo conventions
- [ ] Each journey < 60s

**Dependencies:** M17-S27

---

## Wave 5 — Hardening + Observability

---

### M17-S29 — Tenant isolation integration suite (all contexts)

**Agent:** `test-ts`
**Complexity:** M
**Docs to load:** `docs/06-TENANT_ISOLATION_STRATEGY.md`, `docs/08-TESTING_STRATEGY.md` § tenant isolation

**Description:**
Preserved from old M16-S04 — still fully valid and the highest-value hardening story. Dedicated suite `pnpm test:isolation` (Testcontainers Postgres + Pub/Sub emulator, no mocks): create Tenant A + Tenant B, create A’s data, access it with B’s identity, assert `404` (existence not revealed) or list-scoping.

**Contexts:** Booking (`GET /bookings/:idA` as B → 404), Service (PATCH), Staff (GET), Loyalty (list returns only B’s entries), Schedule closures (DELETE → 404), Platform settings (PATCH affects only B). Add the storage path check: A’s booking photo path is not derivable/servable under B’s tenant prefix.

**Acceptance criteria:**
- [ ] ≥7 tests, one per context + storage; names `should not expose TenantA <entity> to TenantB request`
- [ ] No `.skip()`; suite wired into CI (extend `pr-tests.yml` or a dedicated job) and into `/pre-pr`
- [ ] Any failure documented as a critical security bug process (README of the suite)

**Dependencies:** none within M17 (cloud-independent — Testcontainers only; parallelizable inside Wave 5 or pulled earlier at will; must land before S37)

---

### M17-S31 — Error catalog audit (RFC 9457)

**Agent:** `backend-ts` + `bff-ts`
**Complexity:** S
**Docs to load:** `docs/25-ERROR_CATALOG.md`

**Description:**
Old M16-S08 is **largely already implemented** (`shared/http/problem-detail.ts`, per-context mappers, zod pipe). This story is an audit, not a build: sweep every non-2xx path in backend + BFF and close gaps.

**Audit checklist:**
- Every 4xx/5xx: `Content-Type: application/problem+json`, `type` URI `https://ikaro.online/errors/<kebab>`, `correlationId` present, pt-BR `detail`
- Validation 400s include `violations[]` per catalog
- Unhandled exceptions → generic 500, **no stack traces when `NODE_ENV=production`** (spec proves it)
- BFF error passthrough: backend Problem Details survive the BFF unmangled; BFF-originated errors (auth, throttle) use the same shape
- Every VO/domain error class has `Object.setPrototypeOf` (repo-known silent-500 trap) — grep-verify
- Update `docs/25-ERROR_CATALOG.md` where the implemented catalog diverges (doc-gate applies)

**Acceptance criteria:**
- [ ] Audit table (route group → verdict) attached to the PR description
- [ ] All gaps fixed with specs in the same PR
- [ ] Production-mode 500 spec exists in both apps

**Dependencies:** none

---

### M17-S33 — OpenTelemetry SDK bootstrap (traces, OTLP-only)

**Agent:** `backend-ts` + `bff-ts`
**Complexity:** M
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § OTel

**Description:**
Old M14-S01 preserved with the anti-lock-in rule: **only OTLP exporters in code** (D9). `src/tracing.ts` in backend and BFF, imported first in `main.ts`: `NodeSDK` + `getNodeAutoInstrumentations` (http, express/nest, pg/typeorm) + `OTLPTraceExporter` to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318` — the sidecar; unset/disabled in local dev unless `pnpm obs` profile used). Sampling: `ParentBasedTraceIdRatio` from `OTEL_TRACES_SAMPLER_ARG` (staging 1.0, prod 0.1). Span enrichment: `tenant.id`, `correlation.id` attributes from `RequestContext` (interceptor). Exclude `/health/*` and `/pubsub/push` heartbeat noise via instrumentation ignore rules. Wire S05’s trace-correlation log fields (they activate automatically once spans exist). Manual business spans (old M14-S02) are explicitly **deferred** — auto-instrumentation covers HTTP+DB+outbound; revisit when debugging demands it. **TD24-S05 cross-reference (2026-07-14):** the outbox/inbox relay (`OutboxRelayService`) already logs `tenant.id`/`correlation.id` as structured fields for its sweep/GC operations — same "activates automatically once spans exist" pattern as every other log line here; no relay code change needed when this story lands. **TD23-S18 cross-reference (2026-07-14):** `error.code` is already attached to every non-2xx structured log line (backend + BFF, via `AppLogger`) — same "activates automatically once spans exist" pattern; this story should also attach `error.code` as a span attribute on the request span when it lands (TD23-S18's original ask, deferred here since no spans existed yet).

**Acceptance criteria:**
- [ ] With a local collector (`docker run otel/opentelemetry-collector` debug exporter), one HTTP request produces: server span → typeorm client spans, with `tenant.id` attribute
- [ ] Zero vendor packages (`@google-cloud/opentelemetry-*` forbidden) — lint/grep check documented
- [ ] Health endpoints produce no spans
- [ ] Startup without a reachable collector degrades gracefully (no crash, warn once)
- [ ] `OTEL_SDK_DISABLED=true` fully disables (used in unit tests/CI)

**Dependencies:** M17-S05

---

### M17-S34 — OTel Collector sidecar (the vendor boundary)

**Agent:** `devops`
**Complexity:** M
**Docs to load:** D9, S18 module, S33

**Description:**
The collector is where GCP appears — and the only place. Build a pinned image `infra/docker/otel-collector/` (FROM `otel/opentelemetry-collector-contrib:<pinned>`, config baked in) pushed to GAR by the staging pipeline (or a tiny dedicated workflow). Add the base image to Dependabot (`docker` ecosystem on `infra/docker/otel-collector/`) so the pin receives update PRs (2026-07-08). **Validate the config at build time (added 2026-07-08):** run the collector's built-in `validate` subcommand against `config.yaml` in the image-build step — a YAML/pipeline typo becomes a build failure instead of a sidecar crash-loop discovered in staging. Config (`config.yaml`, versioned):
- receivers: `otlp` (http 4318, grpc 4317, localhost only)
- processors: `memory_limiter`, `batch`, `resourcedetection` (gcp)
- exporters: `googlecloud` (traces). Metrics pipeline stub commented for future `googlemanagedprometheus`.
- A commented **alternate exporter block** (`otlp` → self-hosted Tempo/other vendor) with the note: *swapping vendors = edit this file + rebuild + `terraform apply`. No app change.*
Terraform: activate the sidecar in the S18 module for backend + BFF (128Mi/0.1 CPU, depends-on ordering so the app container starts after the collector is listening — use Cloud Run sidecar `container_dependencies` + a startup probe on the collector health extension). Runtime SA already has `cloudtrace.agent` (S17).

**Acceptance criteria:**
- [ ] Staging: a real request appears as a trace in Cloud Trace with `tenant.id` attribute, and its log lines link to it (S05 correlation) in Logs Explorer
- [ ] Collector memory-bounded; app boots even if collector crashes (graceful degradation from S33)
- [ ] Prod sampling at 10% (env-controlled) — cost note recorded
- [ ] Collector config change → image rebuild → deploy path documented in `infra/docker/otel-collector/README.md`
- [ ] Config `validate` runs in the image build; a deliberately broken config fails the build (prove once)

**Dependencies:** M17-S18, M17-S33

---

### M17-S35 — Dashboards, alerts & uptime checks as code

**Agent:** `devops`
**Complexity:** M
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § SLOs/alerting (metric *intents*; the metric names there are stale — use Cloud Run built-ins)

**Description:**
`modules/monitoring` (both envs; alert thresholds via variables): 
- **Uptime checks (prod):** `https://bff.ikaro.online/v1/health/ready`, `https://ikaro.online/api/health/live` (staging: run.app equivalents, relaxed). FinOps note (2026-07-07): uptime checks probe from multiple regions every few minutes, keeping prod BFF/web permanently warm — scale-to-zero effectively stops applying to them. Accepted: the cost is a fraction of an instance and it masks cold starts for real users; the §1 cost model's Cloud Run line absorbs it.
- **Alert policies:** uptime failure; Cloud Run 5xx rate > 5% over 5m (per service); p99 latency > 2s over 10m; Cloud SQL disk > 80% & CPU > 80%; **any DLQ topic with undelivered messages > 0 for 10m** (per-DLQ, from S19 catalog — this is the “events are silently dying” alarm); Cloud Run instance count stuck at max; **staging only:** log-based alert on Dev Login usage (`ENABLE_DEV_AUTH` flow) — turns the S27 accepted risk into a watched one (any use from an unexpected source gets investigated; 2026-07-08). Notification channel: email (admin address); structure so a Slack webhook channel can be added later.
- **Dashboard:** one per env (JSON in Terraform): request rate/latency/5xx per service, instance counts, SQL connections/CPU, Pub/Sub oldest-unacked-age, DLQ depths.
- Log-based metric: count of `severity=ERROR` per service, alerted at a burst threshold.
- **Business counters via log-based metrics (zero app code):** use cases already log start/completion with structured fields (S05), so define Terraform log-based counters for: bookings requested, approved, completed, and failed notifications. Dashboard panel per counter. Anything beyond these four waits for real traffic (do not overbuild — the Managed Prometheus path exists when needed).
- **TD24-S05 cross-reference (2026-07-14):** the outbox/inbox relay (`OutboxRelayService`) already logs structured fields for unpublished-row count, oldest-unpublished age, GC deletion counts, and publish-failure counts — same zero-app-code log-based-counter treatment applies. Add an alert policy here for oldest-unpublished age > 3 sweep intervals (the "events are backing up" signal, same category as the DLQ-depth alarm above) when this story is implemented.

**Acceptance criteria:**
- [ ] Kill staging backend (scale a bad revision) → uptime/5xx alerts fire to email within policy windows
- [ ] Publish a poison message → DLQ alert fires (test via a temp subscription with maxAttempts=1)
- [ ] Dashboards render with live data in both envs
- [ ] All thresholds are variables with documented rationale

**Dependencies:** M17-S19, M17-S27

---

### M17-S36 — Cloud Armor origin lockdown (prod — enabled at go-live)

**Agent:** `devops`
**Complexity:** S
**Docs to load:** D5, S22

**Description:**
Closes the “bypass Cloudflare by hitting the LB IP directly” hole. `modules/edge` gains a Cloud Armor security policy on both backend services (web/bff NEGs): allow only Cloudflare’s published IP ranges (terraform `cloudflare_ip_ranges` data source, refreshed on apply), default deny-403. Health checks from Google infra are unaffected (they don’t traverse the external LB path). **Cost:** ~$6–8/mo. **Decision updated per review (2026-07-07): enabled at production go-live (S37 checklist), not deferred to “first real traffic”** — without it, the Cloudflare WAF/DDoS layer is bypassable and the §2 edge claim is advisory. Accepted that this nudges worst-case total to ~$52/mo (D12 note). The module still ships behind `var.enable_origin_lockdown` (so staging-style validation can run without it), but prod tfvars sets it `true` from day one. Optionally pair with Cloudflare **Authenticated Origin Pulls** later (documented as follow-up, not built).

**Acceptance criteria:**
- [ ] With flag on: direct `curl https://<LB-IP> -H 'Host: ikaro.online' -k` → 403; via Cloudflare → 200
- [ ] Prod tfvars has `enable_origin_lockdown = true` before S37 executes
- [ ] IP ranges come from the data source, never hardcoded

**Dependencies:** M17-S22

---

### M17-S49 — Disaster recovery runbook + staging restore drill

**Agent:** `devops`
**Complexity:** M
**Docs to load:** S13 (backups/PITR), S11 (state layout), S16 (`SECRETS.md`)

**Description:**
**Found in review (2026-07-07):** the plan has backups, PITR, rollback, and state versioning as *facts*, but no recovery targets, no tested restore procedure, and no recovery runbooks — and untested backups are not backups. This story writes `docs/RUNBOOKS.md` § Disaster Recovery and **executes the first restore drill against staging** before production go-live (S37 depends on this).

**What to produce:**
1. **Targets (documented, with rationale):** prod RPO ≤ 1h (PITR); staging RPO ≤ 24h (daily backup). RTO target: ≤ 2h for DB restore, ≤ 30min for app rollback (Cloud Run revision / re-promote previous SHA). These are commitments to yourself — revisit when the first paying tenant lands.
2. **Cloud SQL restore drill (executed now, then quarterly):** restore the latest staging backup into a **fresh instance** (`gcloud sql backups restore` → new instance), point a temporary backend revision at it, verify the app boots and a booking reads correctly, then destroy the instance (cost: cents/hour while it exists). Record date + duration + gaps in the runbook. Add a quarterly calendar reminder.
3. **Terraform state recovery:** procedure to list and restore a prior state generation from GCS bucket versioning (`gsutil ls -a` → copy generation back), including when to use it (corrupted state, bad apply) and when NOT to (drift — use `terraform plan` reconciliation instead).
4. **Secret rotation gone wrong:** Secret Manager retains prior versions — runbook: re-enable the previous version, redeploy (Cloud Run resolves `latest` at instance start), verify, then destroy the bad version. Note which secrets are paired (e.g. `jwt-secret` shared by three services — rotate = redeploy all three or sessions break).
5. **Alert routing recap:** one table — which alert (billing, uptime, 5xx, DLQ, SQL disk, ERROR burst) notifies whom, on which channel (S07 budgets + S35 policies). For a solo operator: email + phone-visible channel; document the intent to add a second recipient when one exists.

**Acceptance criteria:**
- [ ] `docs/RUNBOOKS.md` § DR covers all five areas with copy-pasteable commands
- [ ] Restore drill executed on staging: evidence (timings, instance name, verification steps) recorded; temp instance destroyed
- [ ] RPO/RTO targets stated and consistent with S13's backup/PITR configuration
- [ ] Quarterly drill reminder exists (calendar or scheduled issue)

**Dependencies:** M17-S27 (staging live); blocker for M17-S37

---

### M17-S50 — Production access & audit policy

**Agent:** `devops`
**Complexity:** S
**Docs to load:** M17 §2, S07/S08 (identities), S49

**Description:**
**Found in review (2026-07-07):** the security *mechanisms* exist (2FA, no keys, no SSH, WIF, audit logs) but there is no written policy — who holds what, what happens if the sole operator loses access, when access is reviewed. One short governance doc, proportionate to a solo-operated platform.

**What to produce (`docs/SECURITY_GOVERNANCE.md`, doc gate applies):**
1. **Role inventory:** the admin identity is the only human with org/project Owner; everything else (CI, runtime) is enumerated with its S08/S17 role set. Any new human gets least-privilege roles, never Owner.
2. **Break-glass account:** the second admin identity **created back in S07** (moved there 2026-07-07 — the lockout risk is live from Day 0). This story verifies and drills it (login + revoke test), documents the activation procedure + a log requirement (any break-glass use is written up). For a solo operator this is the difference between "lost my phone" and "lost the platform".
3. **Quarterly IAM review:** 15-minute checklist — `gcloud projects get-iam-policy` diff vs the documented inventory, SA key check (must stay zero), WIF binding check, dormant-identity removal. Same calendar cadence as the S49 drill.
4. **Audit log expectations:** Admin Activity logs (400-day default retention, free) are the baseline; decide and document Data Access logs per service (enable for Secret Manager and Cloud SQL at minimum — low volume, high forensic value; leave GCS data-access off until traffic justifies the cost).
5. **2FA statement:** hardware key (or authenticator minimum) on the admin Google account, Cloudflare, GitHub, Brevo — already required by S07/S09; this doc is where the requirement lives permanently.

**Acceptance criteria:**
- [ ] `docs/SECURITY_GOVERNANCE.md` exists covering the five areas
- [ ] Break-glass identity (created in S07) verified and tested (login + revoke drill), key stored offline
- [ ] Data Access audit logs enabled for Secret Manager + Cloud SQL via Terraform
- [ ] First quarterly review executed as part of this story (baseline)

**Dependencies:** M17-S08; parallelizable within Wave 5

---

## Wave 6 — Production go-live

---

### M17-S37 — Production activation + first tenant

**Agent:** `devops` + `backend-ts`
**Complexity:** L
**Docs to load:** this file §1–§2, UC-024, S26, S27

**Description:**
Runbook story mirroring S27 for prod, plus DNS cutover and the first real tenant. Execute in order; check every box.

**Go-live checklist:**
1. **OAuth consent verification:** submit the consent screen for Google verification (started back in Wave 5 per S10 — confirm status; production login for arbitrary users requires it).
2. **Prod secrets:** populate all values — **freshly generated, never staging’s** (`jwt-secret`, `internal-api-key`, `platform-admin-key`, `hotsite-revalidate-secret` via `openssl rand -hex 64`; prod OAuth pair; prod Brevo SMTP key; DB user + `db-password` per the S13 out-of-band snippet). Record in `SECRETS.md`.
3. **Prod Terraform apply** via the infra pipeline (`production-infrastructure` approval) — includes the edge module (S22): ALB, certs, Cloudflare records. Verify cert ACTIVE before cutover.
4. **Prod env vars:** `ENABLE_DEV_AUTH` **unset**, `LOG_LEVEL=INFO`, `OTEL_TRACES_SAMPLER_ARG=0.1`, `ALLOWED_ORIGINS=https://ikaro.online`.
5. **First promote:** run `deploy-production.yml` with the current staging-validated SHA. Approve after reviewing the diff summary.
6. **Smoke through the edge:** `https://bff.ikaro.online/v1/health/ready` → 200 via Cloudflare (orange-cloud); login page loads on `https://ikaro.online`; auth cookie flows web↔BFF (D11 cookie note — verify in Chrome AND Safari, since prod is same-site). Verify origin lockdown active (S36): direct LB-IP access → 403.
7. **First tenant (UC-024):** in one terminal `gcloud run services proxy ikaro-backend --project=ikaro-prod --region=southamerica-east1 --port=8080`; in another:
   ```bash
   curl -X POST http://localhost:8080/internal/tenants \
     -H "X-Platform-Admin-Key: $(gcloud secrets versions access latest --secret=platform-admin-key --project=ikaro-prod)" \
     -H "Content-Type: application/json" \
     -d '{ "name": "…", "slug": "…", "adminEmail": "…", "timezone": "America/Sao_Paulo" }'
   ```
   **Guard-layering caution (verify during S27's staging provisioning first):** `InternalApiGuard` (M115-S03) is a global BFF↔backend gate — confirm how it treats `/internal/*` routes; if they are not exempt, this curl also needs the `-H "X-Internal-Key: $(gcloud secrets versions access latest --secret=internal-api-key --project=ikaro-prod)"` header. Record the working command shape in the runbook. The `Authorization` header is owned by the proxy's injected IAM ID token — that is why the admin key travels in `X-Platform-Admin-Key` (S52).
   Verify: `TenantProvisioned` handled (staff row + default templates seeded — M04/M11 behavior), invite email delivered, hotsite renders at `https://ikaro.online/<slug>`.
8. **E2E-lite against prod:** guest booking journey only (no dev-auth in prod by design) + manual staff approval pass.
9. **Observe for 30 min:** dashboards clean, no DLQ messages, no ERROR-burst alert, billing dashboard sane.
10. Add the runbooks to `docs/RUNBOOKS.md`: proxy access, rollback, secret rotation, and **DLQ inspection + replay** (per the S19 contract: pull from the `-inspect` subscription, fix root cause, re-publish envelope to the source topic — safe via `eventId` idempotency).

**Acceptance criteria:** checklist fully executed and recorded; prod serving on `ikaro.online` behind Cloudflare; first tenant live; zero critical alerts in the first 24h.

**Dependencies:** all of Waves 2–5 (explicitly including S49's executed restore drill), M17-S26

---

## Wave 7 — Post-launch product stories (do not block go-live)

> S38–S40 implement **customer custom domains** (tenant buys `www.beloauto.com.br` → serves their hotsite). ⚠️ **Doc gate first:** this capability has no UC. S38 begins by adding **UC-032 — Admin configures a custom hotsite domain** to `docs/04-USE_CASES.md` (+ §6 index in `CLAUDE.md`) — per the repo rule “Missing UCs: do not implement until documented.”

---

### M17-S38 — Tenant custom domain: backend + BFF + dashboard settings

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` (new UC-032), `docs/21-TENANTS_SETTINGS_SCHEMA.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/24-BFF_ARCHITECTURE.md`

**Description:**
1. **Docs first:** write UC-032 (main flow: admin enters domain → sees CNAME instructions → system verifies → domain activates; alt flows: verification pending/failed, domain removal, domain already claimed by another tenant).
2. **Backend (Platform context):** migration adding `custom_domain` (nullable, **globally unique**, lowercase-normalized) and `custom_domain_status` (`PENDING|VERIFIED|FAILED`) to `tenants` (expand/contract; register in `integration-global-setup.ts` same commit). Domain VO (`shared/value-objects/`): RFC hostname validation, no scheme/path, reject `ikaro.online` and subdomains (typed domain error + mapper branches per repo rule). Use cases: `SetTenantCustomDomainUseCase`, `RemoveTenantCustomDomainUseCase`, `GetTenantByCustomDomainUseCase` (the host-routing read — canonical single read, no bespoke query service). Public BFF endpoint `GET /v1/hotsite/domain-lookup?host=` → `{ slug } | 404` (rate-limited public tier; response cacheable 5 min).
3. **Dashboard UI:** field in tenant settings (hotsite section) with status chip + CNAME instructions (`CNAME www.beloauto.com.br → hotsites.ikaro.online`). Localization-ready pt-BR + en (repo rule); co-located `.spec.tsx`.
4. Verification worker: on save → `PENDING`; a check (triggered on save + retry via the existing cron path) resolves the domain’s CNAME/HTTP and flips status. Keep the check behind a port (`IDomainVerificationPort`) — infrastructure adapter does DNS-over-HTTPS lookup; unit-testable with an InMemory double.

**Tenant isolation:** global uniqueness on `custom_domain` is intentionally cross-tenant (a domain can belong to one tenant); conflict → typed error, never reveals the owning tenant.

**Acceptance criteria:**
- [ ] UC-032 documented before code (PR includes the doc commit first)
- [ ] Migration backward-compatible; uniqueness enforced at DB level
- [ ] Domain-lookup endpoint: found/miss/invalid-host specs; per-tenant settings specs; UI specs both locales
- [ ] Attempting to claim an already-claimed domain → 409 Problem Detail without leaking the owner

**Dependencies:** M17-S37 (prod live); UC-032 doc approval

---

### M17-S39 — Web host-based hotsite routing

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `apps/web/middleware.ts` + its spec, S38

**Description:**
`apps/web/middleware.ts` gains host routing: if the request `Host` is not a platform hostname (`ikaro.online`, `www.`, staging/run.app hosts — env-configured allowlist), resolve host → slug via the S38 lookup (through the canonical BFF transport; **middleware runs on the server — no `bffClient`**; use a fetch helper under `shared/lib/` with unit tests, honoring the CSP/connect-src rules) with an in-memory TTL cache (5 min) to avoid a lookup per request. On hit: rewrite `/<path>` → `/{slug}/<path>` (public hotsite routes only). On miss: 404 page. **Scope decision (document in code + UC-032):** custom domains serve the public hotsite only; any auth/dashboard link on a custom-domain page points absolutely to `https://ikaro.online/...` (cookies never span customer domains). Audit hotsite components for relative links that would break under a custom host (login CTA, booking flow, sitemap/robots — exclude custom hosts from sitemap generation).

**Acceptance criteria:**
- [ ] Local simulation: `curl -H 'Host: www.beloauto.test' localhost:3000/` renders the mapped tenant hotsite
- [ ] Unknown host → 404; platform hosts unaffected (middleware spec matrix)
- [ ] Auth links absolute to the platform domain on custom-host renders
- [ ] Lookup helper unit-tested; middleware spec updated in same commit (CSP untouched or updated with spec per repo rule)

**Dependencies:** M17-S38

---

### M17-S40 — Cloudflare for SaaS custom hostnames

**Agent:** `devops` + `backend-ts`
**Complexity:** M
**Docs to load:** S22 edge module, S38, Cloudflare for SaaS docs (external)

**Description:**
> **⚠️ Design-verification gate (added 2026-07-08 — resolve at `/story-discovery` before any implementation):** Cloudflare for SaaS forwards custom-hostname traffic to the fallback origin with **`Host:` = the customer's domain and (by default) SNI = the custom hostname** — not `hotsites.ikaro.online`. Two consequences the design below does not yet answer: (1) the ALB URL map needs a **wildcard/default host rule → web NEG**, or customer-domain requests match no route; (2) under SSL **Full (strict)** the Cloudflare→origin TLS handshake fails, because the Google-managed cert can never cover `www.beloauto.com.br`. Verify current Cloudflare capabilities per plan tier and settle one option in writing here: custom **origin SNI / Host-header rewrite** (historically paid/Enterprise), per-domain certs at the ALB via Certificate Manager DNS authorization (changes the customer instruction beyond one CNAME), or a scoped origin-pull downgrade for the SaaS path (documented tradeoff). The story must not start until this gate is closed.

SSL + edge routing for customer domains. Cloudflare for SaaS on the `ikaro.online` zone: **fallback origin** `hotsites.ikaro.online` (new proxied record → the ALB; add the hostname to the LB cert + host rule → web NEG). First 100 custom hostnames free, then ~$0.10/mo each (record in cost model). Customer instruction stays `CNAME → hotsites.ikaro.online` (matches S38 UI). Integration: extend S38’s verification adapter to also create/delete the Cloudflare custom hostname via API (scoped token from S16 `cloudflare-api-token`, now also with SSL for SaaS permissions) when a domain is set/removed; hostname status (SSL pending/active) feeds `custom_domain_status`. Terraform manages the SaaS zone settings + fallback origin where the provider supports it; per-tenant hostnames are **API-managed by the app** (runtime data, not infrastructure — document this boundary).

**Acceptance criteria:**
- [ ] A real test domain (any owned spare) CNAMEs to the fallback origin → HTTPS works with a Cloudflare-issued cert → hotsite renders via S39
- [ ] Removing the domain in the dashboard deletes the custom hostname (no orphans; verify via API list)
- [ ] Token scoped minimally; failure of the Cloudflare call surfaces as `FAILED` status, never a 500 to the admin UI
- [ ] Cost note updated (§1 table) with the per-hostname line
- [ ] Cloudflare for SaaS pricing re-verified against current Cloudflare docs before implementation (plan assumes 100 hostnames included + ~$0.10/additional/month, as of 2026-07-07)

**Dependencies:** M17-S38, M17-S39, M17-S22

---

### M17-S41 — Hotsite edge caching + purge-on-publish

**Agent:** `devops` + `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `apps/web/lib/hotsite/revalidate.ts` (ISR contract), S09 token

**Description:**
Today Cloudflare caches only static assets (default). Turn on HTML edge caching for hotsite pages — the CDN payoff — without serving stale content after an admin publishes:
1. **Cache rule (Cloudflare, prod):** cache eligible `GET` HTML for `ikaro.online/<slug>` hotsite routes + custom hostnames; **bypass** cookie-bearing requests, `/dashboard`, `/auth`, `/api`, `/bookings` and every authenticated tree. Edge TTL aligned with ISR (`revalidate = 300`), `stale-while-revalidate` semantics where available.
2. **Purge-on-publish:** the existing hotsite publish flow already triggers Next ISR revalidation (`HOTSITE_REVALIDATE_SECRET` path) — extend that same server-side handler to also call Cloudflare’s purge API (`purge by URL`: the slug’s hotsite URLs + custom hostname if any) using `cloudflare-api-token` (Cache Purge scope). Behind a port/adapter with an InMemory double; **best-effort**: purge failure logs ERROR but never fails the publish (TTL is the backstop — max 5 min staleness).
3. Verify `Cache-Control` emitted by Next for ISR pages cooperates (`s-maxage`) — adjust headers in one place (`next.config.ts` headers or the page segment config) if Cloudflare refuses to cache.

**Acceptance criteria:**
- [ ] Second anonymous hit on a hotsite → `cf-cache-status: HIT`; authenticated/dashboard routes always `BYPASS`/`DYNAMIC`
- [ ] Publish in the dashboard → hotsite change visible at the edge in seconds (purge proven), and within 5 min even if purge fails (kill-switch test)
- [ ] Purge adapter unit-tested; secret never logged
- [ ] Booking flow on a cached hotsite still works end-to-end (no caching of availability/API calls)

**Dependencies:** M17-S37 (+ S40 for custom hostnames coverage)

---

### M17-S42 — Documentation refresh to match deployed reality (full docs/ sweep)

**Agent:** `devops`
**Complexity:** M
**Docs to load:** entire `docs/` folder via `/docs-audit` (widened from the original infra-only scope). The 6 already-flagged docs (`docs/12-DEPLOYMENT_STRATEGY.md`, `docs/23-INFRASTRUCTURE_SETUP.md`, `docs/09-CI_CD_PIPELINE.md`, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md`, `docs/20-COST_OPTIMIZATION_STRATEGY.md`, `docs/10-OBSERVABILITY_STRATEGY.md`) carry known specific fixes below. Likely additional candidates worth close attention (not yet verified, let `/docs-audit` confirm): `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` (CI/CD structure fully redone in Wave 3), `docs/22-TECH_STACK_DECISIONS.md`, `docs/24-BFF_ARCHITECTURE.md`.

**Description:**
Run `/docs-audit` across the **entire `docs/` folder** (widened from the original infra-only scope — the whole milestone's decisions across Waves 1-6 need reconciling against every doc they could have affected, not just the 4 pre-identified ones), then update every doc `/docs-audit` flags to describe what was actually built (docs describe reality, not aspiration). Known specific fixes to verify regardless of what the audit finds: VPC connector → direct egress; pull → push; SA keys → WIF; Cloud Armor/IAP § → removed with a pointer to D4; secret catalog → live list; CI/CD § → the three real workflows; observability § → OTel + sidecar + managed backends (keep the self-hosted Grafana design as an explicitly-labeled *future option*, referencing D9's config-swap path); cost doc → §1 model; email provider references → Brevo, not SendGrid (S10). Also: revisit deployer SA scope-tightening (S08 note) and file follow-ups for anything intentionally deferred (manual business spans, Memorystore throttling, Authenticated Origin Pulls, staging edge). Each `.md` edit goes through the doc gate.

**Acceptance criteria:**
- [ ] `/docs-audit` clean across the full `docs/` folder afterwards (not just the previously-named subset)
- [ ] No doc still instructs creating SA keys, VPC connectors, or the IAP flow
- [ ] No doc still names SendGrid as the email provider
- [ ] Deferred-items list filed (issues or `td/` entries per repo convention)

**Dependencies:** M17-S37 (reality exists to document)

---

### M17-S43 — Client-side photo compression before upload

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** M115 IA § S01 (3-step signed-URL upload contract), `docs/08-TESTING_STRATEGY.md` § apps/web

**Description:**
Uploads currently go browser → V4 signed URL → GCS **raw** — a phone photo is 3–6MB. Resizing to ~1600px max-dimension WebP (~200–400KB) in the browser before the signed `PUT` cuts storage, egress, and hotsite page weight ~10× with no visible quality loss for service documentation. This is the single highest-leverage cost story for photos.

**What to implement:**
1. Shared helper `apps/web/shared/utils/compress-image.ts` (+ `.spec.ts` same commit, repo rule): input `File` → output `File`/`Blob`. Pipeline: `createImageBitmap(file, { imageOrientation: 'from-image' })` (EXIF rotation baked in — critical for phone photos) → draw to canvas capped at `MAX_DIMENSION=1600` preserving aspect ratio → `canvas.toBlob('image/webp', 0.8)`. Config (dimension/quality/format) as exported constants so tuning is one place.
2. **Fallbacks (fail-open):** if `createImageBitmap`/WebP encoding is unavailable or throws, or if the compressed result is *larger* than the original (already-optimized images), upload the original — never block a booking flow on compression. `GCS_MAX_UPLOAD_BYTES` remains the server-side hard cap either way.
3. Integrate at every upload call site: booking before/after photo pickers and the hotsite `GalleryImageManager` (grep the upload helper tree for all consumers of the signed-URL flow — do not fork per-component logic; one shared helper).
4. **Contract check:** the signed URL is generated for a declared content type — verify the M115-S01 contract (does the backend sign for a specific `Content-Type`?). If yes, request the signed URL *after* compression with `image/webp`; if the backend restricts allowed types, add `image/webp` to the allowlist (backend change in the same story, with spec).
5. Any new user-visible copy (e.g. a "processing photo…" state) localized pt-BR + en (repo rule).

**Acceptance criteria:**
- [ ] A 5MB portrait JPEG from a phone uploads as WebP ≤ ~500KB, correctly oriented, and renders in the booking detail and hotsite gallery
- [ ] Compression failure or larger-result path falls back to the original file (specs for both)
- [ ] All upload entry points go through the shared helper (grep proves no raw-`File` PUT remains)
- [ ] Signed-URL content-type contract verified/adjusted with backend spec if touched
- [ ] Helper unit tests cover: resize math, orientation, fallback, size-comparison branch

**Dependencies:** none (post-launch; independently shippable)

---

### M17-S44 — Public hotsite images behind the edge (`img.ikaro.online`)

**Agent:** `devops`
**Complexity:** M
**Docs to load:** S22 edge module, S14 storage module, S41 (cache rules)

**Description:**
`GCS_PUBLIC_BASE_URL` currently points at `storage.googleapis.com` directly — every hotsite image view is uncached GCS egress (~$0.12/GB), which at scale costs more than storage itself. Serve the public bucket through the existing prod ALB + Cloudflare so the edge absorbs repeat views (~90% egress reduction on popular hotsites).

**What to implement:**
1. **Terraform (`modules/edge`):** a **backend bucket** (`google_compute_backend_bucket`, `enable_cdn=false` — Cloudflare is the CDN; don't pay twice) pointing at `ikaro-public-prod`; host rule `img.ikaro.online` → backend bucket; add the hostname to the Certificate Manager cert (DNS authorization) and a proxied Cloudflare record → LB IP. No new forwarding rule → **no new fixed cost** (reuses the existing ALB).
   - Note: the classic `CNAME c.storage.googleapis.com` shortcut is explicitly rejected — it breaks under Cloudflare SSL Full (strict) (GCS CNAME origin is HTTP-only). The backend-bucket path is the correct one.
2. **Cloudflare cache rule:** `img.ikaro.online/*` → cache everything, long edge TTL (30d). Safe **only if objects are immutable**: verify the upload flow writes unique object names per upload (it does per the `tenants/<id>/bookings/<id>/<file>` + generated-name pattern — confirm for hotsite gallery uploads too; if any path overwrites in place, fix to versioned names in this story rather than adding purge complexity).
3. **Config:** prod `GCS_PUBLIC_BASE_URL=https://img.ikaro.online` (and `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` build arg for web-prod, S26). Staging keeps `storage.googleapis.com` (no LB there — D5); the env divergence is config, not code.
4. CSP check: if the web `connect-src`/`img-src` in `apps/web/middleware.ts` enumerates image origins, add the new hostname + spec (repo anti-pattern: silent CSP blocks).

**Acceptance criteria:**
- [ ] Hotsite image second view → `cf-cache-status: HIT`; first view → served via LB backend bucket (no `storage.googleapis.com` in prod page HTML)
- [ ] Object immutability confirmed for all public-bucket writers (or versioned naming fixed with specs)
- [ ] Staging unaffected; prod cert covers the new hostname; SSL Full (strict) end-to-end
- [ ] CSP updated with spec if applicable; Checkov clean

**Dependencies:** M17-S22, M17-S37 (prod edge live); pairs naturally with S41

---

### M17-S45 — Photo lifecycle & retention: booking photos expire, hotsite assets permanent

**Agent:** `devops` + `backend-ts` + `frontend-ts`
**Complexity:** M
**Docs to load:** S14 storage module, `docs/13-DATABASE_SCHEMA.md` (photo reference columns), LGPD context in `docs/01-BUSINESS_CONTEXT.md` if present

**Description:**
Two-in-one: cost ceiling + LGPD compliance. Customer vehicle photos are personal data; keeping them forever is a liability *and* linear cost growth. Decision (2026-07-07): **booking photos are deletable; hotsite/public assets are permanent** (tenant-owned marketing content, no lifecycle deletion).

**What to implement:**
1. **Terraform (`modules/storage`), uploads bucket only:**
   - Age 60d → `SetStorageClass: NEARLINE` (viewing a photo months later still works — Nearline is instant-access, just cheaper storage/pricier reads).
   - Age `var.booking_photo_retention_days` → `Delete`. Default **365** (proposal — confirm at `/story-discovery`: must be ≥ the tenant dispute/warranty window; it is a business + LGPD decision, so it lands in this story's discovery, not silently in code).
   - Scope rules with `matchesPrefix = ["tenants/"]` so any future non-photo object class in this bucket isn't caught accidentally; document the constraint in the module README.
   - **Public bucket: explicitly NO age-based rules** — add a comment block stating the permanence decision so a future cost-trim doesn't "optimize" tenant marketing assets away.
2. **App-side graceful degradation:** after deletion, DB photo references dangle by design (no cleanup job — the storage layer is the source of truth for existence). Verify/implement: signed-URL read for a missing object must surface as a typed not-found (not a 500), and the dashboard booking detail + customer views render a localized "foto expirada/indisponível" placeholder instead of a broken image. Specs for the missing-photo path in the same commit (`.spec.tsx` per repo rule, pt-BR + en keys).
3. **Orphan check (hotsite bucket):** verify whether removing/replacing an image in `GalleryImageManager` deletes the old GCS object. If it doesn't, file a `td/` entry (orphaned public objects = slow cost leak) — fixing it is out of this story's scope.
4. **Transparency:** add the retention period to the tenant-facing terms/privacy documentation stub (doc-gate applies) so tenants can tell *their* customers how long photos are kept.

**Acceptance criteria:**
- [ ] Lifecycle rules visible on the uploads bucket (staging + prod) with the retention variable per env; public bucket has none
- [ ] Missing-object read path returns typed not-found end-to-end; UI shows localized placeholder (specs both locales)
- [ ] Retention value + rationale recorded in this story's discovery notes and the module README
- [ ] Orphan-deletion behavior of the public bucket verified and documented (or `td/` filed)
- [ ] Checkov clean

**Dependencies:** M17-S14 (module exists); app-side parts independently shippable post-launch

---

### M17-S46 — Cloud SQL Managed Connection Pooling (⚠️ DEFERRED OBSERVATION — high-traffic trigger only)

**Agent:** `devops` + `backend-ts`
**Complexity:** M
**Docs to load:** S13 (database module), S18 (connection-math invariant), S06 (`DB_POOL_SIZE`)

> **⚠️ This is a recorded observation, NOT a launch or early-growth task. Do not implement under the $50/mo budget (D12).**
> Verified against Google docs (2026-07-07): **MCP requires Cloud SQL Enterprise Plus edition**, which has no shared-core tiers — smallest PostgreSQL machine is a performance-optimized 2 vCPU/16GB at **~$200–300+/month per environment** in `southamerica-east1`. Enabling it "from day zero" was explicitly considered and rejected (2026-07-07): at launch traffic it adds zero capacity (the S06/S18 pool-math invariant already guarantees the connection wall is unreachable) for ~10× the total infra budget.
> **Trigger to enable (all three, roughly together):** sustained traffic where connection pressure — not CPU — is the proven bottleneck (Cloud SQL connection metrics near the flag-raised ceiling during scale-out); the business comfortably supports an Enterprise Plus-class DB spend; AND rung 2 of the ladder is exhausted: dedicated-core Enterprise tier with the `max_connections` database flag raised (RAM-bounded) + pool math re-tuned. Rung 2 is the normal growth path and does NOT require this story.

**Description:**
When the trigger above is met, move the instance to Enterprise Plus and enable **Managed Connection Pooling** — Google's built-in, fully managed PgBouncer. No VM, no sidecar, no self-hosted pooler ever (decision recorded in S13).

**Doc-verified requirements (2026-07-07 — re-verify at implementation time):**
- Enterprise Plus edition instance; new Cloud SQL network architecture; minimum maintenance version (`R20250727.00` era or later)
- **Enabling on an existing instance restarts the database** — schedule a maintenance window
- Cloud SQL Auth Proxy ≥ 2.15.2 for dev access
- Transaction-mode pooling is incompatible with session state: `SET/RESET`, `LISTEN/NOTIFY`, `PREPARE/DEALLOCATE`, session-level advisory locks; client IP tracking unsupported

**What to implement:**
1. **Terraform (`modules/database`):** `edition` + `enable_managed_connection_pooling` variables (+ pool configuration block as exposed by the provider at the time); staged rollout — staging first (temporary Enterprise Plus staging instance for the soak, then downgrade or accept cost), soak, then prod via the normal infra pipeline approval, inside a maintenance window (restart).
2. **Connection endpoint:** update backend DB env to the pooled endpoint. The **migrate job connects DIRECT (unpooled)**: DDL/migrations must not run through transaction-mode pooling.
3. **App compatibility audit (backend-ts):** grep/audit for the incompatible features listed above. Expected clean — writes go through `ITransactionManager.run()` and TypeORM defaults are compatible — but the audit is the deliverable, recorded in the PR description. Any violation found: fix the call site (root-cause rule), never disable pooling as a workaround.
4. **Re-tune the invariant:** the S18 precondition changes meaning (client connections multiplex onto few server connections) — validate against MCP's client-connection limit instead; raise `backend max_instances`/`DB_POOL_SIZE` to the new comfortable values. Update S13/S18 module READMEs **and the `tests/connection_math.tftest.hcl` cases in the same change** (the tests encode the old math and will correctly fail until rewritten).
5. **Validation:** load test (`k6`/`autocannon` burst against staging BFF) proving instance scale-out beyond the old connection ceiling with zero connection errors; before/after Cloud SQL connection metrics attached to the PR.

**Acceptance criteria:**
- [ ] Trigger conditions documented as met (metrics evidence) BEFORE any Terraform change — this story must not be started speculatively
- [ ] MCP enabled via Terraform only; no self-hosted pooler anywhere
- [ ] Migrate job verified running on a direct (unpooled) connection
- [ ] Compatibility audit documented; zero session-state violations remain
- [ ] Load test: scale-out past the previous connection ceiling with 0 connection errors; metrics attached
- [ ] S18 precondition + READMEs updated to the post-MCP math

**Dependencies:** M17-S13, M17-S18, M17-S37 (far post-launch; gated by the explicit trigger above, never by calendar)

---

### M17-S51 — LGPD data lifecycle: subject rights + tenant offboarding

**Agent:** `devops` + `backend-ts`
**Complexity:** M
**Docs to load:** S45 (photo retention), `docs/06-TENANT_ISOLATION_STRATEGY.md`, `docs/13-DATABASE_SCHEMA.md`, `docs/01-BUSINESS_CONTEXT.md`

**Description:**
**Found in review (2026-07-07):** S45 covers photo retention and the public/private bucket split, but three LGPD-relevant questions have no answer anywhere: what happens when a data subject (customer) requests export or deletion, what happens to a tenant's data when they leave the platform, and how backups interact with deletion. At MVP the deliverable is **documented, executable manual processes** — not built features (automated flows would need UCs first, per the doc-first rule; note them as candidates).

**What to produce:**
1. **Data inventory (one table):** personal data per context — customer rows (name, email, phone, `google_oauth_id`), booking contact fields, photos (vehicle images = personal data), loyalty history, notification logs (recipient emails), plus where each lives (Postgres tables, GCS paths, Cloud Logging). This table is the backbone of every other item.
2. **Data-subject export runbook:** parameterized SQL per context (`WHERE tenant_id = X AND customer_id = Y`) + `gsutil ls/cp` for the customer's photos → a JSON/CSV bundle. Manual, operator-executed, target ≤ 15 days (LGPD art. 19 timeline noted).
3. **Data-subject deletion runbook:** the multi-tenant subtlety documented explicitly — deletion is **per tenant-customer relationship** (same person may be a customer of other tenants; §2 invariant 5). Anonymization strategy for rows that must survive for tenant business records (completed bookings keep aggregates, contact fields nulled/hashed) vs hard-delete for the rest; photos deleted from GCS. Candidate `UC-033 — Customer requests data deletion` noted for future automation.
4. **Tenant offboarding runbook:** contract-end sequence — export bundle offered to the tenant, then hard delete of the tenant's rows across all contexts (order respecting FKs), GCS prefixes (`tenants/<id>/`), custom hostname (S40) removal, Secret/log references check. Candidate `UC-034 — Platform operator offboards tenant` noted.
5. **Backup interplay statement (goes into the privacy posture + tenant terms stub from S45):** deleted data persists in DB backups up to the 7-day retention (S13) and is purged automatically thereafter; backups are never selectively edited; restore procedures (S49) must re-apply any deletions executed since the backup point (kept feasible by logging deletion executions with dates in `SECRETS.md`-style ledger — `docs/DATA_REQUESTS_LOG.md`, gitignored).
6. **Log caveat:** Cloud Logging retains request logs (emails may appear in structured fields) for the configured retention — verify S05's field set doesn't log raw emails outside hashed/necessary cases; fix call sites if found (root-cause rule).

**Acceptance criteria:**
- [ ] Data inventory table complete and cross-checked against the live schema (spot-check 3 contexts)
- [ ] Export + deletion + offboarding runbooks executed once against a staging throwaway tenant (evidence recorded)
- [ ] Multi-tenant deletion semantics documented (per-relationship, not per-person)
- [ ] Backup/deletion interplay statement added to the S45 terms stub
- [ ] UC-033/UC-034 listed as documented future candidates in `docs/04-USE_CASES.md` missing-UC section (doc gate)
- [ ] No raw personal emails in log output (grep + spot-check; violations fixed)

**Dependencies:** M17-S45 (retention + terms stub), M17-S37 (prod exists); runbooks must exist before the second real tenant onboards

---

## Appendix — Story → old milestone traceability

| M17 | Origin | Disposition |
|---|---|---|
| S01 | new | HashiCorp skills |
| S02–S03 | new (D2/D3) | push consumption + cron |
| S04 | M14-S07 | readiness made real |
| S05 | M14-S08 | logger alignment (was mostly done) |
| S06 | new | prod env guards |
| S07–S10 | M15-S01 expanded | accounts from zero, WIF, Cloudflare, OAuth, Brevo |
| S11 | M15-S02 | fixed state layout |
| S12 | M15-S03 | connector → direct egress |
| S13 | M15-S04 | tiers per D12 |
| S14 | **new — missing in M15** | GCS buckets |
| S15 | M15-S05 | single registry (D8) |
| S16 | M15-S06 | live secret catalog |
| S17 | M15-S07 | + push/scheduler SAs |
| S18 | M15-S09 | internal backend, sidecars, ignore_changes |
| S19 | M15-S08 | generated catalog + push + DLQ |
| S20 | M16-S05 | Cloud Run Job (runner→SQL unreachable bug fixed) + prod migration script |
| S21 | M15-S10 | Scheduler → Pub/Sub (was BFF HTTP + secret) |
| S22 | new (D5) | edge ALB + Cloudflare |
| S23 | M16-S01 | 11 envs → 4, WIF |
| S24 | new | the missing Terraform pipeline |
| S25 | M16-S02 | + web build-arg handling |
| S26 | M16-S03 | same-SHA promote, one approval |
| S27 | M15-S11 | staging activation |
| S28 | M16-S06 | E2E vs staging; test-login superseded by M115 Dev Login |
| S29 | M16-S04 | unchanged + storage check |
| S30 | M16-S07 | minus Armor pairing; moved to Wave 0 + client-IP extraction spec (2026-07-07) |
| S31 | M16-S08 | build → audit (already implemented) |
| S32 | M16-S11 | redesigned to wrap routing payload; moved to Wave 0 (2026-07-07) |
| S33 | M14-S01/S02 | OTLP-only; manual spans deferred |
| S34 | M14-S04 + M16-S09 | compose stack/VM → collector sidecar (D9) |
| S35 | M14-S05/S06 | Grafana JSONs/Prometheus rules → Cloud Monitoring as code |
| S36 | M15-S12 remnant | Armor reduced to origin lockdown; enabled at go-live (revised 2026-07-07) |
| S37 | M16-S10 | go-live |
| S38–S40 | new product | custom domains (UC-032 doc-first) |
| S41 | new product | hotsite edge caching |
| S42 | new | docs refresh |
| S43 | new (photo costs, 2026-07-07) | client-side compression before upload |
| S44 | new (photo costs, 2026-07-07) | public images via ALB backend bucket + Cloudflare |
| S45 | new (photo costs + LGPD, 2026-07-07) | booking-photo retention; hotsite bucket permanent |
| S46 | new (connection scaling, 2026-07-07) | Cloud SQL Managed Connection Pooling (Google-managed PgBouncer) — deferred observation; requires Enterprise Plus (~$200–300+/mo/env), high-traffic trigger only |
| S47 | new (review finding, 2026-07-07) | BFF Google ID tokens for backend Cloud Run IAM auth — blocker for S18/S27 |
| S48 | new (review finding, 2026-07-07) | supersession banners on legacy infra docs before Wave 2 |
| S49 | new (review finding, 2026-07-07) | DR runbook + staging restore drill — blocker for S37 |
| S50 | new (review finding, 2026-07-07) | access & audit governance policy, break-glass account |
| S51 | new (review finding, 2026-07-07) | LGPD lifecycle: subject rights, tenant offboarding, backup interplay |
| S52 | new (review finding, 2026-07-08) | `PlatformAdminGuard` header migration — `Authorization` collides with the `gcloud run services proxy` IAM ID token |

**Explicitly dropped:** M15-S12 Cloud IAP (D4) · M16-S06 `E2E_TEST_MODE`/`test-login` (M115-S02 Dev Login exists) · M14 Docker-Compose observability stack + M16-S09 GCE Grafana VM as launch items (D9 — remain a documented future option via collector config swap) · M16-S01 SA JSON keys (D6) · M15-S03 VPC Access connector (D7).
