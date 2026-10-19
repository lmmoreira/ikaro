# TD29 — Runtime-injected public config for `apps/web` (restore build-once-promote-everywhere)

## Status

- **Type**: Technical Debt / Architecture
- **State**: ✅ Done — implemented and merged via PR #186 (2026-07-22). Deferred items (real-build E2E/CSP verification, D8/S26 Terraform/plan follow-through) tracked against M17-S25/S27/S28, not this TD.
- **Priority**: High-ish, but **not a blocker for any M17 story today** — see Sequencing below
- **Context**: `apps/web`'s `NEXT_PUBLIC_*` handling; `plan/M17-CLOUD-DEPLOY.md` D8; M17-S26's build-arg assertion
- **Created**: 2026-07-22 (surfaced during M17-S25 story-discovery/implementation — no live incident, purely an architecture review finding)

---

## Problem

`plan/M17-CLOUD-DEPLOY.md` D8 states the project's core deploy principle: a single image SHA, validated in staging, gets promoted byte-for-byte to production for backend and BFF. D8 then carves out one explicit exception: *"the web image is built per environment because `NEXT_PUBLIC_*` vars are inlined at build time."*

That exception is real and structurally forced by how Next.js works — `process.env.NEXT_PUBLIC_*` references inside any module that ends up in the client (browser) bundle are **statically replaced at `next build` time**, not read at runtime. There is no way to change that substitution after the image exists. So today, `ikaro-web:<sha>-staging` and `ikaro-web:<sha>-prod` are **two different binary artifacts** built from identical source. The thing validated in staging (probes, smoke tests, E2E) is never literally the thing that runs in prod — only its source is identical.

This reopens exactly the risk immutable, single-artifact delivery exists to close: a difference could exist between what was tested and what ships, even with zero code change, purely from two separate build executions (a flaky dependency resolution step, a different transient state at build time, etc.). The project already implicitly acknowledges the danger: M17-S26 has a dedicated **build-arg assertion** step specifically because *"the web-prod image is the only rebuilt artifact (D8) and its worst failure — a wrong `NEXT_PUBLIC_*` value baked in — is invisible to health smokes."* That step is a **detector** for this gap, not a fix for it.

**Not a security issue.** The three values involved (`NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL`) are not secrets — they're public hostnames already visible in any browser's network tab. This is purely a delivery/architecture-integrity gap.

---

## Current inventory (verified 2026-07-22 — re-verify at implementation time; bundling depends on the importer chain, not just a file's own `'use client'` directive, so treat this as a strong starting point, not gospel)

**Corrected 2026-07-22, during implementation (not discovery) — the first inventory pass below was wrong for 4 files.** Story-discovery classified files as client vs. server by whether *the file itself* carries `'use client'`. That's an insufficient test — what actually matters is whether any importer along the chain is a client component, regardless of the file's own directive. Re-verifying every "server-only" file by tracing its real callers (not just its own header) found:

**Genuinely client-only (no server caller found):**
- `apps/web/shared/lib/api/bff-client.ts` — axios `baseURL: process.env.NEXT_PUBLIC_BFF_URL`. Backs every React Query hook in `features/booking/api`, `features/customer/api.ts`, `features/loyalty/api.ts`, `features/staff/api/staff.ts`, etc.
- `apps/web/features/platform/hotsite/resolve-hotsite-image-url.ts`'s `hotsiteImageBaseUrl()` — backs `SingleImageUploadField`, `GalleryImageManager`, `HotsitePreview` (all confirmed `'use client'`).
- Five components independently constructing the same logout URL, all confirmed `'use client'`: `features/customer/components/CustomerTopbar.tsx`, `features/customer/components/InformationCompletionPrompt.tsx`, `shells/dashboard/components/Sidebar.tsx`, `shells/dashboard/components/ManagerSheet.tsx`, `shells/hotsite/components/HotsiteAuthBarDropdown.tsx`.
- `features/booking/api/public.ts`'s `createBooking` and `submitGuestBookingInfo` — **originally miscategorized as server-only.** Their only callers are `features/booking/components/public/BookingForm.tsx` and `SubmitInfoForm.tsx`, both confirmed `'use client'`. (The other two exports in this file, `createAttachmentSignedUrl`/`createGuestAttachmentSignedUrl`, call a *relative* path to web's own Route Handler, not `NEXT_PUBLIC_BFF_URL` — no change needed there.)
- `features/platform/hotsite/api/schedule.ts`'s `fetchAvailabilitySummary`/`fetchAvailability` — **originally miscategorized as server-only.** Only callers found: `AvailabilityCarousel.tsx`/`SlotPicker.tsx`, both `'use client'`. No server caller exists. No `next.revalidate` option used either, confirming these are genuinely client-only, not isomorphic.

