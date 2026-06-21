# TD07 — `.dockerignore` doesn't exclude nested `apps/*/.env` from the Docker build context

## Status
- **State**: ✅ Done — resolved in PR #24 (`fix/TD07-dockerignore-env-leak`)
- **Type**: Technical Debt / Security
- **Priority**: Medium (real secret-exposure risk, but requires a specific precondition — building from a machine where a real `.env` exists — and today's local `.env` contents are dev-placeholder values, not production secrets)
- **Context**: `.dockerignore`, `apps/backend/Dockerfile`, `apps/bff/Dockerfile`, `apps/web/Dockerfile`
- **Created**: 2026-06-19
- **Updated**: 2026-06-21
- **Resolved**: 2026-06-21

---

## Problem

`.dockerignore` contains:
```
.env*
!.env.example
```
intended to exclude all `.env`-prefixed files from the Docker build context (except the committed `.env.example` template), mirroring `.gitignore`'s recursive matching semantics. In practice, this pattern does **not** exclude nested `apps/backend/.env` / `apps/bff/.env` from the build context — confirmed empirically while resolving TD06:

- `docker build --no-cache -f apps/backend/Dockerfile --target builder .`, then inspecting `/app/apps/backend/.env` inside that intermediate stage, shows the file present — byte-identical to the real, gitignored, locally-present file.
- The file also ends up in `/standalone` (the output of `pnpm --filter @ikaro/backend deploy --prod /standalone --legacy`), and therefore in the **final runtime image** at `/app/.env`.

Any developer machine that has ever set up local dev (creating `apps/backend/.env` / `apps/bff/.env` from the `.env.example` template, per normal onboarding) will silently bake that file's contents into any image built with `docker build` on that machine — including real secrets if the local `.env` was ever populated with anything beyond placeholder values, and including today's local-dev placeholder values (`JWT_SECRET`, `PLATFORM_ADMIN_KEY`, `INTERNAL_API_KEY`, `HOTSITE_REVALIDATE_SECRET`, DB credentials).

Discovered as a side effect of TD06: this `.env` baking is exactly what masked a real bug (`PUBSUB_PROJECT_ID`'s Zod default not reaching `ConfigService`) during local Docker smoke-test verification — the local image booted fine only because the baked-in `.env` happened to supply the missing value, while CI's fresh checkout (no `.env` file at all) correctly failed on the same image build.

## Why this matters

- CI builds are unaffected today — GitHub Actions' `actions/checkout` never has the gitignored `.env` files, so the smoke test (TD06) / Trivy scan / production deploy pipeline is not currently exposed.
- The risk is specifically: anyone manually building and pushing an image from a local machine (a manual hotfix deploy, local registry testing, etc.) would silently ship whatever is in their local `.env` inside the image's layers — retrievable by anyone with pull access, indefinitely. Docker layers aren't "cleaned" of earlier `COPY` content even when a later stage doesn't reference it, and here the final runtime image directly contains the file via `pnpm deploy`'s propagation.
- This is a latent secrets-hygiene gap, not yet exploited, but real and currently unguarded.

## Proposed fix (not yet scoped as a story)

Root-cause the `.dockerignore` pattern-matching gap. Two complementary angles:

1. Confirm/fix the actual `.dockerignore` pattern. BuildKit's pattern matching may need an explicit `**/.env*` (with the `**/` prefix) rather than relying on implicit recursive matching the way `.gitignore` does — verify empirically before assuming a fix works; this exact assumption ("unanchored pattern matches nested paths") is what failed here.
2. Defense in depth regardless of (1): check whether `pnpm deploy --prod`'s packaging rules can be made to never carry dotfiles forward at all (an explicit `.npmignore` or `files` allowlist in each app's `package.json`), independent of what's in the build context.
3. Add a CI check that fails if any `.env` (not `.env.example`) is ever found inside a built image — e.g. extend the boot-smoke-test step (TD06) or the Trivy scan job with `docker run --rm --entrypoint sh <image> -c '! ls /app/.env 2>/dev/null'`.

## Acceptance criteria (when this is picked up)

- [ ] `docker build --no-cache` from a machine with a real `apps/backend/.env` / `apps/bff/.env` present does **not** result in that file existing anywhere in the built image (intermediate or final stage)
- [ ] A CI check actively verifies this (not just "currently unaffected because CI's checkout never has the file") — regression-proof the fix the same way TD06's smoke test was regression-proofed
- [ ] Re-verify `apps/web`'s Dockerfile for the same gap (not implicated/tested this time, but uses the same `.dockerignore`)

## Open Questions

1. Is this purely a `.dockerignore` pattern bug, or does `pnpm deploy --prod`'s packaging logic also need its own dotfile exclusion regardless? Likely both layers need fixing — `.dockerignore` controls the build context sent to the daemon; `pnpm deploy` controls what gets copied into `/standalone` from files already present in the builder stage's filesystem after `COPY`.
