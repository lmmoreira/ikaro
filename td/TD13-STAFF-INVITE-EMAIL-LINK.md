# TD13 — Staff invite email `activationLink` points to a non-existent Next.js route

## Status
- **Type**: Technical Debt / Broken end-to-end flow
- **Priority**: Medium (staff provisioning and invite emails work; only the invite-link click is broken — staff can still log in via the direct BFF URL as a workaround)
- **Context**: `apps/backend/src/contexts/notification/application/use-cases/send-staff-invitation/send-staff-invitation.use-case.ts:79`
- **Created**: 2026-06-24 (surfaced during M13-S13 real OAuth login testing)

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
