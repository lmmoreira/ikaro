# TD38 — BFF can never see the real client IP; the same-origin gateway masks every real user behind `ikaro-web`'s own address

## Status
- **State**: 🟡 Partially Done — Story A (staging) merged and verified live; Story B (prod) moved to `plan/M17-CLOUD-DEPLOY.md`'s **M17-S53** (2026-08-01, so it's sequenced as a real dependency of M17-S37 rather than a free-floating TD note); Story C (E2E redesign) not started
- **Type**: Technical Debt / Architecture Gap (security + reliability: rate-limiter correctness)
- **Priority**: High — the BFF's per-IP rate limiter (`AppThrottlerGuard`) does not protect what it believes it protects, in **both** staging and production, for 100% of real user traffic
- **Context**: `apps/bff/src/shared/http/client-ip.ts`, `apps/bff/src/shared/guards/app-throttler.guard.ts`, `apps/web/app/v1/[...path]/route.ts`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `plan/M17-CLOUD-DEPLOY.md` M17-S27's XFF checklist item
- **Created**: 2026-07-27
- **Discovered**: during M17-S27's live XFF-verification checklist item (PR #281) — a real staging request was made from a browser (public IP `179.118.166.67`, confirmed via `curl ifconfig.me`), and the BFF's new diagnostic log (`AppThrottlerGuard.getTracker()`) showed `x-forwarded-for="34.34.231.138" resolved="34.34.231.138"` — a Google Cloud–owned address, not the requester's real IP

---

## Problem

### What M17-S27 set out to verify, and what it actually found

M17-S27's checklist item (`plan/M17-CLOUD-DEPLOY.md`) asked: staging's `getClientIp()` (`apps/bff/src/shared/http/client-ip.ts`) assumes the **rightmost** `X-Forwarded-For` hop is the real client IP, for staging's no-Cloudflare/no-ALB, direct-`*.run.app` path. This was flagged as unverified (M17-S30 PR #167 review) because nothing was deployed at the time to test against.

A real staging test was run in PR #281's follow-up: browser → staging web app → (browser navigation, real usage, not a raw API call) → BFF. The resulting debug log showed a **single-hop** `X-Forwarded-For` header — not the multi-hop chain the original comment worried about — containing `34.34.231.138`. The user's actual public IP, independently confirmed via `curl ifconfig.me` from the same machine/network, is `179.118.166.67`. These do not match, and `34.x.x.x` is a Google Cloud–owned range, not something any residential/corporate ISP would hand out.

**The rightmost-hop assumption isn't just imprecise — the header never carries the real client's IP at all, under any hop-selection strategy, for this traffic pattern.**

### Root cause: BFF never receives a direct connection from the browser

Per `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer and CLAUDE.md §7, **all** browser-originated calls to the BFF go through a mandatory same-origin gateway — browser code is required to call `/v1` (same origin as the web app) and is explicitly forbidden from calling the BFF/backend upstream directly:

```
Browser --(same-origin, /v1/...)--> ikaro-web (Cloud Run) --(server-side fetch)--> ikaro-bff (Cloud Run)
```

The gateway is `apps/web/app/v1/[...path]/route.ts`. Its `proxy()` function (lines 33-63) does this:

```ts
const headers = new Headers(request.headers);
for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
for (const header of INTERNAL_IDENTITY_HEADERS) headers.delete(header);
headers.delete('content-length');
...
upstream = await fetch(upstreamUrl(path, request.nextUrl.search), {
  method: request.method,
  headers,
  body,
  cache: 'no-store',
  redirect: 'manual',
  signal: AbortSignal.timeout(BFF_GATEWAY_TIMEOUT_MS),
});
```

It copies the browser's original request headers (including whatever `X-Forwarded-For` value Google's front end set on the **browser→web** hop — which *would* have been correct) into a **brand-new outbound `fetch()` call**, which opens a **new TCP connection originating from the `ikaro-web` Cloud Run container itself**.

When that new connection reaches BFF's Cloud Run front end (GFE), GFE sees the directly-connecting peer — `ikaro-web`'s own egress IP — and, empirically (per the single-hop result above), **overwrites** `X-Forwarded-For` with just that one value. It does not append to whatever value `route.ts` forwarded in the headers object; the real browser IP is discarded entirely at this hop, and BFF sees only `ikaro-web`'s address.

**Consequence:** `AppThrottlerGuard`'s per-IP rate-limit key (`getTracker()` → `getClientIp()`) resolves to the *same* value (or a small pool of values, if `ikaro-web` scales to multiple instances / has multiple egress IPs) for **every real user simultaneously**. This is strictly worse than "imprecise" — it is the specific failure mode flagged as a risk in earlier discussion and now confirmed real: unrelated users share a rate-limit bucket. One user's ordinary traffic (or an attacker deliberately routing abuse through the normal web app, e.g. a login-brute-force script that just calls the site like a browser would) can trip 429s for every other concurrent staging/production user, and conversely a distributed attacker gains nothing from spreading requests across different real source IPs, since the BFF never sees those IPs to begin with — the entire IP-based rate-limiting layer is currently inert for the traffic it was built to police.

### This is not staging-specific

Production's `BFF_UPSTREAM_URL=https://bff.ikaro.online/v1` (`plan/M17-CLOUD-DEPLOY.md:1080,1100`) is a **public hostname behind the same Cloudflare + ALB front door the browser itself uses**. `ikaro-web`'s server-side call to it is architecturally the same shape as staging's: a fresh connection originating from `ikaro-web`, not a passthrough of the browser's original connection. `cf-connecting-ip` on that hop resolves Cloudflare's view of the *directly connecting* peer for the web→BFF leg — i.e., `ikaro-web`'s own address — not the original browser's IP. This was not empirically re-tested against production in this investigation (no destructive/unnecessary prod testing was performed), but the architecture is identical in the relevant respect, so treat it as equally broken until this TD's fix lands in prod too.

### Confirmed current Terraform/IAM state (as of this investigation, 2026-07-27)

