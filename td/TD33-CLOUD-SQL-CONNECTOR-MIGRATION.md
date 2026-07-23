# TD33 — Migrate to `@google-cloud/cloud-sql-connector` for verified, auto-rotating TLS

## Status
- **State**: 🟡 Open
- **Type**: Technical Debt / Security Hardening
- **Priority**: Medium — real but narrow exposure (VPC-internal only, not reachable from the public internet); not a launch blocker, but should land before scaling trust in the platform
- **Context**: `apps/backend/src/shared/database/data-source.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/shared/database/resolve-database-ssl.ts`, `infra/terraform/modules/iam/`, `infra/terraform/envs/{staging,prod}/main.tf`
- **Created**: 2026-07-23
- **Discovered**: during M17-S27 (staging activation), cross-tool review (CodeRabbit) on PR #197

---

## Problem

M17-S27's SSL fix (PR #197, `resolveDatabaseSsl()`) enables TLS for Cloud SQL connections via `ssl: { rejectUnauthorized: false }` when `APP_ENV !== 'local'`. This is necessary — Cloud SQL enforces `ssl_mode=ENCRYPTED_ONLY`, which rejects any unencrypted connection outright — but `rejectUnauthorized: false` also **disables verification of the server's certificate**, which is a separate, unjustified weakening.

