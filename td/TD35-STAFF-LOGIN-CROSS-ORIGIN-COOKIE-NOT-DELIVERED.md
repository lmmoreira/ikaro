# TD35 — Staff Login: Cross-Origin Session Cookie Never Reaches the Web App

## Status

Open. Found via live staging debugging (2026-07-25) while provisioning a new
tenant end-to-end through the relay VM's `POST /internal/tenants` and then
attempting the resulting staff invite login.

## Symptom

A staff member completes Google OAuth successfully — `staff.google_oauth_id`
is correctly written to the database (`LinkGoogleAccountUseCase` runs) — but
the browser ends up back on a bare `/dashboard/login` (no `tenantSlug` query
param), showing the "please access via your company's site" fallback
copy instead of a working dashboard session.

## Root cause

1. `apps/bff/src/features/auth/cookie-options.ts` sets `JWT_COOKIE_OPTIONS`
   with `httpOnly`, `secure`, `sameSite: 'lax'`, `maxAge`, `path` — **no
   `domain` attribute**. Without an explicit `domain`, a cookie is host-only:
   scoped strictly to whichever hostname issued it.
2. `apps/bff/src/features/auth/auth-controller-flow.service.ts:357-358` sets
   `access_token` on the BFF's own response, then immediately issues a plain
   302 redirect to the web app's origin: `res.redirect(`${frontendUrl}/dashboard`)`.
   No token is carried in the URL — the cookie is the only thing meant to
   carry the session forward.
3. BFF and web are different origins in every environment:
   - Staging: unrelated `*.run.app` hash hostnames (`ikaro-bff-...` vs
     `ikaro-web-...`), no shared parent domain at all.
   - Prod: `bff.ikaro.online` vs `ikaro.online` — same apex, different
     subdomains.

A host-only cookie set on one origin is never sent by the browser to a
different origin, regardless of `SameSite`. `SameSite=Lax` only governs
whether an *already in-scope* cookie is sent on a cross-site-initiated
request — it does not extend a cookie's scope to a different host.
Cross-subdomain sharing requires an explicit `Domain=.ikaro.online` (or
equivalent) attribute on the `Set-Cookie` header itself, which is not
present anywhere in this codebase.

`plan/M17-CLOUD-DEPLOY.md:957` documents the (incorrect) assumption behind
this gap: *"BFF cookie on `bff.ikaro.online` is same-site for XHR from
`ikaro.online` → `SameSite=Lax` works; no cookie-domain change expected."*
This conflates same-site cross-request sending with cross-subdomain cookie
*scope* — two independent cookie mechanisms.

## Blast radius

Every staff login, for every tenant, in every environment as currently
deployed — this is not specific to the newly provisioned tenant that
surfaced it. Prod is affected too: even though `ikaro.online` and
`bff.ikaro.online` share an apex domain, the missing `Domain` attribute
means the cookie still never crosses from one subdomain to the other.

## Secondary defect (same login path, worth fixing together)

`apps/web/middleware.ts:107-114` redirects an unauthenticated `/dashboard/**`
request to a bare `/dashboard/login` with no `tenantSlug` — losing the
tenant context entirely instead of preserving it, which produces the
confusing "please access via your company's site" fallback rather than a
tenant-scoped retry.

## Suggested direction (not yet implemented/approved)

- Set an explicit `domain` on `JWT_COOKIE_OPTIONS` scoped to the shared apex
  in environments that have one (prod: `.ikaro.online`).
- For environments with no shared apex at all (staging's raw `*.run.app`
  hostnames), a `Domain` attribute cannot help — the redirect-based
  cookie handoff needs a different mechanism entirely (e.g. a one-time
  token in the redirect URL that the web app exchanges for its own
  same-origin cookie, or fronting both services behind one shared host via
  `modules/edge`-style routing, as prod's D11 design already intends but
  staging currently lacks).
- Preserve `tenantSlug` on the `middleware.ts:111` unauthenticated redirect.
- Needs `/story-discovery` before any code is written, per this repo's
  non-negotiable Story/TD gate.