**Genuinely isomorphic — called from both a Server Component and a client component, confirmed by tracing every caller:**
- `features/platform/api.ts`'s `fetchManifest`/`fetchManifestResponse` — **originally miscategorized as server-only.** Called from several `page.tsx`/`layout.tsx` files (server) *and* from `HotsitePreview.tsx` (`'use client'`, line 64: `await fetchManifest(tenantSlug)`) for the live hotsite editor preview. `fetchPublishedHotsiteSlugs` (same file) is server-only (`app/sitemap.ts` only).
- `features/platform/hotsite/api/services.ts`'s `fetchServices` — **originally miscategorized as server-only.** Called from `page.tsx` (server) *and* `HotsitePreview.tsx` (client). Uses `next: { revalidate }` (ISR), which only has meaning server-side — confirms it must stay a plain, isomorphic `fetch()`, since neither `bffClient` (axios, no ISR support) nor `bffServerFetch`/`bffPublicFetch` (server-only, forbidden in `'use client'` files per CLAUDE.md) can serve a function called from both worlds.

**Practical consequence:** because `fetchManifest`/`fetchServices` genuinely run in both environments, the earlier plan to "migrate these onto `bffPublicFetch`" (Fix step 3, since revised) was not just extra work — it was **not viable** for the isomorphic ones, since `bffPublicFetch` is a server-only helper by design. The correct, minimal fix for every file in this section — isomorphic or client-only — is the same: swap the raw `process.env.NEXT_PUBLIC_BFF_URL` read for `getPublicEnv('NEXT_PUBLIC_BFF_URL')` in place, and change nothing else (still plain `fetch()`, still whatever transport each function already uses). Whether to *additionally* route the two genuinely client-only fetchers (`createBooking`/`submitGuestBookingInfo`, `fetchAvailabilitySummary`/`fetchAvailability`) onto `bffClient` to resolve the pre-existing `docs/ANTI_PATTERNS.md` violation is a **separate, optional refactor** with its own risk profile (axios throws on non-2xx by default; `fetch` does not — call sites would need re-auditing) — deliberately **not** folded into this TD, to keep the diff scoped to exactly what TD29 is for. See "Not in scope."