**The original comment's reasoning was wrong, and worth recording precisely so the mistake isn't repeated:** it justified `rejectUnauthorized: false` by citing `ssl_mode=ENCRYPTED_ONLY` (the instance doesn't require a *client* certificate — i.e. no mTLS) — `modules/database/main.tf`'s own Checkov-skip comment documents that as a deliberate choice. But `ssl_mode` on the Cloud SQL instance controls two things only: (1) whether encryption is mandatory, (2) whether the *server* requires a *client* certificate. It says **nothing** about whether the *client* verifies the *server's* certificate — that's an independent, client-side TLS setting. Skipping mTLS (no client cert required) does not imply skipping server-certificate verification (standard one-way TLS, the same model a browser uses against an HTTPS site). These are two separate axes; the comment conflated them.

**Live-verified (2026-07-23):**
```
$ gcloud sql instances describe ikaro-db-staging --project=ikaro-staging --format="yaml(settings.ipConfiguration)"
settings:
  ipConfiguration:
    ipv4Enabled: false
    privateNetwork: projects/ikaro-staging/global/networks/ikaro-vpc-staging
    requireSsl: false
    serverCaMode: GOOGLE_MANAGED_INTERNAL_CA
    sslMode: ENCRYPTED_ONLY
```
`serverCaMode: GOOGLE_MANAGED_INTERNAL_CA` confirms a real, fetchable CA chain exists for the server certificate — verification is genuinely possible, just not done today.

## Why this matters

With `rejectUnauthorized: false`, the Node `pg` client accepts *any* certificate the connection endpoint presents — valid, self-signed, or attacker-controlled — as long as the handshake completes. In practice: anything positioned on the network path between a Cloud Run service (backend/migrate job, direct VPC egress) and the Cloud SQL private IP (`10.27.0.3` in staging) could present its own certificate and the client would never detect it, enabling a man-in-the-middle read/tamper of all DB traffic including credentials-adjacent queries.

**Scope of the real risk, stated honestly (not hand-waved either direction):** this requires an attacker to already have a foothold *inside* Google's private VPC network fabric between the two endpoints — it is not reachable from the public internet (no public IP on the instance, no public ingress on the path). That's a high bar, and it's why this is Medium priority, not a blocker. But "high bar" is not "zero risk," and the current code's own comment incorrectly implies this gap doesn't exist at all — that's the part that needed correcting immediately (done in PR #197 alongside filing this TD) regardless of when the real fix lands.

## Options considered

1. **Do nothing (status quo, `rejectUnauthorized: false`)** — real gap remains open indefinitely. Rejected as the terminal state; acceptable only as a short, explicitly-labeled interim.
2. **Manually pin Cloud SQL's server CA certificate** (`ssl: { ca: <fetched cert>, rejectUnauthorized: true }`) — fixes verification, but `serverCaMode: GOOGLE_MANAGED_INTERNAL_CA` means Google rotates this CA periodically. A manually pinned cert is a **latent outage**: everything works until the CA rotates, then every connection breaks simultaneously until someone remembers to refresh the pin. This trades one problem for a worse one (a security gap replaced by an unmonitored availability trap) and is **not recommended**.
3. **Migrate to `@google-cloud/cloud-sql-connector`** (the official Google npm package) — **recommended, this TD's scope**. Fetches ephemeral client certs and the current server CA automatically, rotates continuously (~hourly), and provides a fully verified, encrypted connection with zero manual certificate management. This is Google's own recommended pattern for exactly this situation and is the only option that doesn't create a new maintenance burden in exchange for closing the security gap.

## Proposed approach (Story — implementing agent should scope/discovery this before starting, per repo convention)

1. **Add `@google-cloud/cloud-sql-connector` as a direct dependency** of `apps/backend`.

2. **Respect the anti-lock-in guardrail** (`plan/M17-CLOUD-DEPLOY.md` §0, guardrail #1 — "application code never imports `@google-cloud/*` outside an adapter in an `infrastructure/` layer"). Wrap the connector in a dedicated adapter — suggested location `apps/backend/src/shared/infrastructure/database/cloud-sql-connector.adapter.ts` (mirrors the existing `shared/infrastructure/event-bus/` pattern for other GCP-touching adapters) — not imported directly into `app.module.ts` or `data-source.ts`.

3. **Integration shape:** `Connector.getOptions({ instanceConnectionName, ipType: 'PRIVATE' })` is **async** and returns options compatible with `pg` — specifically a `stream` socket-factory function that replaces `host`/`port`. Verify against the pinned TypeORM version (`apps/backend/package.json`) that `DataSourceOptions.extra` (the driver-passthrough field) correctly forwards a custom `stream` to the underlying `pg.Pool`/`pg.Client` — this is the established TypeORM mechanism for driver-specific options, but confirm empirically rather than assume.
   - **`ipType: 'PRIVATE'` is non-negotiable** — must never fall back to a public-IP path (the instance has no public IP at all today, and D4/the security model's "no public IP" invariant must not be reopened by this migration).

4. **Async construction problem (real integration challenge, flag for the implementing agent):** `data-source.ts` currently does synchronous construction (`export const AppDataSource = new DataSource({...})`), but the connector's `getOptions()` is async (it fetches ephemeral certs on first call). The TypeORM CLI needs to be checked against the pinned version for whether the data-source config file may export an async factory / a `Promise<DataSource>` — verify this against the actual installed TypeORM version's docs/source before assuming either way; do not guess.

5. **New env var needed:** `DB_INSTANCE_CONNECTION_NAME` (format `project:region:instance`, e.g. `ikaro-staging:southamerica-east1:ikaro-db-staging`) — the connector needs this, not the raw private IP `DB_HOST`. Thread through Terraform: `envs/staging/main.tf` and `envs/prod/main.tf`, both the Cloud Run service module calls (backend) and `migrate_job`. Decide whether `DB_HOST` stays (for the `APP_ENV=local` fallback path, which won't use the connector) or is fully replaced — local dev/CI Testcontainers Postgres has no Cloud SQL instance and must keep working exactly as today.

6. **IAM verification required — likely a real gap, check before assuming it's already covered:** the connector calls the Cloud SQL Admin API to mint ephemeral certs, which requires the calling identity to hold `roles/cloudsql.client`. Today, that role is granted only to the human `iam_admin_user` identity (`modules/database/main.tf`'s `google_project_iam_member.admin_cloudsql_client`) — the **runtime service accounts** (`ikaro-backend@`, `ikaro-migrate@`) have never needed this, since the current raw-TCP connection path doesn't call the Admin API at all. Check `modules/iam` for both envs; almost certainly needs a new binding added for both runtime SAs before the connector can authenticate.

7. **Live verification (do not skip — matches this story's own established discipline, see TD30/TD32):** after implementation, actually run the staging migrate job and confirm the backend boots and connects successfully via the new path — a passing local/CI test is not sufficient evidence, per this same session's repeated experience that "first real exercise of a code path" surfaces gaps unit tests can't catch (the very `pg_hba.conf` bug this TD exists because of was itself invisible to every unit and integration test that ran before this story).

8. **Update the Portability Ledger** (`plan/M17-CLOUD-DEPLOY.md` §0) with a new row: GCP-specific part = the connector library itself; portable boundary = confined to the one new adapter (guardrail #2 already requires this); migration cost = hours (swap adapter internals for the target provider's equivalent, or fall back to manual TLS+CA); accepted because it closes a real security gap using a thin, swappable dependency.

9. **Clean up:** once the connector fully replaces the raw TCP + `resolveDatabaseSsl()` path, decide whether `resolve-database-ssl.ts` is deleted entirely or kept solely for the `APP_ENV === 'local'` fallback (if local dev ever needs a distinct SSL decision point — likely not, since local Postgres has no TLS at all).

## Acceptance criteria

- [ ] `@google-cloud/cloud-sql-connector` added; wrapped in an `infrastructure/`-layer adapter (anti-lock-in guardrail respected)
- [ ] `data-source.ts` and `app.module.ts` both connect via the connector-backed adapter for `APP_ENV !== 'local'`; local/CI Testcontainers path unchanged
- [ ] `ipType: 'PRIVATE'` explicitly set; no public-IP path introduced anywhere
- [ ] `DB_INSTANCE_CONNECTION_NAME` threaded through both env roots' Terraform (backend + migrate job, both envs)
- [ ] `roles/cloudsql.client` verified/granted to `ikaro-backend@` and `ikaro-migrate@` in both envs (check `modules/iam` first — do not assume either way)
- [ ] Live verification: staging migrate job + backend actually connect successfully via the new path (not just unit/integration tests passing)
- [ ] Portability Ledger updated in `plan/M17-CLOUD-DEPLOY.md`
- [ ] `resolve-database-ssl.ts` either removed or reduced to the local-only fallback, with no dangling reference to the old `rejectUnauthorized: false` path for staging/prod

## Dependencies
None blocking — can be scoped and started independently. Should land before any story that increases staging/prod's real traffic volume (the exposure window matters more once the platform has actual tenant data flowing through it).