- **Backend** (`infra/terraform/envs/{staging,prod}/main.tf`): `ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"` in **both** envs. Fully locked down; only BFF can reach it (`roles/run.invoker` scoped to `ikaro-bff@` SA), enforced via Cloud Run's own IAM layer *and* an app-layer `X-Internal-Key` check (`apps/backend/src/shared/guards/internal-api.guard.ts`, registered globally via `APP_GUARD` in `apps/backend/src/app.module.ts:95`, with an `@Public()` decorator escape hatch for pre-auth routes).
- **BFF** (staging): `ingress = "INGRESS_TRAFFIC_ALL"` (`infra/terraform/envs/staging/main.tf:208`) — fully open to the internet.
- **BFF** (prod): `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` (`infra/terraform/envs/prod/main.tf:241`) — only reachable via the ALB, **but** the comment at line ~214-219 confirms *"Its Foundation-owned public invoker grant stays in place: the app's public-auth model doesn't rely on Cloud Run IAM checks... narrowing ingress changes the network path, not who's allowed to call once traffic arrives via the LB."* — i.e., **anyone on the internet who reaches `bff.ikaro.online` through Cloudflare can call any BFF endpoint with zero IAM-level authentication.** The app's own JWT-based auth is the only gate for authenticated routes; BFF's `@Public()` routes (guest booking, hotsite reads, health checks — see list below) have no gate at all beyond app logic.
- **The public invoker grant** is defined in `infra/terraform/foundation/envs/staging/main.tf:169` and `infra/terraform/foundation/envs/prod/main.tf:179`:
  ```hcl
  workload_cloud_run_public_invokers = toset(["ikaro-bff", "ikaro-web"])
  ```
  This grants `allUsers` → `roles/run.invoker` on **both** services, materialized by `google_cloud_run_v2_service_iam_member.public_invoker` in `infra/terraform/foundation/modules/workload-iam/... ` (resource block at staging/prod main.tf lines ~234-243 / ~244-253).
- **The web→BFF `run.invoker` binding already exists** and does not need to be created: `infra/terraform/foundation/envs/{staging,prod}/main.tf`, `workload_cloud_run_invokers`:
  ```hcl
  bff_web = {
    service_name = "ikaro-bff"
    member       = "serviceAccount:ikaro-web@${var.project_id}.iam.gserviceaccount.com"
  }
  ```
  (staging line ~158-161, prod line ~168-171). This means the IAM *permission* for web to invoke BFF is already granted — what's missing is (a) BFF actually *requiring* IAM auth (blocked by the public invoker grant above) and (b) the web app code actually *presenting* an ID token when it calls BFF (it currently makes a plain unauthenticated `fetch()`).
- **The exact ID-token pattern to mirror already exists for BFF→backend** (M17-S47):
  - `apps/bff/src/shared/http/google-identity-token.adapter.ts` — wraps `google-auth-library`'s `GoogleAuth().getIdTokenClient(audience)`, caches one `IdTokenClient` per audience (refreshes itself against the Cloud Run metadata server).
  - `apps/bff/src/shared/http/backend-auth.interceptor.ts` — a single axios request interceptor, registered once (`OnModuleInit`), gated behind `BACKEND_AUTH_MODE=iam` (`apps/bff/src/config/env.validation.ts:41-42,55-61` — required to be `iam` whenever `NODE_ENV=production`, which both staging and prod cloud builds set). It attaches `Authorization: Bearer <id-token>` **only** when the outgoing request's resolved origin exactly matches the backend's origin (parsed via `new URL()`, not a string-prefix check — guards against a subtly-similar attacker host).
  - `apps/backend/src/shared/guards/internal-api.guard.ts` + `X-Internal-Key` — the app-layer defense-in-depth check that runs *in addition to* Cloud Run's IAM layer, using `crypto.timingSafeEqual` on SHA-256 hashes of both sides (avoids key-length timing leaks).

None of this exists yet for web→BFF. Web's `route.ts` makes a bare `fetch()` with no `Authorization` header, and BFF has no equivalent of `InternalApiGuard` gating "caller must be `ikaro-web`."

### BFF's current `@Public()` routes (no-JWT, but still gateway-only in practice)

