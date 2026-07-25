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

## Approved solution — same-origin BFF gateway

Do not try to transfer a session cookie, JWT, or encrypted handoff token
between browser origins. Instead, expose the BFF to the browser through the
web application's own origin under a stable path prefix:

```text
Browser -> https://<web-origin>/v1/* -> same-origin gateway -> BFF
Browser -> https://<web-origin>/*    -> web application
```

The BFF and web remain separate services and may keep unrelated deployment
hostnames in staging. The gateway forwards requests server-to-server; from the
browser's perspective, both the OAuth endpoints and all authenticated BFF API
calls are on the web origin.

The BFF's Google callback must therefore be configured as
`https://<web-origin>/v1/auth/google/callback`. The gateway must forward the
OAuth start, callback, and all `/v1/*` requests transparently, including
`Cookie`, `Set-Cookie`, redirect, query-string, and response-header handling.

The BFF continues to issue the session cookie, but the browser receives it on
the web origin through the gateway. Make it host-only and use the strongest
compatible cookie shape:

```text
__Host-access_token; Secure; HttpOnly; SameSite=Lax; Path=/
```

It must have no `Domain` attribute. This works for both unrelated staging
hosts and production, keeps the cookie scoped to exactly one host, and allows
the `__Host-` prefix. Browser-side BFF transport must use the relative `/v1`
base path, never the BFF's deployment URL, so every dashboard request follows
the same-origin route and carries the cookie.

### Deployment evolution

The intended long-term gateway is edge/load-balancer path routing: `/v1/*` to
the BFF backend and every other path to web. The current production
`modules/edge` implementation is host-routed and staging deliberately has no
edge module, so TD35 may first provide the same route through one centralized
web-side reverse proxy. That is an application-level gateway, not a per-feature
proxy collection. When edge routing becomes available, move the identical
public `/v1` contract there without changing browser clients or cookie scope.

### Explicitly rejected alternatives

- `Domain=.ikaro.online` fixes neither staging nor the general architecture;
  it also broadens session-cookie exposure to every subdomain under that apex.
- A stateless JWE handoff is a short-lived replayable bearer credential, not a
  one-time code, and only fixes the login redirect while direct browser-to-BFF
  requests remain cross-origin.
- A database-backed opaque code plus PKCE is a sound fallback only if a
  same-origin gateway is impossible. It adds durable redemption state and
  front-channel complexity that the gateway avoids.

## Implementation scope and acceptance criteria

- [ ] Add one centralized same-origin `/v1/*` gateway; do not create a
      feature-specific proxy per BFF endpoint.
- [ ] Route Google OAuth start and callback through the gateway; update every
      environment's callback URL and browser-facing BFF base-path configuration.
- [ ] Preserve cookies, redirects, query strings, and relevant response headers
      without exposing the session token to client JavaScript or a URL.
- [ ] Issue only a host-only `__Host-access_token` cookie with `Secure`,
      `HttpOnly`, `SameSite=Lax`, and `Path=/`; no `Domain` attribute.
- [ ] Make browser-side authenticated BFF calls use same-origin `/v1`; retain a
      separate server-to-server BFF URL for Server Components and Route Handlers
      where needed.
- [ ] Verify login and an authenticated browser API request with genuinely
      distinct BFF and web origins, so local `localhost` port-sharing cannot
      mask a regression.
- [ ] Preserve `tenantSlug` when `apps/web/middleware.ts` redirects an
      unauthenticated `/dashboard/**` request to `/dashboard/login`.
- [ ] Update `plan/M17-CLOUD-DEPLOY.md` and any deployment/runbook references
      that still describe cross-subdomain cookie sharing as the authentication
      design.
- [ ] Run `/story-discovery TD35` before code is written, per the
      non-negotiable Story/TD gate.
