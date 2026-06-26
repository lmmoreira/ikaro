# TD15 — Next.js middleware trusts unverified JWT claims

## Status
- **Type**: Security / Defense-in-Depth
- **Priority**: Medium (security impact mitigated by BFF auth; no data exposure today)
- **Context**: `apps/web/middleware.ts`, `apps/web/lib/auth/decode-jwt.ts`
- **Created**: 2026-06-26 (surfaced by CodeRabbit on PR #51)

---

## Problem

`middleware.ts` runs on the Next.js Edge Runtime and guards the `/dashboard` route tree by decoding the `access_token` cookie and reading its `role` and `exp` claims:

```typescript
function decodeJwtClaims(token: string): { role?: string; exp?: number } {
  const payload = token.split('.')[1];
  // base64url decode only — no signature verification
  return JSON.parse(atob(padded));
}
```

Because the signature is never verified, any client that can set `document.cookie` (or send a raw request) can craft an `access_token` with `{"role":"MANAGER","exp":<future>}` and a dummy signature. The middleware will pass it through, granting access to the dashboard shell without a real login.

**Current impact is limited** because:
1. Every BFF call made by the dashboard pages uses `BackendHttpService`, which forwards the cookie. The BFF's `JwtStrategy` (NestJS Passport) **does** verify the HS256 signature using `JWT_SECRET`. A forged cookie returns 401 from the BFF on every data request.
2. The dashboard shell itself contains no sensitive data — pages are empty without BFF data.

The gap is defense-in-depth: a forged cookie lets an attacker see the dashboard HTML frame but not any real tenant data.

---

## Why it is not trivially fixed

The Next.js Edge Runtime is a restricted environment — it runs on V8 Isolates and does not include Node.js built-ins (`node:crypto`, `jsonwebtoken`, `@nestjs/jwt`). Verifying an HS256 JWT requires:

1. Using the **Web Crypto API** (`SubtleCrypto.importKey` + `SubtleCrypto.verify`), which is available in Edge but requires `async` middleware and careful key encoding.
2. Or switching to an RS256/ES256 asymmetric scheme so the public key can be embedded in the Edge bundle without exposing `JWT_SECRET`.

Option 1 is straightforward but requires pulling `JWT_SECRET` into the Edge bundle via `process.env.JWT_SECRET` and using `TextEncoder` / `crypto.subtle`. The `jose` library (Edge-compatible) would make this clean.

---

## Fix

Add `jose` (already Edge-compatible, zero Node.js deps) to `apps/web`:

```ts
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function isValidStaffToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== 'STAFF' && payload.role !== 'MANAGER') return false;
    return true; // jwtVerify already checks exp
  } catch {
    return false;
  }
}
```

`middleware.ts` becomes `async` (Next.js supports async middleware). `JWT_SECRET` must be exposed to the Edge bundle via `next.config.ts`'s `env` or as `NEXT_PUBLIC_` — keep it server-only via `env` (not `NEXT_PUBLIC_`).

## Workaround (current behaviour, acceptable for MVP)

BFF JWT verification is the real auth boundary. The middleware is a UX guard (redirect to login) rather than a security gate. Acceptable until traffic or threat model grows.