`apps/bff/src/features/{booking/schedule-availability-summary.controller.ts, auth/auth.controller.ts, platform/platform.public.controller.ts, booking/services.public.controller.ts, booking/bookings.controller.ts (guest routes), booking/schedule-availability.controller.ts}`, `apps/bff/src/health/health.controller.ts`. These skip BFF's own JWT auth (`@Public()` on `JwtAuthGuard`) for guest/hotsite/health traffic, but **every one of them is still only ever reached via `ikaro-web`'s same-origin gateway or SSR helpers** (`bffServerFetch`/`bffPublicFetch`, both server-only, both run inside `ikaro-web`'s own process) — there is no legitimate external caller that needs to reach BFF directly, `@Public()` or not. This is an orthogonal axis from the new lockdown this TD proposes: `@Public()` means "no JWT," the new guard means "caller must be `ikaro-web`" — a `@Public()` route still needs to pass the new caller-identity check.

### The only known legitimate direct-to-BFF caller today: Playwright E2E

```
apps/web/.env.playwright.local:2:PLAYWRIGHT_BFF_URL=http://localhost:3002/v1
apps/web/e2e/helpers/booking/request-info-booking.ts
apps/web/e2e/helpers/booking/approve-booking.ts
apps/web/e2e/helpers/auth/shared.ts
apps/web/e2e/helpers/booking/submit-guest-info-directly.ts
apps/web/e2e/authenticated-booking.spec.ts
apps/web/e2e/helpers/booking/create-guest-info-requested-booking.ts
apps/web/e2e/helpers/schedule/schedule-helpers.ts
apps/web/e2e/helpers/booking/create-booking.ts
```
9 files construct `BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1'` and call BFF's REST API directly (bypassing the browser/web app entirely) for test setup/teardown speed. Locally and in the `e2e` job in `pr-tests.yml` (docker-compose, no Cloud Run ingress restriction) this is unaffected by anything in this TD. But `M17-S28` ("Playwright E2E against staging," dependency: this story, not yet implemented) is specced to point `PLAYWRIGHT_BFF_URL` at a **deployed staging URL** — that will break once BFF's ingress is locked down, because GitHub Actions runners are not inside the VPC and have no legitimate IAM identity to mint an `ikaro-web`-scoped ID token.

---

## Why a partial fix is not acceptable here (why this needs the full fix, not a workaround)

An earlier, narrower option was considered and rejected: just have `route.ts` forward the real IP it resolved on the browser→web hop as a new header (e.g. `X-Real-Client-Ip`), and have BFF trust that header. **On its own, this is worse than doing nothing**, because BFF today accepts direct calls from anyone on the internet (staging: `INGRESS_TRAFFIC_ALL`; prod: `allUsers` public invoker survives the ALB ingress restriction). Without also closing that hole, an attacker could simply call BFF directly and set `X-Real-Client-Ip` to any value they like — turning an *uninformative* rate-limiter into an *attacker-controlled* one (they could evade their own throttling by claiming a fresh IP every request, or frame another IP for a ban). Per CLAUDE.md's no-workarounds rule and the project's own precedent (backend is fully locked down this exact way already), the header-forwarding piece and the lockdown piece must ship together.

---

## Proposed solution (mirrors the existing, already-proven backend pattern exactly)

Make BFF structurally identical in trust posture to how the backend already treats BFF: fully VPC-internal ingress, IAM ID-token authenticated, app-layer shared-secret defense-in-depth, reachable only from `ikaro-web`. Once that's true, `ikaro-web` becomes the sole trusted source of "what is the real client IP," and can forward it safely.

### Phase 1 — Terraform / IAM (both `staging` and `prod`)

1. **`infra/terraform/foundation/envs/staging/main.tf:169`** and **`infra/terraform/foundation/envs/prod/main.tf:179`**: change
   ```hcl
   workload_cloud_run_public_invokers = toset(["ikaro-bff", "ikaro-web"])
   ```
   to
   ```hcl
   workload_cloud_run_public_invokers = toset(["ikaro-web"])
   ```
   This removes BFF's `allUsers` → `roles/run.invoker` grant in both projects. Web is untouched (real browsers must still reach it directly).

2. **The `bff_web` invoker binding already exists** (`workload_cloud_run_invokers.bff_web`, staging main.tf ~158-161, prod ~168-171) — no Terraform change needed for the grant itself. Just confirm it survives step 1's diff (it's a different `for_each` map, unaffected).

3. **`infra/terraform/envs/staging/main.tf`** (`module "cloudrun_bff"`, around line 208): change
   ```hcl
   ingress    = "INGRESS_TRAFFIC_ALL"
   ```
   to
   ```hcl
   ingress    = "INGRESS_TRAFFIC_INTERNAL_ONLY"
   ```
   (VPC egress/network/subnet wiring is already present on this module — unchanged.)

4. **`infra/terraform/envs/prod/main.tf`** (`module "cloudrun_bff"`, around line 241): change
   ```hcl
   ingress    = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
   ```
   to
   ```hcl
   ingress    = "INGRESS_TRAFFIC_INTERNAL_ONLY"
   ```
   This is a deliberate departure from S22's original design (which put BFF behind the ALB alongside web) — full internal-only parity with the backend is the "no workaround" target, since nothing legitimate needs BFF reachable via the ALB once web calls it over the VPC directly (Phase 1 step 6). Cross-check this against `td/`/`plan/M17-CLOUD-DEPLOY.md` S22's original rationale for putting BFF behind the ALB in the first place before applying — if S22 had an independent reason for that placement beyond "so the public custom domain works," note it here as an open question (see Open Questions below) rather than silently overriding it.

5. **`ikaro-web`'s Cloud Run module needs VPC egress wiring it currently lacks entirely.** Both `envs/staging/main.tf` and `envs/prod/main.tf`, `module "cloudrun_web"`: the comment at staging's web block (~line 242) explicitly says *"No VPC egress — web never calls the backend directly, only the public BFF URL."* That assumption is now false. Add, mirroring BFF's own existing block:
   ```hcl
   vpc_egress = "ALL_TRAFFIC"
   network_id = module.network.network_id
   subnet_id  = module.network.subnet_id
   ```
   (`ALL_TRAFFIC`, not `PRIVATE_RANGES_ONLY`, for the same reason BFF uses it: BFF's own `*.run.app`/internal service URI still needs to resolve and route correctly — mirror the exact reasoning already documented on BFF's `vpc_egress` variable description in `infra/terraform/modules/cloudrun-service/variables.tf:191`.)

6. **`BFF_UPSTREAM_URL`** (`env_vars` on `module "cloudrun_web"`, both envs) changes from a public hostname to BFF's internal Cloud Run service URI, mirroring exactly how the backend does it for BFF→backend:
   - Staging: from whatever `var.bff_real_uri`/staging placeholder currently resolves to, change to `module.cloudrun_bff.service_uri` (same pattern as `BACKEND_INTERNAL_URL = module.cloudrun_backend.service_uri` a few lines above it in the same file).
   - Prod: from `https://bff.ikaro.online/v1` to `module.cloudrun_bff.service_uri` + `/v1` suffix.
   - **Confirmed during story-discovery (Story A):** `apps/web/shared/lib/api/bff-url.ts`'s `buildBffUrl()` does plain string concatenation with **no slash normalization** — a real double-slash/missing-slash risk once `BFF_UPSTREAM_URL` changes shape, unlike `route.ts`'s own `upstreamUrl()`, which already normalizes via `.replace(/\/$/, '')`. Fix `buildBffUrl()` to normalize the same way, in the same commit as this env var change — not just "check it," an actual code fix is required here.
   - **`NEXT_PUBLIC_BFF_URL` is unaffected** — it stays `/v1` in both envs; that's the *browser*-facing same-origin path, unrelated to `BFF_UPSTREAM_URL`, which is where `route.ts` forwards server-side.

