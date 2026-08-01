# Dev Notes — GUEST: Responder à Solicitação de Informação

## Overview

✅ Fully shipped (`M13-S38`/`S39`/`S40`). Standalone public page (`/bookings/[id]/submit-info`) that allows a guest (or authenticated customer via a separate path in the Minha Conta journey) to respond to an admin's info request.

## File map (all ✅ shipped)

| File | Status |
|---|---|
| `apps/web/app/bookings/[id]/submit-info/page.tsx` | ✅ Exists |
| `apps/web/features/booking/components/public/SubmitInfoForm.tsx` | ✅ Exists |
| `apps/web/features/booking/components/public/InvalidLinkView.tsx` | ✅ Exists |
| `send-booking-info-requested-notification.use-case.ts` (`buildRespondLink()`) | ✅ Updated — emits `/submit-info`, not `/responder` |

The backend rename described below already shipped in the same story as the frontend page.

## Screen 01 — Formulário de resposta (`SubmitInfoPage` / `SubmitInfoForm`)

**File:** `apps/web/app/bookings/[id]/submit-info/page.tsx` (✅ Exists)

**Route:** `/bookings/[id]/submit-info?token=<JWT>`

**Routing note:** `bookings/` is a static Next.js segment — takes priority over the top-level `[slug]/` dynamic segment. No conflict.

**Page type:** Server component — decodes and verifies token server-side. Renders error state if invalid.

**Token validation (server-side):**
```ts
import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET!;
try {
  const payload = jwt.verify(token, secret) as { bookingId: string; tenantId: string; contactEmail: string };
  // validate payload.bookingId === params.id
} catch {
  // render 01b-invalid-link state
}
```

**BFF call to pre-fill booking summary:**
```
GET /v1/bookings/:id/guest?token=<JWT>
  (specified in M13-S39 — optional; M13-S40 can ship without it)
```
*Fallback if `M13-S39` hasn't shipped:* render the form without booking summary (just "Booking ID: …"). The submission itself still works.

**Form component props:**
```ts
interface SubmitInfoFormProps {
  readonly bookingId: string;
  readonly token: string;
  readonly bookingSummary: {
    readonly serviceName: string;
    readonly scheduledAt: string;
    readonly contactName: string;
  } | null;
  readonly infoRequestMessage: string;
}
```

**BFF call (submission):**
```
PATCH /v1/bookings/:id/submit-info/guest?token=<JWT>
  Body: { response: string, photoUrls?: string[] }
  Response: { bookingId: string, status: "PENDING", infoSubmittedAt: string }
  No X-Tenant-Slug header required — TenantGuard bypassed by @Public()
```

**Validation:**
| Field | Rule | Error message (pt-BR) |
|---|---|---|
| `response` | `min(1)` after trim | "Informe sua resposta antes de enviar." |
| `photoUrls[]` | optional; each matches `tenants/*/uploads|bookings/*/**` pattern | (validated BFF-side only) |

**States:**
- `idle` → form shown, button enabled
- `submitting` → button disabled, spinner inline
- `success` → replace form with success banner (same page, no navigation)
- `error` → show red alert above button, preserve form values, show retry button
- `invalid-link` → show error state (rendered by server component before form mounts)

**Error messages (pt-BR):**
- Network/5xx: "Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente." See `01e-submit-error.html`.
- Token expired (detected client-side after 401 from PATCH): same `error` state as above, but swap copy to "Seu link expirou enquanto você preenchia o formulário..." and replace the retry button with a link to the invalid-link state (retrying with an already-expired token would just 401 again) — redirect to `?error=expired` to show the 01b-equivalent messaging. No separate prototype screen was built for this; the variant is documented inline as a comment in `01e-submit-error.html` since it reuses the same layout as the network/5xx error, just with different copy and CTA target.

## Photo upload flow (✅ shipped, different design than originally proposed)

No dedicated `POST /v1/bookings/:id/presigned-url/guest` endpoint was created. Instead the existing
`POST /bookings/attachments/signed-url` route gained a `guestToken`+`bookingId` branch
(`createGuestAttachmentSignedUrl()` in `apps/web/features/booking/api/public.ts`), reusing the same
upload endpoint the authenticated flow uses.

## Screen 01b — Link inválido (`SubmitInfoPage` error state)

**Rendered by:** same `page.tsx` when token is missing/invalid/expired or booking is no longer `INFO_REQUESTED`.

Shows: reason list + "Ir para o site" CTA + "Entrar / Criar conta" link.

**Detection order:**
1. No `token` query param → invalid
2. `jwt.verify()` throws → invalid
3. `payload.bookingId !== params.id` → invalid (token reuse attempt)
4. Optional: fetch booking status; if not `INFO_REQUESTED` → show "já respondido ou processado" variant

## Screen 02 — Sucesso

**Rendered by:** `SubmitInfoForm` component after 200 OK replaces the form in-place.

Shows: green check icon + "Resposta enviada!" + booking summary card + "Ir para o site" + "Criar conta / Entrar" CTA.

**"Criar conta" CTA reasoning:** Guest completing this flow has shown intent to engage — this is the lowest-friction moment to invite them into the authenticated experience. Keep it subtle (secondary link, not a button).

## Known limitations (all resolved — kept for history)

- ~~No branding per tenant~~ — **Resolved.** The page applies the tenant's real branding via `fetchManifestSafely` + `applyBranding()`.
- ~~Booking summary endpoint for guests~~ — **Resolved.** `GET /v1/bookings/:id/guest` exists and is used via `fetchGuestBookingSummary()`.
- ~~Photo upload unconfirmed~~ — **Resolved**, via the `guestToken`+`bookingId` branch on the existing signed-url endpoint (see Photo upload flow above).

## Mobile notes

- Single-column layout, max-width 560px centered
- Textarea min-height 7rem; user can expand
- Submit button full-width at bottom
- No auth bar, no nav, no bottom-tab — this is a standalone page
