# TD04 — Rebrand: BeloAuto → Ikaro (Repo, Product, and Infrastructure Naming)

## Status
- **Type**: Technical Debt / Naming & Branding
- **Priority**: Medium (no functional defect, but every new doc/file risks reintroducing the wrong name until this lands)
- **Context**: Repo-wide — package identity, CI/CD, docs, frontend, GitHub, SonarCloud
- **Created**: 2026-06-18
- **Updated**: 2026-06-18
- **Resolved**: 2026-06-18 — PR #2 merged to main (GitHub/SonarCloud migration, package/infra/CI rename, and docs/prototype rename all complete; Phase D seed-data restructuring tracked as a separate follow-up story, not blocking this TD)

---

## Problem

This repository, its npm/pnpm package scope, and most of its documentation were authored under the provisional name **BeloAuto** — both the working name of the SaaS product and (not coincidentally) the name of the very first hypothetical client used as sample/seed data. The real product, company, and GitHub organization are **Ikaro**. `lmmoreira/ikaro` already exists on GitHub (created 2026-06-18, currently a single placeholder commit).

**BeloAuto does not disappear.** It is a perfectly valid example tenant — a car wash client running on the Ikaro platform. The rename only targets references to **the platform itself** (the company, the SaaS, the package scope, the repo, the CI/cloud tooling identity). Anywhere "BeloAuto" appears as *sample tenant data* (a client name, a tenant slug, seed fixtures), it stays exactly as it is today.

A blind find-and-replace would either rename the platform incompletely (missing CI/infra/GitHub-level identity) or wrongly mutate legitimate tenant fixtures. This TD exists to:
1. Give a durable decision rule for classifying any "beloauto" string (rename / keep / judgment call).
2. Inventory every category of artifact affected, with a command to regenerate the live file list at execution time (a frozen line-by-line file dump here would go stale immediately).
3. Lay out the two external-system migrations (GitHub, SonarCloud) that can't be done by editing files.
4. Propose an execution phasing that doesn't leave the repo in a broken intermediate state.

---

## Decision Framework

Apply in this order to any "beloauto"/"BeloAuto" occurrence found in the repo:

| # | Question | Verdict |
|---|---|---|
| 1 | Does it identify **the platform/company/package/repo/CI-cloud-tooling itself** (pnpm scope, GitHub repo, SonarCloud project, Docker/DB/GCP resource names, CLAUDE.md/docs prose about "BeloAuto the product", default/fallback UI branding shown when no tenant applies)? | **Rename** → Ikaro / ikaro |
| 2 | Does it represent **a tenant/client of the platform** — sample seed data, a tenant slug, a `.http` fixture value, a test-builder default business name, a demo tenant shown in a prototype mockup? | **Keep** — BeloAuto remains a legitimate sample client |
| 3 | Is it the `--ba-` CSS custom-property prefix used for tenant branding tokens? | **Judgment call** — see below, default recommendation is *leave it* |
| 4 | Is it inside `docs/archive/**`? | **Out of scope** — explicit decision (frozen, superseded record; CLAUDE.md §10 already tells agents never to load it) |

### Naming map (once "rename" applies)

| Old | New |
|---|---|
| `BeloAuto` (brand, prose) | `Ikaro` |
| `beloauto` (lowercase technical slug) | `ikaro` |
| `@beloauto/*` (pnpm package scope) | `@ikaro/*` |
| `lmmoreira/beloauto` (GitHub repo) | `lmmoreira/ikaro` |
| `lmmoreira_beloauto` (SonarCloud project key) | `lmmoreira_ikaro` (or whatever SonarCloud auto-assigns on import — confirm at execution time) |
| `beloauto-*` (Docker container/image/GCP resource prefix) | `ikaro-*` |
| `beloauto` / `beloauto_app` / `beloauto_migrator` (DB name/roles) | `ikaro` / `ikaro_app` / `ikaro_migrator` |
| `beloauto-local` (local GCS/Pub-Sub project id) | `ikaro-local` |
| `beloauto.com` / `beloauto.com.br` (domain) | `<ikaro-domain>` — **real domain not decided yet; use this literal placeholder everywhere and grep for it later** |