7. **DNS/Certificate cleanup (verify against S22's edge module before changing):** if `bff.ikaro.online` has its own Cloudflare DNS record + Certificate Manager cert (from S22), decide whether to remove it now that nothing should call it externally, or leave it dangling (it will 401/403 once step 1 lands, since the public invoker grant is gone — not a security hole, just dead infrastructure). Locate S22's edge module (`infra/terraform/modules/edge/` or similar — not yet read in this investigation) and follow its existing pattern for removing a subdomain, rather than hand-editing Cloudflare state.

### Phase 2 — Web-side: mint and attach a Google ID token when calling BFF

1. **New dependency**: add `google-auth-library` (already a BFF dependency, `apps/bff/package.json` pins `^10.9.0` — use the same version for consistency) to `apps/web/package.json`.

2. **New adapter**, mirroring `apps/bff/src/shared/http/google-identity-token.adapter.ts` exactly (same caching-per-audience `IdTokenClient` pattern, same "evict on rejection" retry behavior) — likely `apps/web/shared/lib/auth/google-identity-token.ts` (server-only; must never be imported into a `'use client'` file — enforce with the existing `server-only` package already a web dependency, same as other server-only modules in this codebase).

3. **New env vars**, mirroring BFF's `BACKEND_AUTH_MODE`/`BACKEND_AUDIENCE` (`apps/bff/src/config/env.validation.ts:41-42,55-61`) — add to web's own env validation schema (locate it; likely `apps/web/shared/lib/env-validation.ts` or similar, grep for where `NEXT_PUBLIC_BFF_URL`/`BFF_UPSTREAM_URL` are validated today) two new vars: `BFF_AUTH_MODE: z.enum(['none', 'iam']).default('none')` and `BFF_AUDIENCE: z.url().optional()`, with the same production-requires-iam refinement BFF's schema has. Set `BFF_AUTH_MODE=iam` for both staging and prod web Cloud Run env vars (Phase 1's Terraform changes).

