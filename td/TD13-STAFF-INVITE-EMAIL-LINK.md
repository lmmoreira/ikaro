# TD13 — Staff invite email `activationLink` points to a non-existent Next.js route

## Status
- **Type**: Technical Debt / Broken end-to-end flow
- **State**: ✅ Done — resolved in PR #93 (`feat/m13-s33-invite-form`)
- **Priority**: Low (downgraded from Medium — see Update below; the broken link is no longer the only way to complete first login)
- **Context**: `apps/backend/src/contexts/notification/application/use-cases/send-staff-invitation/send-staff-invitation.use-case.ts:79`
- **Created**: 2026-06-24 (surfaced during M13-S13 real OAuth login testing)
- **Update (2026-06-25, M13-S14 follow-up)**: the underlying gap this link existed to work around is now closed a different way. `handleStaffLogin` (the generic `/dashboard/login` → "Entrar com Google" path, with no `tenantSlug`) now falls back to matching by Google's verified email across all tenants whenever the OAuth-ID lookup finds nothing, links the account, and proceeds — see `apps/bff/src/auth/auth.controller.ts`'s `linkStaffByVerifiedEmail`. A never-linked invited staff member can now just use the normal staff login button; the invite email's link is no longer the only path to first login. Fixing the link itself (Option A/B below) is still worth doing for UX polish, but is no longer blocking.
- **Resolved (2026-07-06, M13-S33 branch)**: `activationLink` now points to `/dashboard/login?tenantSlug=<slug>` — a third variant not listed in the original Fix options below. It lands on a real page (no more 404) with a working "Entrar com Google" button for that tenant, at the cost of one extra click versus Option A/B's direct-to-OAuth redirect. Chosen over A/B for simplicity — no new route, no `BFF_URL` needed in `apps/backend/.env`.

---

## Problem

`send-staff-invitation.use-case.ts` constructs the invite email link as:

```typescript
const activationLink = `${this.config.getOrThrow<string>('FRONTEND_URL')}/${tenant.slug}/auth/staff`;
```

This points to `/${slug}/auth/staff` — a Next.js route that **does not exist**. Clicking the link in the invite email returns a 404.

The correct URL for the staff first-login flow (UC-025) is the BFF OAuth endpoint:
```
${BFF_URL}/auth/google?type=staff&tenantSlug=<slug>
```

The BFF `GoogleAuthGuard` reads `?type=staff` and `?tenantSlug=<slug>` to encode `__staff__:<slug>` into the OAuth state, then `handleStaffFirstLogin` finds the staff by email + tenant and links their `google_oauth_id`. See `docs/ENGINEERING_RULES.md § Staff OAuth login URL format` for the full URL reference.

---

## Fix options

**Option A (simplest) — point the email link directly at the BFF:**
Change `send-staff-invitation.use-case.ts` to use `BFF_URL` instead of `FRONTEND_URL`:
```typescript
const activationLink = `${this.config.getOrThrow<string>('BFF_URL')}/auth/google?type=staff&tenantSlug=${tenant.slug}`;
```
Requires adding `BFF_URL` to `apps/backend/.env`. Simpler but couples the backend notification to the BFF URL.

**Option B (cleaner) — create a Next.js redirect page:**
Create `apps/web/app/[slug]/auth/staff/page.tsx` as a server component that immediately redirects to the BFF OAuth URL:
```typescript
import { redirect } from 'next/navigation';
export default async function StaffAuthPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/google?type=staff&tenantSlug=${slug}`);
}
```
The email link stays on the frontend domain (cleaner for end-users), and the frontend owns the redirect. This is the recommended approach.

---

## Workaround (until fixed)

Staff can still accept an invite by visiting the BFF URL directly:
```
http://localhost:3002/v1/auth/google?type=staff&tenantSlug=<slug>
```
Or by logging in normally from `/dashboard/login` if their `google_oauth_id` has already been linked.