### Judgment call — `--ba-` CSS token prefix

`apps/web/lib/hotsite/apply-branding.ts`, `module-styles.ts`, and ~30 production component files emit/consume CSS custom properties prefixed `--ba-` (`--ba-primary`, `--ba-btn-bg`, etc.) for per-tenant branding tokens. It is plausibly short for "BeloAuto," but it is **never documented as such anywhere** (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` just uses it directly) and it is never visible to a user or even a tenant admin — it's an internal CSS variable namespace. The same prefix also appears 82× in `plan/journey/shared/tokens.css` and is referenced by ~50 prototype HTML files.

**Recommendation: leave it alone.** Renaming it touches ~30 production files + the shared prototype token sheet + ~50 mockups for zero externally-visible benefit, and reuses none of the mechanical tooling from the package-scope rename (it's a string inside CSS-in-JS objects and inline `style` attributes, not an import path). If full naming consistency is wanted later, it's a separate, optional follow-up — not a blocker for this TD.

---

## Inventory by Category

Each category below lists the load-bearing files explicitly (so nothing falls through the cracks) plus a `rg` command to regenerate the full current list at execution time, since exact file sets will drift between now and implementation.

### 1. Package & workspace identity (rename — mechanical, load-bearing)

| File | Change |
|---|---|
| `package.json` (root) | `"name": "beloauto"` → `"name": "ikaro"` |
| `apps/backend/package.json` | `"name": "@beloauto/backend"`, `"description": "BeloAuto NestJS modular monolith backend"`, devDep `@beloauto/config` |
| `apps/bff/package.json` | `"name": "@beloauto/bff"`, description, devDep `@beloauto/config`, dep `@beloauto/types` |
| `apps/web/package.json` | `"name": "@beloauto/web"`, description, devDep `@beloauto/config`, dep `@beloauto/types` |
| `packages/types/package.json` | `"name": "@beloauto/types"`, devDep `@beloauto/config` |
| `packages/config/package.json` | `"name": "@beloauto/config"` |
| `pnpm-lock.yaml` | **No manual edit** — regenerate via `pnpm install` after the package.json renames land; the lockfile encodes workspace package names internally |

### 2. Source code import paths (rename — mechanical, large fan-out)

Every file importing `@beloauto/types` (BFF + web, for shared DTOs) needs the import path updated. This is the bulk of the ~170 backend/bff/web file hits.

```bash
rg -l "@beloauto/" apps/ packages/
```

No logic changes — pure import-path substitution. A safe global rename:
```bash
grep -rl "@beloauto/" apps/ packages/ --include="*.ts" --include="*.tsx" -Z | xargs -0 sed -i 's/@beloauto\//@ikaro\//g'
```
Then `pnpm install` to refresh the lockfile, `pnpm -r run type-check` and `pnpm -r run build` to confirm nothing's missed.

### 3. Local dev infrastructure naming (rename)

| File | What changes |
|---|---|
| `docker/docker-compose.yml` | `container_name: beloauto-postgres/-pubsub/-gcs/-mailhog`, `POSTGRES_DB: beloauto`, `--project=beloauto-local` |
| `docker/init-db.sh` | role names `beloauto_migrator` / `beloauto_app`, comments |
| `docker/fake-service-account.json` | `project_id: beloauto-local`, `client_email: fake@beloauto-local...` |
| `apps/backend/.env.example` | `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_MIGRATOR_USER`, `DB_MIGRATOR_PASSWORD`, `PUBSUB_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_PUBLIC_BUCKET_NAME`, `EMAIL_FROM=noreply@beloauto.com.br` (→ placeholder domain) |
| `apps/web/.env.example` | `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` (`.../beloauto-local-public`), `NEXT_PUBLIC_SITE_URL` comment mentioning `beloauto.com` |

### 4. CI/CD & quality tooling (rename — breaks CI if missed)

| File | What changes |
|---|---|
| `.github/workflows/pr-security.yml` | Docker tags `beloauto-${{ matrix.service }}:scan` (build + Trivy scan-ref) |
| `.github/workflows/pr-tests.yml` | `pnpm --filter @beloauto/backend\|bff\|web ...` (5 occurrences) |
| `.github/workflows/pr-quality.yml` | `pnpm --filter @beloauto/...` (3) + **hardcoded SonarCloud API query** `componentKeys=lmmoreira_beloauto` |
| `sonar-project.properties` | `sonar.projectKey=lmmoreira_beloauto` |
| `.gitleaks.toml` | `title = "BeloAuto Gitleaks Config"` (cosmetic only) |
| `scripts/wait-ci.sh` | `REPO="lmmoreira/beloauto"` |
| `scripts/ci-local.sh` | `pnpm --filter @beloauto/...` (3) + Docker tags `beloauto-backend/-bff/-web:scan` (6) |
| `.vscode/settings.json` | `jestrunner.projects[].jestCommand` (2), `coverage-gutters` comment, `sonarlint.connectedMode.connections.sonarcloud[].connectionId: "beloauto-sonarcloud"`, `sonarlint.connectedMode.project.projectKey: "lmmoreira_beloauto"`, quick-start comment commands (3) |

`.vscode/settings.json` also has `"tenantSlug": "lavacar-beloauto"` and JWT tokens with `tenantSlug":"lavacar-beloauto"` baked into the payload — **keep**, that's tenant sample data (see §13).

### 5. Documentation set (rename — large, no functional risk)

| Area | Files | Notes |
|---|---|---|
| `CLAUDE.md` / `.copilot/context.md` (same file, symlinked) | 1 | **Highest priority.** Product name, project facts table, every `gh pr create/checks/merge --repo lmmoreira/beloauto` command in §9 (Steps 8–10), `docs/19/23/24` references. Edit `.copilot/context.md` directly per the file's own permission notice — never write through the `CLAUDE.md`/`gemini.md` symlinks. |
| `gemini.md` | symlink to the same file | No separate edit needed |
| `docs/*.md` | 52 files | Titles ("... - BeloAuto"), prose throughout. `docs/23-INFRASTRUCTURE_SETUP.md` alone carries the bulk of GCP/domain references (~150+ occurrences) — see §11. |
| `plan/M*.md` (milestone specs) | 34 files | Mostly title/header mentions; some embedded `.env`/seed examples |
| `plan/journey/**` (journeys + prototypes) | ~116 files | Mostly `<title>...— BeloAuto</title>` browser-tab titles and `"BeloAuto Demo"` placeholder tenant text in mockups — see §8/§13 split below |
| `plan/README.md` | 1 | No direct hits today, but references the milestone files above |
| `.agents/**` | 11 files | Actively maintained alt multi-agent orchestration docs (last touched M12-S05) — in scope, not archived |
| `docs/archive/**` | ~13 files | **Out of scope** per decision above |

Regenerate the live list at execution time:
```bash
rg -il "beloauto" docs/ plan/ .agents/ CLAUDE.md README.md --hidden -g '!docs/archive'
```

### 6. Platform-level frontend branding (rename — small, customer-visible)

These are the SaaS's *own* fallback/default branding, shown when there's no tenant-specific override — distinct from per-tenant branding (which already comes from `manifest.branding` / tenant settings and needs zero changes):

| File | Line(s) | Current | New |
|---|---|---|---|
| `apps/web/app/layout.tsx` | 5 | `title: 'BeloAuto'` | `title: 'Ikaro'` |
| `apps/web/app/not-found.tsx` | 4, 14–15 | `'Não encontrado — BeloAuto'`, link to `https://beloauto.com`, `"Voltar para o BeloAuto"` | `'Não encontrado — Ikaro'`, link to `<ikaro-domain>`, `"Voltar para o Ikaro"` |
| `apps/web/app/not-found.spec.tsx` | 18, 21, 23, 28 | asserts the strings above | update assertions to match |
| `apps/web/app/[slug]/page.tsx` | 48 | `'Em breve — BeloAuto'` (unpublished-hotsite fallback metadata) | `'Em breve — Ikaro'` |
| `apps/web/app/[slug]/booking/page.tsx` | 21 | same fallback string | same change |
| `apps/web/lib/hotsite/seo.ts` | 49 | `siteName: 'BeloAuto'` (Open Graph fallback) | `siteName: 'Ikaro'` |

### 7. Backend platform-facing copy (rename — customer-visible email text)

| File | What | Change |
|---|---|---|
| `apps/backend/src/contexts/notification/infrastructure/migrations/1748100000010-CreateNotificationTemplates.ts` line 103 | `StaffInvited` email body: `"...na plataforma BeloAuto."` | `"...na plataforma Ikaro."` — this is a live default `NotificationTemplate` row a real staff invite email renders; needs a follow-up migration (default templates are seeded via migration, not safely hand-edited in place once any tenant has run it) — **flag for story-discovery**: likely a new migration that `UPDATE`s the existing row's `body`, not an edit of the historical migration file |
| `apps/backend/src/shared/database/seed.ts` line 333 | ASCII banner `'BeloAuto Seed — Done'` | `'Ikaro Seed — Done'` — cosmetic, no DB impact |

### 8. Seed data — add Ikaro as a tenant, keep BeloAuto as a tenant

Per direction: the platform's own seed data should include **Ikaro itself as a tenant** (e.g. the first/primary sample tenant), with **BeloAuto remaining as a second, distinct sample client** — it stops being *the only* example and becomes *one of two*, which is exactly its correct role going forward.

`apps/backend/src/shared/database/seed.ts` currently seeds two tenants: `Lavacar BeloAuto` (`lavacar-beloauto`) and `AutoSpa Premium` (`autospa-premium`). Adding an `Ikaro` tenant means either inserting a third tenant or repurposing one slot — **this is a content decision, not just a rename, and should go through normal story-discovery** (it touches every fixture that assumes "Tenant A = lavacar-beloauto": `.vscode/settings.json` JWT tokens/IDs, `.http` sample values, integration tests asserting on seeded counts). Treat it as a follow-up story under this TD, not a same-PR mechanical edit — bundling it with the rename risks silently breaking tenant-isolation integration tests that count rows per tenant (see `feedback_integration_test_db_isolation` precedent in this project's history).

### 9. Test fixture defaults using "BeloAuto" generically (optional, low priority)

`apps/backend/src/test/builders/platform/tenant.builder.ts:10` and `tenant-entity.builder.ts:9` default a generic tenant's `name` to `'BeloAuto'` — this isn't tied to the `lavacar-beloauto` seed tenant, it's just filler text for an arbitrary test fixture (same role as "Acme Corp"). Optional cleanup: change the default to `'Ikaro'` or any other neutral name, since it carries no brand meaning either way. Not required for this TD to be considered done.

### 10. Cloud infrastructure documentation (rename — text only, nothing live to migrate)

`docs/23-INFRASTRUCTURE_SETUP.md`, `docs/19-INFRASTRUCTURE_TOOLING_MAP.md`, `docs/12-DEPLOYMENT_STRATEGY.md`, `docs/24-BFF_ARCHITECTURE.md`, `docs/09-CI_CD_PIPELINE.md`, `docs/20-COST_OPTIMIZATION_STRATEGY.md` are full of `beloauto-*` GCP project IDs, service accounts, Cloud Run service names, Pub/Sub topics/subscriptions, GCS buckets, Artifact Registry repo, VPC/connector names, and the `beloauto.com`/`bff.beloauto.com` domain — all under the `beloauto-staging` / `beloauto-prod` GCP projects.

**Good news: none of this is provisioned yet.** M15 (GCP Infrastructure) and M16 (CI/CD Deploy) are both `Local`-phase-incomplete per `plan/README.md` — there is no live Terraform, no real GCP project, no DNS. This category is pure find-and-replace in instructional docs, not an infrastructure migration. Two things to flag for whoever runs M15 later (not blockers for this TD):
- GCP project IDs are globally unique across *all* GCP customers — verify `ikaro-staging` / `ikaro-prod` (or whatever naming M15 lands on) are actually available before provisioning; don't assume it the way the docs currently assume `beloauto-staging`/`beloauto-prod` are free.
- The real production domain is **not decided yet** (per this TD's scope). Use a literal `<ikaro-domain>` placeholder everywhere a domain is referenced (Cloud Run domain mappings, CORS origins, OAuth redirect URIs, `EMAIL_FROM`, `alerts@` address, Search Console verification) so it's trivially greppable when the real domain is chosen.

### 11. .http files (keep — these reference a valid sample tenant)

`.http` files under `apps/backend/http/**` and `apps/bff/http/**` reference `{{tenantId}}`/`{{tenantSlug}}` variables resolved from `.vscode/settings.json`'s `lavacar-beloauto` fixture, or mention `pnpm --filter @beloauto/backend` in setup comments. **Split the same way as everything else:**
- `pnpm --filter @beloauto/backend run migration:run` style comments → rename (package scope)
- Any literal `lavacar-beloauto` / tenant UUID values → keep (sample tenant data)

```bash
rg -n "@beloauto/" apps/backend/http apps/bff/http   # rename these
rg -n "lavacar-beloauto" apps/backend/http apps/bff/http   # keep these
```

### 12. GitHub repository (external system — see migration plan below)

### 13. SonarCloud project (external system — see migration plan below)

---

## Out of scope — explicitly keep as-is

| Example | Why |
|---|---|
| `seed.ts` tenant row `('Lavacar BeloAuto', 'lavacar-beloauto', ...)`, customer `'Cliente BeloAuto'` | Sample tenant/client data |
| `.http` sample tenant slugs/UUIDs | Sample tenant/client data |
| `.vscode/settings.json` `tenantSlug`/JWT payloads | Sample tenant/client data |
| `plan/journey/shared/dashboard-shell.html` `"BeloAuto Demo"` / `"@beloauto"` sidebar placeholder | Mockup's placeholder tenant name — same role as seed data |
| `docs/archive/**` (~13 files) | Frozen, superseded record per explicit decision; CLAUDE.md §10 already excludes it from agent loading |
| `--ba-` CSS custom-property prefix | Judgment call, recommendation: leave (see Decision Framework) |

---

## GitHub Migration Plan

`lmmoreira/ikaro` already exists: created 2026-06-18, default branch `main`, single placeholder commit ("first commit", an 8-byte README), no branch protection, no PRs/issues. Approach: **full history migration**, then archive `lmmoreira/beloauto`.

1. **Pre-migration cleanup (recommended).** `git branch -a --no-merged main` currently lists ~90 branches that look unmerged but are actually stale remnants of squash-merged PRs (the squash-merge commit lands on `main`; the original branch tip is never an ancestor of it). Delete the ones already squash-merged before migrating, so dead branches don't get carried into the new repo:
   ```bash
   gh pr list --repo lmmoreira/beloauto --state merged --json headRefName -q '.[].headRefName'
   # cross-check each against the branch list, then:
   git push origin --delete <branch>   # repeat, or script it
   ```
2. **Add the new remote and push everything:**
   ```bash
   git remote add ikaro https://github.com/lmmoreira/ikaro.git
   git push ikaro --all --force   # force needed: overwrites ikaro's placeholder "first commit" on main
   git push ikaro --tags
   ```
3. **Point `origin` at the new repo** (after confirming the push above succeeded and CI is green on `main` there):
   ```bash
   git remote set-url origin https://github.com/lmmoreira/ikaro.git
   git remote remove ikaro
   ```
4. **Re-create repo settings on `ikaro`** — none of this carries over automatically:
   - Branch protection on `main` (required status checks: the three workflow names from `.github/workflows/pr-quality.yml`, `pr-tests.yml`, `pr-security.yml`; required reviews if any were configured on `beloauto`)
   - Repository secrets: `SONAR_TOKEN`, `SNYK_TOKEN`, and any future GCP service-account key once M15 lands. `GITHUB_TOKEN` is automatic, no action needed.
   - Repo description/topics, default branch confirmation (`main` already set)
5. **Archive `lmmoreira/beloauto`** (Settings → Danger Zone → Archive this repository) once `ikaro` is confirmed green and is the new `origin` everywhere it matters (your local clone, any CI runners, any bookmarks).
6. **Update every hardcoded `--repo lmmoreira/beloauto` reference** in this repo's own tooling — easy to miss because it's "config about the repo" rather than "branding":
   - `CLAUDE.md` §9 Steps 8–10 (`gh pr create`, `gh pr checks`, `gh pr merge` all hardcode `--repo lmmoreira/beloauto`)
   - `scripts/wait-ci.sh:11` (`REPO="lmmoreira/beloauto"`)

## SonarCloud Migration Plan

1. In SonarCloud, "+" → "Analyze new project" → select the `ikaro` repo (now that it's pushed and `origin` points there) → note the auto-assigned project key (almost certainly `lmmoreira_ikaro`, confirm rather than assume).
2. Update `sonar-project.properties` (`sonar.projectKey=...`), `.github/workflows/pr-quality.yml`'s hardcoded issue-search query (`componentKeys=...`), and `.vscode/settings.json`'s `sonarlint.connectedMode` block to the confirmed key.
3. Generate a fresh `SONAR_TOKEN` scoped to the new project; add it as a GitHub Actions secret on `ikaro` (step 4 of the GitHub plan above).
4. Leave the old `lmmoreira_beloauto` SonarCloud project dormant or delete it — no migration of historical issues is needed (clean slate is fine; differential coverage only compares against `main`, which starts fresh anyway).

---

## Execution Phasing

The package-scope rename is load-bearing — every backend/BFF/web file importing `@beloauto/types` breaks the build until the rename completes. This can't be split into independently-mergeable increments without a broken intermediate state. Recommended approach:

**Branch off current `main`** (not on top of the in-flight `feat/TC-00-hotsite-addings`) — call it `chore/TD04-rebrand-ikaro` — so this doesn't tangle with unrelated feature work and doesn't need rebasing through it.

- **Phase A — Mechanical (code + local config), one PR.** Categories 1–4, 6, 7, 9 above: package.json renames, import-path codemod, Docker/env/script/CI naming, frontend fallback branding, the one backend email string. Gate: `pnpm install && pnpm -r run build && pnpm -r run type-check && pnpm -r run lint && pnpm -r run test` all green, plus updated `.spec`/`.spec.tsx` assertions (e.g. `not-found.spec.tsx`).
- **Phase B — Documentation, same PR or an immediate follow-up.** Category 5: `CLAUDE.md`/`.copilot/context.md` (discuss + get explicit sign-off per its own §0 permission gate before writing — this TD does not pre-authorize that edit), `docs/**` (excl. archive), `plan/**`, `.agents/**`. No build impact; can be reviewed on its own merits.
- **Phase C — External systems, manual, after Phase A+B are on `main`.** GitHub migration plan, then SonarCloud migration plan, in that order (SonarCloud needs the GitHub repo to exist with content first).
- **Phase D — Follow-up story.** Category 8 (seed.ts Ikaro-as-tenant restructuring) — separate story-discovery pass, not bundled into the rename PR, because it changes fixture data that other tests assert against.

---

## Verification

After Phase A+B, the only remaining "beloauto" hits should be the explicit keep-list:

```bash
rg -il "beloauto" --hidden -g '!.git' -g '!node_modules' -g '!pnpm-lock.yaml' -g '!docs/archive' .
```

Expected survivors: `seed.ts` (tenant fixture), `.http` files (sample tenant values only — re-check with the §11 split commands), test builders/specs asserting on the `lavacar-beloauto` tenant, `.vscode/settings.json` tenant fixture block, `plan/journey/shared/dashboard-shell.html` demo-tenant placeholder, and the `--ba-` CSS prefix occurrences (if left as decided).

Optional forward-looking guard: add a small script (or a gitleaks custom rule) that fails CI if `beloauto`/`BeloAuto` appears outside an explicit allowlist of paths — prevents the old name quietly creeping back into new docs or code after this TD closes. Not required to close this TD; listed as a nice-to-have in the acceptance criteria.

---

## Effort Estimate

| Area | Files (approx.) | Nature |
|---|---|---|
| Package identity + imports | ~175 (5 package.json + ~170 import sites) | Mechanical, scriptable |
| Local infra / CI / quality tooling | ~12 | Mechanical, manual review (small, high blast-radius if missed) |
| Frontend platform branding | 6 | Small, manual |
| Backend platform copy | 2 | Small, one needs a real migration (not a file edit) |
| Documentation (`CLAUDE.md`, `docs/`, `plan/`, `.agents/`) | ~210 | Large, no functional risk, can be split from Phase A |
| GitHub + SonarCloud migration | — | Manual, external, ~1–2 hours including secret re-provisioning |
| Seed data restructuring (Phase D) | TBD | Separate story-discovery |

Overall: **Medium-Large** — bigger in file count than TD01/TD03 but lower in per-file complexity (mostly search-and-replace, no logic changes). The risk is concentrated in the small Phase A category (package scope + CI), not the large Phase B category (docs).

---

## Acceptance Criteria

- [ ] No `@beloauto/*` package references remain; `pnpm -r run build`, `type-check`, `lint`, `test` all pass under `@ikaro/*`
- [ ] `pnpm-lock.yaml` regenerated and committed
- [ ] All Docker container names, DB name/roles, local GCS/Pub-Sub project ids use `ikaro` naming
- [ ] `sonar-project.properties`, `.gitleaks.toml` title, `.vscode/settings.json` SonarLint block, and `.github/workflows/*` hardcoded names/tags use `ikaro` naming
- [ ] `CLAUDE.md`/`.copilot/context.md` updated (with explicit sign-off per its own permission gate), including the `--repo lmmoreira/beloauto` references in §9
- [ ] `docs/**` (excl. `docs/archive/**`) and `plan/**` and `.agents/**` no longer reference "BeloAuto" as the product/company
- [ ] Frontend platform-level fallback branding (`layout.tsx`, `not-found.tsx` + spec, `[slug]/page.tsx`, `booking/page.tsx`, `seo.ts`) shows "Ikaro"
- [ ] `StaffInvited` email body no longer says "plataforma BeloAuto" (via a new migration updating the existing template row, not an edit to the historical migration file)
- [ ] `lmmoreira/ikaro` holds the full migrated git history; `origin` on local clones points there; `lmmoreira/beloauto` is archived
- [ ] SonarCloud project re-imported under `ikaro`; CI green using the new project key and a freshly-scoped `SONAR_TOKEN`
- [ ] Verification grep (see above) shows only the explicit keep-list as survivors
- [ ] (Optional) CI guard added to prevent regression of the old name
- [ ] Seed-data restructuring (Ikaro as a tenant alongside BeloAuto) tracked as a follow-up story, not bundled here

---

## Open Questions

1. **Production domain.** Not decided. All domain references in this TD use a literal `<ikaro-domain>` placeholder — resolve before Phase C's Cloud Run/DNS work in a future M15, and before finalizing `EMAIL_FROM` / `alerts@` addresses.
2. **`--ba-` CSS prefix.** Recommendation is to leave it; revisit only if full naming consistency becomes a stated goal.
3. **Seed-data shape.** Exact tenant ordering/slugs for "Ikaro as a tenant alongside BeloAuto" needs its own story-discovery pass (Phase D) — this TD only records the requirement, not the final fixture design.