4. **`apps/web/app/v1/[...path]/route.ts` changes**:
   - Before the `fetch()` call, if `BFF_AUTH_MODE === 'iam'`, obtain the ID token from the new adapter (audience = `BFF_AUDIENCE ?? new URL(BFF_UPSTREAM_URL).origin`, mirroring `backend-auth.interceptor.ts:31-32`) and set `headers.set('Authorization', <token>)`.
   - **Resolve the real client IP on the browser→web hop** — this hop genuinely is trustworthy (single real proxy layer, GFE direct or Cloudflare-in-front, exactly the scenario `client-ip.ts`'s existing logic was designed for). **Relocate** the resolution logic currently in `apps/bff/src/shared/http/client-ip.ts` to a new package, **`packages/http-utils`** (decided during Story A's story-discovery, 2026-07-31): the function is already framework-agnostic (`ClientIpRequest` is a plain `{ headers, ip? }` shape, no NestJS coupling), but `packages/observability` — the only existing package that looked plausible — was ruled out because it carries a `@nestjs/common` peer dependency and the full OTel SDK stack (it's a NestJS-coupled logger/tracing package, not a general utility one), and pulling it into `apps/web` (Next.js) solely to reuse ~20 lines of header-parsing logic would be exactly the kind of avoidable complexity CLAUDE.md's "mounting complexity" rule warns against. No existing `packages/*` is shared by both `apps/web` and `apps/bff` for pure-function utilities today (only `@ikaro/types` bridges both) — `packages/http-utils` is a new, framework-agnostic package for exactly this.
   - Once resolved, set a **new, non-standard header** — not `X-Forwarded-For` (GFE overwrites that on the web→BFF hop regardless of what's sent, per this TD's own empirical finding) — e.g. `X-Real-Client-Ip`, to the resolved value, on the outbound `fetch()`.
   - Add the app-layer shared-secret header too (Phase 3) alongside the IAM token, as defense-in-depth (mirrors backend's dual-layer model exactly).

### Phase 3 — App-layer defense-in-depth (mirrors `InternalApiGuard`/`X-Internal-Key` exactly)

1. **New Secret Manager secret**: `web-internal-key` (mirrors `internal-api-key`'s existing S16-style catalog entry) — populated out-of-band via the same activation-runbook convention as every other secret (§2 of CLAUDE.md, no exceptions). Grant `roles/secretmanager.secretAccessor` to both `ikaro-web@` and `ikaro-bff@` runtime SAs (mirrors the existing per-secret consumer map pattern in S17's `modules/iam`).

2. **New BFF guard**, e.g. `apps/bff/src/shared/guards/web-only.guard.ts`, structurally identical to `apps/backend/src/shared/guards/internal-api.guard.ts` (same `crypto.timingSafeEqual` on SHA-256 hashes, same header name convention but scoped to this hop — e.g. `X-Web-Internal-Key`), registered globally via `APP_GUARD` in `apps/bff/src/app.module.ts`. **Confirmed during story-discovery (Story A):** `apps/bff/src/app.module.ts:53-54`'s own code comment confirms `APP_GUARD` array registration order **is** execution order in this codebase. Current order: `AppThrottlerGuard → JwtAuthGuard → TenantGuard → RolesGuard → ActiveStaffGuard`. The new guard must be registered **first**, ahead of `AppThrottlerGuard`, so an unauthenticated caller never consumes a rate-limit bucket. **No `@Public()` escape hatch needed** — every BFF route, including today's `@Public()` (no-JWT) ones, should require this check, since nothing legitimate calls BFF except `ikaro-web`.

3. **Web-side**: read `WEB_INTERNAL_KEY` (the same secret's value, injected the same way BFF injects `INTERNAL_API_KEY` today) and set it as the `X-Web-Internal-Key` header on every outbound `route.ts` → BFF call.

### Phase 4 — BFF-side client-IP resolution: delete the guesswork, trust the header

Once Phases 1-3 land, BFF is provably only reachable by `ikaro-web`. The entire rationale for `client-ip.ts`'s CF-Connecting-IP/rightmost-XFF branching logic — "guess which header hop is the real client, because we might be getting called by something we can't fully trust" — no longer applies; it's dead reasoning once the caller is cryptographically pinned to `ikaro-web`.

1. **Simplify `apps/bff/src/shared/http/client-ip.ts`**: replace the CF-Connecting-IP/rightmost-XFF branching with a single trusted read of the new `X-Real-Client-Ip` header (fallback to `req.ip` only if genuinely absent, e.g. a local dev call with no proxy at all — mirrors the existing local-env fallback behavior).
2. **`AppThrottlerGuard.getTracker()`** (`apps/bff/src/shared/guards/app-throttler.guard.ts`): unchanged in structure, just now backed by a trustworthy source. Keep or adapt the `xff-verify` debug log added in M17-S27/PR #281 to log the new header instead, or remove it if it's no longer needed for verification purposes — implementer's judgment call once the new mechanism is live and re-verified the same way M17-S27 verified the old (broken) one: a real staging request, a known IP, a Cloud Logging check.

### Phase 5 — E2E redesign (Playwright)

The 9 helper files listed above (`apps/web/e2e/helpers/**`, `apps/web/e2e/authenticated-booking.spec.ts`) that build `BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1'` and call it directly need to route through the web app's own `/v1` gateway instead, for any run targeting a **deployed** environment (staging). This is the traffic-fidelity-correct choice anyway — it's exactly what a real browser does, and it removes the need for BFF to ever be reachable from a GitHub Actions runner at all.

- **Local / the `e2e` job in `pr-tests.yml` (docker-compose, no ingress restriction)**: `PLAYWRIGHT_BFF_URL` keeps defaulting to `http://localhost:3002/v1` for local/CI-against-docker-compose runs, since there's no Cloud Run ingress concept there. **Correction, found running this TD's own Story A branch through CI (2026-07-31):** this job is *not* fully unaffected the way the ingress reasoning above implies — `WebOnlyGuard` (Phase 3) is an application-layer check with no environment gate at all (unlike `AppThrottlerGuard.shouldSkip()`, which explicitly no-ops for `local`/unset `APP_ENV`), so it's active in *every* environment including local/CI docker-compose runs. The 9 direct-BFF-call helper files never send `X-Web-Internal-Key` (they bypass the `/v1` gateway entirely), so they started failing with 401s the moment `WebOnlyGuard` shipped. Fixed for this job without touching any of the 9 files individually: `apps/web/playwright.config.ts`'s `use.extraHTTPHeaders` sets `X-Web-Internal-Key` once for every request in the browser context (Playwright applies this to `page.request.*` calls too, not just navigation), reading `process.env.WEB_INTERNAL_KEY` — wired into `pr-tests.yml`'s `Run Playwright E2E` step and `apps/web/.env.playwright.local` for local runs.
- **`e2e-staging.yml`** (M17-S28, not yet built — this TD should land before or alongside S28, not after): should not set `PLAYWRIGHT_BFF_URL` to a real staging BFF URL at all post-fix (it would 403 under the new ingress lockdown regardless). Instead, either:
  - (a) change the 9 helpers to accept a configurable "API base" that resolves to `${PLAYWRIGHT_BASE_URL}/v1` when targeting staging (routes through web's gateway, real production-shaped traffic), or
  - (b) keep a separate direct-BFF path for local only, explicitly gated so it's never selected when `PLAYWRIGHT_BASE_URL` points at a deployed env.
  Prefer (a) — it's simpler (one code path, parameterized) and matches real traffic shape more closely. Flag as an explicit open question for whoever picks this up, since it touches S28's own scope/sequencing.

### Phase 6 — Rollout & validation plan

**Staging is live traffic; prod is not (as of this writing prod has not been activated — `M17-S37` is the not-yet-run staging-activation runbook). The two environments therefore need different rollout treatment, not the same "apply then repeat" sequence.**

#### Staging (live — sequencing matters)

`infra-deploy.yml` (Terraform, triggered by `infra/terraform/**` paths) and `deploy-staging.yml` (app deploy, triggered by `apps/**`/`packages/**` paths) are two independent, unordered GitHub Actions workflows with no `needs:` dependency between them. Landing Phase 1's Terraform (which removes BFF's public invoker grant) and Phase 2's app code (which is what makes `ikaro-web` start presenting an ID token) in the same PR does **not** guarantee they apply in the safe order — the two workflows race, and if Terraform's apply finishes first, every BFF call from `ikaro-web` 401s until the app deploy catches up (Cloud Run image build + deploy is typically slower than a small `terraform apply`).

Decision: for staging, this window (an outage of unknown-but-likely-multi-minute duration, full loss of BFF-dependent functionality, not partial degradation) is an accepted cost — it is a pre-prod environment and no external users depend on its uptime. Bundle Phases 1-4 into a single staging deploy rather than adding artificial sequencing:

1. Apply Phase 1 Terraform to staging and deploy Phase 2-4 app changes together (same PR is fine).
2. **Re-run the same live verification M17-S27 did**: real browser request from a known IP against staging, confirm the new `X-Real-Client-Ip`-sourced log line now shows the actual requester's IP, not `ikaro-web`'s egress address.
3. Confirm the app-layer guard actually rejects an unauthenticated direct call to BFF's internal URL attempted from *outside* the VPC (should fail at the ingress layer before even reaching the guard) and from a VPC-internal-but-unauthenticated caller if one is easy to construct for the test (should fail at the guard).
4. Confirm the per-PR merge-gating E2E job (`e2e` job in `pr-tests.yml`, part of the required `test-suite-passed` check) is unaffected — it runs against `docker compose`, with `PLAYWRIGHT_BFF_URL` defaulting to `http://localhost:3002/v1` (no Cloud Run ingress concept there at all), so nothing in Phases 1-4 touches it.
5. Land Phase 5 (E2E redesign) before or alongside M17-S28 — that phase only affects the not-yet-built `e2e-staging.yml` workflow (Playwright against a *deployed* staging URL), never the merge-gating docker-compose job.

#### Prod (not yet live — no outage to avoid, just build it correct from the start)

Since prod has no live traffic yet, there is no transition to sequence and no outage window to protect against. Do not treat this as "repeat the staging rollout" — instead, ensure prod's Terraform (`infra/terraform/envs/prod/main.tf`) and the corresponding app config already reflect the corrected design (`INGRESS_TRAFFIC_INTERNAL_ONLY`, no public BFF invoker, VPC egress on `ikaro-web`, IAM auth wired, shared-secret guard) as part of however prod gets stood up and activated. This TD should land **before** `M17-S37` (the prod staging-activation runbook) runs, so S37 never has to activate prod against the broken assumption and then re-verify a fix — prod simply comes up correct on day one.

---

## Implementation status (2026-08-01)

**Story A (staging, Phases 1-4) — merged (PR #298, `d99c6cd28`, 2026-08-01) and deployed to staging; the core mechanism is empirically verified live, not just code-reviewed.**

### Done (code + tests, this branch)

- **New package `packages/http-utils`**: `getClientIp()` (web's browser→web hop resolution, moved verbatim from the old BFF file) + `getTrustedClientIp()` (BFF's new trust-the-header read). 18 tests.
- **BFF**: `WebOnlyGuard` (`apps/bff/src/shared/guards/web-only.guard.ts`), registered first in `APP_GUARD` (confirmed registration order = execution order). `client-ip.ts` simplified to a thin wrapper trusting `X-Real-Client-Ip`. `AppThrottlerGuard`'s debug log updated. `WEB_INTERNAL_KEY` added to `env.validation.ts` (unconditionally required, mirrors `INTERNAL_API_KEY`).
- **Web**: `google-identity-token.ts` (ID-token adapter, mirrors BFF's `google-identity-token.adapter.ts`), `bff-auth.ts` (`getBffAuthMode`/`getBffAudience`, no zod schema — web has none, so this follows web's existing plain-`process.env` convention), `bff-transport-headers.ts` (`attachBffAuthHeaders`/`resolveClientIp`, shared by both `route.ts` **and** `bff-server.ts` — a gap not in the TD's original Phase 2 text, found during implementation: `bffServerFetch`/`bffPublicFetch` bypass the gateway and call `BFF_UPSTREAM_URL` directly, so they needed the same IAM token/shared-secret/IP-forwarding treatment or every SSR page load would have broken once Phase 1 landed). `buildBffUrl()` slash-normalization fix.
- **Terraform (staging only)**: BFF ingress → `INGRESS_TRAFFIC_INTERNAL_ONLY`; public invoker grant removed; `ikaro-web` gets `vpc_egress`/`network_id`/`subnet_id`; `BFF_UPSTREAM_URL` → live `module.cloudrun_bff.service_uri` reference; new `web-internal-key` secret + IAM accessor grants for both `ikaro-web@`/`ikaro-bff@`. **Found and fixed during implementation, not anticipated by the TD text**: making `BFF_UPSTREAM_URL` a live module reference exposed a genuine 3-node module cycle (`web → bff → backend → web`, via `cloudrun_backend`'s own `FRONTEND_URL` reference to `cloudrun_web`) that only `terraform validate` caught — resolved by routing `cloudrun_bff`'s `ALLOWED_ORIGINS`/`FRONTEND_URL` and `cloudrun_backend`'s `FRONTEND_URL` through the existing `var.web_real_uri` bootstrap-placeholder pattern instead of a live reference, leaving only one live edge in the graph. The now-fully-live-referenceable `bff_real_uri` variable was removed as dead code.
- **CI**: `WEB_INTERNAL_KEY` wired into every `pr-tests.yml` job that boots BFF for real (`bff-component`, the `e2e` job's service-startup step, the Playwright step, the Docker boot smoke test) plus `apps/web/.env.playwright.local` for local runs.
- **Prod Terraform coherence fix**: `WEB_INTERNAL_KEY` (unconditionally required by app code, no environment gate) is now also wired into prod's foundation `secret_ids` map and both `cloudrun_bff`/`cloudrun_web` `secret_env_vars` — found via a real `terraform plan — foundation (prod)` CI failure (`Invalid index` on the map lookup) and the `Terraform env-var contract` regression test, both caught only once pushed. Does not touch prod's ingress/VPC/`BFF_AUTH_MODE` — that's `plan/M17-CLOUD-DEPLOY.md`'s **M17-S53**.
- **PR #298 review round (CodeRabbit + Codex 5-agent review) — all findings triaged, real ones fixed:**
  - **Codex Critical — `WebOnlyGuard` blocked Cloud Run's own health probes.** Real bug: Cloud Run's `startup_probe`/`liveness_probe` are plain GETs with no custom headers, so they could never present `X-Web-Internal-Key`, and the guard had no `@Public()` escape hatch by design. Fixed with a narrow `@BypassWebOnlyGuard()` decorator (not `@Public()`, which is used far too broadly) applied only to `HealthController` — mirrors `InternalApiGuard`'s existing `@Public()`-respects-Reflector pattern on the backend, scoped tighter. Component-tested with the header genuinely absent (not just a mocked Reflector in the unit spec).
  - **Found independently while investigating a live CI failure — `WebOnlyGuard` also has no environment gate at all** (unlike `AppThrottlerGuard.shouldSkip()`, which explicitly no-ops for local/unset `APP_ENV`), so it's active in every environment including the merge-gating docker-compose `e2e` job. The 9 direct-BFF Playwright helper files never send `X-Web-Internal-Key` (they bypass the `/v1` gateway entirely for test-setup speed), so a real Playwright CI run 401'd on `dev-login` and guest-booking setup. Fixed centrally via `playwright.config.ts`'s `use.extraHTTPHeaders` (applies to `page.request.*`, not just navigation) rather than touching all 9 files — see Phase 5's correction note above.
  - **CodeRabbit — `bff-server.ts`'s header-stripping fix had its own regression.** The first version unconditionally stripped `Authorization` from caller-supplied headers, which broke `app/api/bookings/attachments/signed-url/route.ts` (a real test failure caught this): that route legitimately forwards the *user's own* bearer token when `BFF_AUTH_MODE` isn't `iam`, and `Authorization` is only actually transport-controlled when IAM mode sets it. Fixed with a hybrid strip: `X-Real-Client-Ip`/`X-Web-Internal-Key` are always stripped (always meant to be transport-controlled, even on a call where the real value ends up absent); `Authorization` is stripped only when `attachBffAuthHeaders` actually set it this call.
  - **CodeRabbit — `route.ts`'s `attachBffAuthHeaders()` moved inside the `try` block** so a config error or token-fetch failure falls through to the same generic 502 as an upstream fetch failure, instead of an unhandled rejection.
  - **CodeRabbit — explicit timeout added to `getBffAuthorizationHeader`** (5s, covers both `getIdTokenClient` and `getRequestHeaders`), since it now runs on every authenticated web→BFF request.
  - **CodeRabbit — startup validation of `WEB_INTERNAL_KEY`/`BFF_AUTH_MODE`, evaluated and not implemented**: verified `apps/web/app/api/health/ready/route.ts` already calls `bffPublicFetch('/health/ready')`, which already exercises this exact validation path, and Cloud Run's own `startup_probe` for web already targets that path — a bad config already fails the startup probe and the revision never receives traffic. A new `instrumentation.ts` mechanism would be redundant with protection that already exists.
  - Terraform test/doc nits (secret-count comment, missing `web-internal-key` assertion in the prod test case, MD022 blank lines, `pr-e2e.yml`→`pr-tests.yml` naming) all fixed.
  - Doc sweep (Codex Critical) done: `docs/24-BFF_ARCHITECTURE.md`'s Rate Limiting and Deployment sections, and `plan/M17-CLOUD-DEPLOY.md`'s architecture-diagram/hostnames-table/client-IP-extraction sections, all corrected or annotated with `Updated (TD38)`/`Superseded (TD38)` notes.
- **Verification**: BFF 858/858 tests pass, web 1944/1944 tests pass, both type-check clean, ESLint/Prettier clean on every touched file. `terraform fmt` clean; `terraform validate` clean on all 4 touched roots; `terraform test` passes on all touched modules; `checkov` shows zero new findings.

### Rollout log (staging, 2026-08-01 — found only once real traffic hit the deployed services)

- ~~PR not yet re-verified green on CI~~ **Merged 2026-08-01** as `d99c6cd28`; CI was green pre-merge.
- ~~`web-internal-key`'s real value ... a `terraform import` block adopts the manually-created container~~ **Resolved differently than originally planned, closing the special-case entirely**: the manually-created staging container was deleted and re-created by Terraform itself instead of being adopted — `web-internal-key` now bootstraps exactly like every other secret (create via Terraform, populate the version out-of-band, re-apply). No `import` block remains in `envs/staging/main.tf` (see `infra/terraform/README.md`'s new gotcha entry on the sibling Foundation-ordering trap this surfaced).
- **New — Foundation's prod apply failed** on the same secret: `Error retrieving IAM policy for secretmanager secret "projects/ikaro-prod/secrets/web-internal-key": ... 404: Secret ... not found`. Root cause: Foundation's `runtime-identities` module grants IAM accessor bindings on `web-internal-key` unconditionally for both envs, but prod's env-level Terraform root (which creates the container) hadn't applied yet — prod's env apply is gated behind manual approval, unlike staging's auto-apply-on-merge. Fixed procedurally: ran prod's env apply (creating the container), added its value, re-ran Foundation's `workflow_dispatch` for prod. Documented as a durable gotcha in `infra/terraform/README.md` so the next secret added to `base_secret_ids` doesn't hit the same ordering trap blind.
- **New — the deploy pipeline's own smoke test broke.** `deploy-staging.yml`'s "Smoke test bff" step curled BFF's public `*.run.app` URL directly from the GitHub Actions runner — exactly what `INGRESS_TRAFFIC_INTERNAL_ONLY` + no public invoker is supposed to block, so it 404'd on the very first post-merge deploy ([run 30710564919](https://github.com/lmmoreira/ikaro/actions/runs/30710564919/job/91397978604)). Fixed in `bugfix/smole-test-up` (PR #299): routes the smoke test through `ikaro-web`'s `/v1` gateway instead — the only path any real caller reaches BFF through post-TD38, which also exercises the IAM token + shared-secret attachment, not just BFF's own liveness. Removed the now-dead `bff_url` output/resolve step (nothing outside the VPC can reach BFF directly to resolve or curl it anymore).
- **New — `web-internal-key`'s value had a trailing newline byte, breaking every real (non-health) BFF call.** Set via `openssl rand -hex 32 | gcloud secrets versions add ...`, which pipes `openssl`'s own trailing `\n` straight into the secret (confirmed via `gcloud secrets versions access ... | xxd`: 65 bytes, not 64). BFF hashes its raw env-var copy (65 bytes, `\n` included) as the comparison baseline in `WebOnlyGuard`; web's copy gets silently normalized to 64 bytes somewhere in the fetch/HTTP-header stack before it reaches BFF on the wire. Different lengths → different SHA-256 hashes → every real route (anything without `@BypassWebOnlyGuard()`) rejected with `401 AUTH_UNAUTHORIZED "Missing or invalid X-Web-Internal-Key header"`, even though `/v1/health/ready` (bypassed) looked fine — this is what actually broke the live site (`/v1/public/platform/manifest/...` 500s, real hotsite pages down) after the "everything applied cleanly" point. Fixed in both envs: `printf '%s' "$(openssl rand -hex 32)"` (no trailing newline) piped into a new secret version, then a forced new Cloud Run revision (`gcloud run deploy` with the same image — a services-update with no real spec change does *not* force Cloud Run to re-resolve `secret_key_ref: latest`) for both `ikaro-bff` and `ikaro-web`.
- **Empirically verified live in staging, post-fix** (not just code-reviewed): direct `curl` to BFF's own `*.run.app` URL → 404 (ingress blocks it); `curl <web-url>/v1/health/ready` (bypassed guard) → 200; `curl <web-url>/v1/health/ready` and real routes through the gateway with the corrected secret → 200; `client-ip-verify` log for a real browser request → `x-real-client-ip="177.76.129.80" resolved="177.76.129.80"` (a real ISP address, not a Google-owned one — the exact defect this TD started from).
- **Story B (prod)** — moved to `plan/M17-CLOUD-DEPLOY.md`'s **M17-S53** (2026-08-01), a hard dependency of M17-S37 (production activation). Full scope, the ALB-reachability decision, and acceptance criteria now live there, not here.
- **Story C (Phase 5, E2E redesign)** — not started.

---

## Open questions (resolve before/during implementation, not silently assumed)

1. **Why did S22 originally put BFF behind the ALB (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`) instead of `INTERNAL_ONLY` like the backend?** **Partially answered during Story A's story-discovery (2026-07-31), relevant to Story B (prod) not Story A (staging — S22's edge module is prod-only, staging has no edge module at all):** `TD35` (Done, PR #262) explicitly documents that the *intended long-term* gateway is edge/load-balancer **path** routing (`/v1/*` → BFF NEG directly, every other path → web NEG), and that the current web-side `route.ts` reverse-proxy is an interim step "until edge routing becomes available" — at which point the identical public `/v1` contract should move to the edge without changing browser clients. S22's actual `modules/edge` implementation today is **host**-routed only (`bff.ikaro.online` → bff NEG, `ikaro.online`/`www` → web NEG), not path-routed, so TD35's interim proxy is genuinely what's live in prod today too — TD38's assumption that prod behaves like staging in the relevant respect still holds *for now*. But Phase 1 step 4's proposed move to full `INTERNAL_ONLY` for prod BFF would remove BFF's ALB reachability entirely, foreclosing TD35's documented future path-routing migration (which needs BFF reachable via the LB) without that tradeoff being called out. **Tracked, not yet resolved:** M17-S53's own "resolve first" step owns this decision now — accept the tradeoff (re-adding ALB reachability later if path-routing is ever built) or keep prod's BFF ingress at `INTERNAL_LOAD_BALANCER` and rely solely on removing the public invoker grant (Cloud Run IAM would still reject any unauthenticated call arriving via the LB, achieving the same lockdown without closing off the LB network path). No Cloud Armor/WAF-specific reason was found in S22 or TD35.
2. **Where exactly does S22's edge module create `bff.ikaro.online`'s DNS/cert?** Needed to do M17-S53's Terraform cleanly (or to explicitly decide to leave it dangling and document why). Tracked as part of M17-S53 now, not here.
3. ~~**Shared client-IP-resolution package placement**~~ **Resolved during Story A's story-discovery (2026-07-31):** new package `packages/http-utils` — see Phase 2 item 4 above for why `packages/observability` was ruled out and why duplication was rejected in favor of a new package.
4. ~~**`APP_GUARD` ordering**~~ **Resolved during Story A's story-discovery (2026-07-31):** confirmed registration order is execution order (`apps/bff/src/app.module.ts:53-54`); new guard registers first, ahead of `AppThrottlerGuard` — see Phase 3 item 2 above.
5. **E2E redesign approach** (Phase 5) — (a) vs (b), see above. Still open — Phase 5 is Story C, not part of Story A.

---

## Acceptance criteria

- [ ] BFF's ingress is locked down and `allUsers` public invoker grant on `ikaro-bff` is removed in both projects — **staging: applied and verified live (`gcloud run services describe` shows `ingress: internal`; direct curl to BFF's own URL returns 404). Prod: moved to `plan/M17-CLOUD-DEPLOY.md`'s M17-S53.**
- [ ] `ikaro-web` presents a valid Google ID token (audience = BFF's internal service URI) on every server-side call to BFF; verified via a real deploy, not just code review — **verified live in staging** (real gateway calls reach BFF successfully with `BFF_AUTH_MODE=iam` and VPC egress wired); **prod moved to M17-S53 (`BFF_AUTH_MODE` not wired there yet).**
- [x] A direct, unauthenticated call to BFF's internal service URI from outside the VPC fails at the ingress layer (connection-level rejection, not an app-level 401) — **verified live in staging**: `curl https://ikaro-bff-*.run.app/v1/health/ready` → 404, from outside the VPC.
- [x] The new app-layer shared-secret guard (`X-Web-Internal-Key` or equivalent) rejects any BFF request missing/mismatching it, mirroring `InternalApiGuard`'s existing backend behavior and test coverage shape — unit + component tested (including the Cloud Run health-probe bypass); **verified live in staging** end to end, including catching a real secret-value bug (trailing-newline mismatch, see rollout log) that a missing/mismatched-key test alone wouldn't have caught.
- [x] `client-ip.ts`'s CF-Connecting-IP/rightmost-XFF guessing logic is deleted, replaced by a direct read of the new trusted header — **verified live in staging**: a real browser request logged `client-ip-verify: x-real-client-ip="177.76.129.80" resolved="177.76.129.80"`, a real ISP address, not `ikaro-web`'s own egress address.
- [x] A real staging request from a known IP shows that IP (not `ikaro-web`'s egress address) in the resolved client-IP log — **done, see above (repeats the M17-S27 verification, now passing).**
- [x] The `e2e` job in `pr-tests.yml` (local/docker-compose E2E) passes unmodified — confirmed green pre-merge (required check on PR #298).
- [ ] E2E-against-staging (M17-S28 or this TD, whichever lands the wiring) routes BFF-bound test-helper calls through the web app's `/v1` gateway, not a direct BFF URL, when targeting a deployed environment — **not started (Story C).**
- [x] Both `docs/24-BFF_ARCHITECTURE.md` and `plan/M17-CLOUD-DEPLOY.md`'s S22/S27 sections are updated to reflect the new ingress/auth model (stale-doc sweep, per CLAUDE.md §7 Definition of Done)

## Dependencies

- M17-S18 (BFF/backend Cloud Run services, IAM baseline) — done, this TD builds on its existing `bff_web` invoker binding
- M17-S47 (BFF→backend IAM ID-token pattern) — done, this TD mirrors it exactly for web→BFF
- Should land before or alongside M17-S28 (Playwright E2E against staging) — S28's own `PLAYWRIGHT_BFF_URL` wiring choice depends on this TD's Phase 5 decision
- Prod rollout (formerly "Story B" here) is now tracked as **M17-S53** in `plan/M17-CLOUD-DEPLOY.md`, an explicit dependency of M17-S37 (production activation) — see that story for full scope, the ALB-reachability decision, and its own acceptance criteria. Nothing further to track for prod in this TD.