**Confirmed genuinely server-only (traced every importer, not just checked the file's own header):**
- `middleware.ts`, `shared/lib/api/bff-server.ts` — its own `.spec.ts`-adjacent convention plus every real importer is either a Route Handler (`cookies()` from `next/headers`), a file with an explicit `import 'server-only'` guard, or a `.server.ts`-suffixed module; none is `'use client'`.
- `app/sitemap.ts` — a special Next.js convention file, framework-guaranteed server-only.
- `features/platform/hotsite/seo.ts`'s `SITE_URL` — only imported by `not-found.tsx`, `sitemap.ts`, `robots.ts`, all server-only special files.
- `shared/lib/i18n/resolve-locale.ts` — only imported by `i18n/request.ts` and `switch-tenant/page.tsx`, both server-side; no client caller.

The other two vars already have a single chokepoint and need no further consolidation: `seo.ts` exports `SITE_URL` as one constant; `resolve-hotsite-image-url.ts`'s `hotsiteImageBaseUrl()` is already the sole read point by its own design (see its code comment).

**Special case — cannot use this TD's fix:** `next.config.ts` is evaluated by the Next.js server process at boot, before any request handling exists. It must keep reading a real container env var at startup; this is already satisfied by M17-S25's Terraform change and is independent of everything else in this TD.

**Test surface:** 29 `.spec.ts`/`.spec.tsx` files currently reference these vars directly (mostly by mutating `process.env` in setup/teardown) — re-run `grep -rl "NEXT_PUBLIC_" apps/web --include="*.spec.ts" --include="*.spec.tsx"` at implementation time for the authoritative list.

**`.env`/`.env.example` files (verified 2026-07-22 across the whole repo, not just web):**
- `apps/web/.env.example` (committed) and `apps/web/.env.local` (gitignored, local-dev-only) both carry all three vars pointed at localhost: `NEXT_PUBLIC_BFF_URL=http://localhost:3002/v1`, `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL=http://localhost:4443/ikaro-local-public`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Matches the known 3-var list exactly — no surprise 4th var found.
- `apps/web/.env.playwright.local` (gitignored) has **none** of the three — Playwright gets them another way (see workflow finding below).
- `apps/backend/.env.example` and `apps/bff/.env.example` have **zero** `NEXT_PUBLIC_*` references, as expected — this is purely an `apps/web` client-bundling concern, not a backend/BFF one.

**GitHub workflows (verified 2026-07-22 across `.github/workflows/*.yml`; corrected during implementation — see Fix step 8):**
- `.github/workflows/pr-tests.yml` (lines 335-337, the Playwright E2E job) sets `NEXT_PUBLIC_BFF_URL`, `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL`, `NEXT_PUBLIC_SITE_URL` as plain job-level `env:` before running `pnpm --filter @ikaro/web dev` (the Next.js **dev server**, not a production build). Initial discovery assumed this needed updating; verified during implementation that it doesn't — `PublicEnvScript` is a Server Component and reads real `process.env` the same way in dev or prod, so the job's existing pre-start `env:` is exactly what it needs, unmodified.
- No other workflow file (`pr-quality.yml`, `infra-deploy.yml`, `weekly-jobs.yml`) references these vars today. `deploy-staging.yml` (M17-S25, paused pending this TD) will set them as Docker build args + Terraform `env_vars` per the currently-accepted D8 exception — that file becomes a second thing this TD's Fix step 7 revisits once the accessor lands.

**Doc staleness found during story-discovery (2026-07-22) — two different buckets:**
- `docs/09-CI_CD_PIPELINE.md`, `docs/23-INFRASTRUCTURE_SETUP.md` describe a pre-M17 deploy architecture (SA JSON keys, `us-central1`/`ikaro-images` registry, old workflow names) — **already known and already covered**: `docs/23` carries an explicit supersession banner ("Partially superseded by `plan/M17-CLOUD-DEPLOY.md` §0... Full rewrite tracked as M17-S42"), and `docs/09` was already flagged the same way during M17-S25's own discovery. No action needed from this TD.
- `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`'s "Environment variables at runtime" table and CI/CD summary (lines ~197-221) are **equally stale but carry no supersession banner** — it claims `NEXT_PUBLIC_BFF_URL` is *"Injected at build time via Cloud Run `--set-env-vars`"* (confusingly wrong under either the current D8 exception or this TD's fix — `--set-env-vars` is a deploy-time, not build-time, mechanism), references a `next.config.js` using the deprecated `env: {}` config key, and names CI/CD workflows (`ci-frontend.yml`, `deploy-frontend.yml`) that don't exist in this repo. Unlike `docs/23`, this file **never got S48's supersession-banner treatment** — a real gap, since `docs/16` is still the live, non-superseded, actively-loaded doc for dashboard frontend work (CLAUDE.md §10's dynamic-loading table points here for any "Dashboard / admin frontend" task). Since this TD directly replaces the very mechanism this section misdescribes, fixing or banner-scoping it belongs in this TD's own doc-sweep, not deferred silently (CLAUDE.md §7 DoD: *"If this story replaces or removes an existing flow/mechanism... grep docs/*.md... for anything still describing the old version — update or flag it in the same PR"*). Added as a Fix step and Acceptance Criterion below. (Only this one section was checked for staleness — not a claim the rest of `docs/16` needs review.)

**Confirmed, currently-enforced anti-pattern, corrected scope (2026-07-22):** `docs/ANTI_PATTERNS.md` (line 112) names raw `fetch(NEXT_PUBLIC_BFF_URL + path)` a violation and says to use `bffClient`/`bffServerFetch`/`bffPublicFetch` instead. That rule implicitly assumes a fetcher is either purely server- or purely client-side. Two of the 4 raw-`fetch()` files (`platform/api.ts`'s `fetchManifest`, `services.ts`'s `fetchServices`) are genuinely isomorphic, so neither prescribed replacement actually applies to them — this TD's fix (accessor swap only) is the correct treatment, not a partial one. The other two (`booking/api/public.ts`, `schedule.ts`) are genuinely client-only and *could* additionally move to `bffClient`, but that's tracked as a separate, optional follow-up (see "Not in scope"), not fixed here.

---

## Fix (design)

1. **New accessor**, e.g. `apps/web/shared/lib/runtime-env.ts`, exposing something like `getPublicEnv(key: PublicEnvKey): string`:
   - Server-side: reads real `process.env[key]` (the container's actual runtime env — correct today already).
   - Client-side: reads from a value injected server-side into the initial HTML response, never from `process.env` (frozen at build time for client bundles).
2. **Injection mechanism — decided 2026-07-22: hand-rolled, no third-party package.** The root layout (a Server Component, runs per-request) reads the three real env vars and renders an inline `<script>window.__PUBLIC_ENV__ = {...}</script>` into the response, before hydration. Reasoning:
   - No CSP work needed either way (see Risks — `'unsafe-inline'` already covers it), which removes the main reason a package like `next-runtime-env` is usually reached for (nonce wiring).
   - This is Next.js's own first-party-documented pattern for exactly this problem (a Server Component reading live `process.env` and injecting it for client consumption) — "never improvise, use given references" points at the framework's own answer before a third-party wrapper around the same idea.
   - Three plain string values, no dynamic logic — small enough (~30-40 lines: one injection component + one typed accessor) that a dependency adds supply-chain surface (another Snyk-scanned, version-pinned, someday-needs-updating package) without buying meaningfully more robustness, consistent with this project's general anti-lock-in bias (M17's own "Anti-lock-in guardrails," extended here to the same spirit even though this isn't cloud infra).
   - A plain inline script tag rendered directly by the Server Component (not `next/script`) is sufficient — `next/script`'s loading-strategy machinery exists mainly for `src`-based third-party scripts; an inline same-document script is already present synchronously in the initial HTML without it.
3. **Revised 2026-07-22 (see Current Inventory correction):** migrate every client-bundle-affecting and isomorphic consumer to the new accessor **in place** — swap `process.env.NEXT_PUBLIC_X` for `getPublicEnv('NEXT_PUBLIC_X')` and change nothing else about how each function fetches. This applies uniformly to `bff-client.ts`, `resolve-hotsite-image-url.ts`, the 5 logout-URL components, `features/booking/api/public.ts` (`createBooking`/`submitGuestBookingInfo`), `features/platform/hotsite/api/schedule.ts`, `features/platform/api.ts` (`fetchManifest`/`fetchManifestResponse`), and `features/platform/hotsite/api/services.ts` (`fetchServices`). Do **not** route any of these through `bffPublicFetch`/`bffServerFetch`/`bffClient` as part of this step — two of them are isomorphic and structurally can't use those (server-only or no-ISR-support respectively), and keeping the fix mechanically identical everywhere is lower-risk than a mixed migration.
4. Route server-side reads through the same accessor too (recommended, for a single source of truth on these three names) rather than leaving them as direct `process.env` reads.
5. Update all affected spec files to mock the new accessor/global instead of mutating `process.env`.
6. Verify CSP compatibility — this repo already has a documented gotcha (`docs/CI_TRAPS.md`: *"`middleware.ts` unit tests passing does not mean the CSP actually works in a browser"*) for inline-script/nonce policy; extend the same verification approach to the new injected script.
7. Once migrated, the Docker build `ARG`/`ENV` plumbing planned for M17-S25's client-bundle purposes becomes unnecessary (any Terraform `env_vars` from M17-S25 stay — they're what this fix's *server-side* reads rely on). Recommend removing the build-arg path once this lands, rather than leaving two competing config mechanisms.
8. **Revised 2026-07-22, verified during implementation — no change needed.** The original claim here (job-level `env:` stops being sufficient) assumed a production-build mental model. `pr-tests.yml`'s `e2e` job actually runs `pnpm --filter @ikaro/web dev` (the Next.js **dev** server), not a production build. `PublicEnvScript` is a Server Component — it reads real `process.env` on every render, in dev or prod alike, exactly the same as the pre-TD29 code did. Since the job already sets the three `NEXT_PUBLIC_*` vars as job-level `env:` *before* starting the dev server, that inherited process env is exactly what `PublicEnvScript` reads server-side and injects for the client — the existing setup already works correctly with the new mechanism, unmodified. Left as a claim to be empirically confirmed by this PR's own CI run (the `e2e` job triggers for real on push) rather than by starting the dev stack locally.
9. `apps/web/.env.example`/`.env.local` keep the same three keys with the same local values — no key rename needed unless the accessor design (step 1-2) introduces a different naming convention, in which case update both files plus every developer's local `.env.local` (can't be scripted — gitignored, per-developer).
10. Add a supersession banner to `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`'s stale "Environment variables at runtime" / CI-CD section (lines ~197-221), matching `docs/23-INFRASTRUCTURE_SETUP.md`'s existing banner pattern, pointing at this TD + `plan/M17-CLOUD-DEPLOY.md` as canonical — that section never got S48's supersession-banner sweep and directly misdescribes the exact mechanism this TD replaces.
11. **Follow-up (separate story, not this TD):** once done, `plan/M17-CLOUD-DEPLOY.md` D8 and M17-S26 should be updated — web can promote the exact same image SHA validated in staging, like backend/BFF, dropping the per-env rebuild exception entirely. M17-S25 itself, once resumed, should be written against this TD's fix directly rather than the interim D8 exception if this TD lands first.

---

## Risks

- **Migration surface:** ~15 non-test files + 29 spec files — real regression risk across booking, customer, loyalty, staff, hotsite, and auth-logout flows.
- **Hydration-ordering:** the injected global must exist before the first client render that reads it. Must use a strategy that guarantees this (`beforeInteractive` / embedding directly in server-rendered HTML) — a client-side fetch of the config would race with components that need it immediately.
- **CSP — verified a non-issue, corrected 2026-07-22:** `apps/web/middleware.ts` deliberately uses `script-src 'self' 'unsafe-inline'`, not a nonce (its own comment: ISR/CDN-cached hotsite pages can't carry a reliable per-request nonce). An injected inline script needs no CSP change. Still worth one real-browser check per `docs/CI_TRAPS.md`'s general warning that unit tests passing doesn't prove a CSP actually works — but this is a verification step, not an open design risk.
- **Local dev workflow:** `pnpm dev`/docker-compose must keep working — `next dev` doesn't inline `NEXT_PUBLIC_*` the same hard way `next build` does; verify the new accessor doesn't regress local ergonomics.
- **Server/client value mismatch:** must guarantee identical values in the server-rendered pass and the client's first render, or risk a Next.js hydration warning/error.
- **Third-party dependency risk** if a package is adopted for the injection mechanism — vet before adopting, per above.

---

## Tests

- New unit spec for the runtime-env accessor: server path resolves from `process.env`; client path resolves from the injected global; missing-value behavior defined and tested.
- Update all affected spec files (29 as of 2026-07-22) to the new mechanism.
- New regression test proving at least one migrated client component (e.g. `CustomerTopbar`) renders the correct URL from the injected global and does **not** read `process.env` directly — guards against silently reintroducing the old pattern.
- **Deferred to M17-S25/S27, not this PR (revised 2026-07-22, cross-tool review finding):** an E2E run against a genuine **production build** (`next build && next start`, not `next dev`) confirming real cross-origin BFF resolution in an actual browser, plus extending the CSP/console-violation Playwright check (`docs/CI_TRAPS.md`) to cover the new injected script. Reasoning: M17-S25 is the first story that builds a real production Docker image at all — building a standalone production-build CI job just for this PR would duplicate work S25 already needs to do (build the image, smoke-test it) and would be thrown away/superseded almost immediately once S25 resumes. This PR's actual coverage in the meantime: 233 unit/component test files (jsdom, real DOM assertions on rendered output) plus the existing, unmodified `next dev`-based Playwright E2E suite in `pr-tests.yml`, which does exercise every migrated component in a real browser — just not against a production bundle specifically. Track the production-build verification as an explicit checklist item in M17-S25/S27 (whichever actually builds the first real web image), not as unfinished business here.
- Confirmation signal that the fix worked: M17-S26's build-arg assertion step becomes unnecessary entirely, not just repurposed — once M17-S25 is written against this fix, `apps/web/Dockerfile` needs no `NEXT_PUBLIC_*` build `ARG`/`ENV` at all (see "Sequencing" below), so there's no per-env web image left for that step to assert about.

---

## Not in scope

- A general-purpose runtime feature-flag or config platform — this TD is scoped to the three `NEXT_PUBLIC_*` values already in use.
- Rewriting M17-S26 itself — noted as the natural follow-up once this TD lands, not part of this TD's own work.
- **Migrating the two genuinely client-only raw-`fetch()` files (`booking/api/public.ts`'s `createBooking`/`submitGuestBookingInfo`, `schedule.ts`'s `fetchAvailabilitySummary`/`fetchAvailability`) onto `bffClient`.** This would fully resolve their `docs/ANTI_PATTERNS.md` violation (confirmed real, not speculative — see Current Inventory), but is a genuine behavior-changing refactor (axios throws on non-2xx by default, `fetch` doesn't — every call site's error handling would need re-auditing) with its own risk profile, independent of the runtime-config problem this TD exists to fix. Worth a small follow-up, not folded in here.
- The isomorphic files (`platform/api.ts`, `services.ts`) cannot be migrated onto any shared transport helper at all (see Current Inventory) — not a deferred item, a structural non-option.

---

## Sequencing

- **Technically independent of M17-S25** (S25 could ship using D8's currently-accepted exception regardless of this TD's timing) — but the user has chosen to resolve this TD **before** resuming M17-S25, so S25 is paused pending this TD's completion.
- Recommended to land before **M17-S37** (production go-live), so prod never actually runs on a rebuilt, independently-tested web artifact once real traffic exists.
- **Clarified 2026-07-22 (mid-review):** after this fix, `apps/web/Dockerfile` needs **zero** `ARG`/`ENV` for `NEXT_PUBLIC_*` — every consumer either reads the runtime-injected client global or reads live `process.env` server-side (`next.config.ts` included — it's evaluated at Next.js **process startup**, not uniquely at `next build`, so its `images.remotePatterns` config only needs a Cloud Run *runtime* env var, same as everything else). This isn't a separate simplification task to schedule later — since M17-S25/S26 haven't been implemented yet, there's nothing to undo; when work on them resumes, they should simply be written to build web **once**, like backend/BFF, with no per-env rebuild and no build-arg step at all. D8's exception language and M17-S26's build-arg assertion step should be dropped from the plan file when S25/S26 are actually (re)written, not patched in as an afterthought.

---

## Acceptance Criteria (TD-level)

**Reorganized 2026-07-22 (cross-tool review finding)** — the original flat list read as if every item belonged to this PR. Split explicitly to prevent that misread: this PR delivers the app-level fix only; the deploy-pipeline items are unreachable until M17-S25/S26 exist to deliver them.

**This PR:**
- [x] Every client-bundle-affecting `NEXT_PUBLIC_*` read goes through the new runtime accessor; none read `process.env` directly in client code
- [x] All affected spec files updated and green
- [x] All 4 raw-`fetch(NEXT_PUBLIC_BFF_URL...)` call sites (2 isomorphic, 2 client-only) migrated to the new accessor in place, transport unchanged (see "Not in scope" for the separate, undone `bffClient` migration of the 2 client-only ones)
- [x] `apps/web/.env.example` (and each developer's own `.env.local`) reviewed against any naming change from the accessor design — no rename needed
- [x] `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`'s stale env-var/CI-CD section carries a supersession banner (matching `docs/23`'s pattern)
- [x] `.github/workflows/pr-tests.yml`'s Playwright E2E job needs no change (verified: it runs `next dev`, and `PublicEnvScript` reads live `process.env` regardless of dev/prod) — confirmed by this PR's own CI `e2e` job

**Deferred to M17-S25/S27 (not achievable in an app-only PR — no deploy pipeline exists yet):**
- [ ] E2E run against a genuine **production build** (`next build && next start`) confirms correct cross-origin BFF resolution in a real browser
- [ ] CSP verification against that production build passes with the injected script
- [ ] A single `ikaro-web:<sha>` image (no `-staging`/`-prod` suffix, no build `ARG`/`ENV` for `NEXT_PUBLIC_*`) builds once and deploys unmodified to both environments — the natural way to write M17-S25/S26 now, not a separate simplification task (see "Sequencing")
- [ ] `plan/M17-CLOUD-DEPLOY.md` D8 and M17-S26's build-arg-assertion step removed when S25/S26 are actually (re)written
