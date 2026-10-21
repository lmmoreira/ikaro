# Dev Notes — GUEST: Responder à Solicitação de Informação

## Overview

✅ Fully shipped (`M13-S38`/`S39`/`S40`). Standalone public page (`/bookings/[id]/submit-info`) that allows a guest (or authenticated customer via a separate path in the Minha Conta journey) to respond to an admin's info request.

## File map (all ✅ shipped)

| File | Status |
|---|---|
| `apps/web/app/bookings/[id]/submit-info/page.tsx` | ✅ Exists |
| `apps/web/features/booking/components/public/SubmitInfoForm.tsx` | ✅ Exists |
| `apps/web/features/booking/components/public/InvalidLinkView.tsx` | ✅ Exists |
| `apps/web/features/booking/components/public/SubmitInfoSuccessView.tsx` | ✅ Exists — success card (screen 01f) rendered by `SubmitInfoForm` |
| `send-booking-info-requested-notification.use-case.ts` (`buildRespondLink()`) | ✅ Updated — emits `/submit-info` (guests only; a customer is linked to `/{slug}/my-account/bookings/{id}`), not `/responder` |

The backend rename described below already shipped in the same story as the frontend page.

## Screen 01 — Formulário de resposta (`SubmitInfoPage` / `SubmitInfoForm`)

**File:** `apps/web/app/bookings/[id]/submit-info/page.tsx` (✅ Exists)

**Route:** `/bookings/[id]/submit-info?token=<JWT>`

**Routing note:** `bookings/` is a static Next.js segment — takes priority over the top-level `[slug]/` dynamic segment. No conflict.

**Page type:** Server component — decodes and verifies token server-side. Renders error state if invalid.

**Token validation (server-side):**
```ts
// page.tsx — verifyGuestToken / decodeUnverifiedTenantSlug from '@/features/booking/model/guest-token'
const payload = token ? verifyGuestToken(token) : null;
const brandingSlug = payload?.tenantSlug ?? (token ? decodeUnverifiedTenantSlug(token) : null);
// no payload / payload.bookingId !== params.id -> render 01b-invalid-link state
```

**BFF call to pre-fill booking summary:**
```
GET /v1/bookings/:id/guest?token=<JWT>
  (shipped in M13-S39 — `bookings-guest.controller.ts`; fetched by `fetchGuestBookingSummary()` in `features/booking/api/public.server.ts`)
```

**Form component props:**
```ts
interface SubmitInfoFormProps {
  readonly bookingId: string;
  readonly token: string;
  readonly summary: SubmitInfoFormSummary | null;
  readonly brandName?: string;
  readonly brandingStyle?: React.CSSProperties;
  readonly locale?: string;
  readonly timezone?: string;
  readonly timeFormat?: TimeFormat;
  readonly tenantSlug?: string;
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
| `photoUrls[]` | optional; each matches the BFF regex `/^tmp\/[^/]+\/[^/]+\/.+$/` (`bookings.schemas.ts`) | (validated BFF-side only) |

**States:**
- `idle` → form shown, button enabled
- `submitting` → button disabled, spinner inline
- `success` → replace form with success banner (same page, no navigation)
- `error` → show red alert above button, preserve form values, show retry button
- `invalid-link` → show error state (rendered by server component before form mounts)

**Error messages (pt-BR):**
- Network/5xx: "Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente." See `01e-submit-error.html`.
- Token invalid/expired/mismatched at submit (code `GUEST_TOKEN_INVALID`, `GUEST_TOKEN_MISSING` or `GUEST_TOKEN_BOOKING_MISMATCH` — `EXPIRED_LINK_CODES` in `SubmitInfoForm.tsx`): the form enters `error` with `kind: 'expired'`; the message comes from `resolveErrorMessage(code)` (not a bespoke "Seu link expirou…" string) and the retry button is replaced by an `<a href="?">` CTA labelled `t('tokenExpiredCta')` ("Voltar", pt-BR `web.json`) — retrying with an already-invalid token would just fail again. There is no `?error=expired` redirect. No separate prototype screen was built for this variant; it is documented inline as a comment in `01e-submit-error.html`.

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
2. `verifyGuestToken()` returns null (bad signature/expired) → invalid
3. `payload.bookingId !== params.id` → invalid (token reuse attempt)
4. Fetch the guest booking summary (always attempted, `fetchGuestBookingSummary()`); `GUEST_BOOKING_NOT_AWAITING_INFO` (booking no longer `INFO_REQUESTED`) → `InvalidLinkView reason="processed"` (i18n key `processedMessage`, "Este agendamento já foi processado."; no prototype screen draws it). Any other failure degrades to rendering the form without a summary card.

## Screen 01f — Sucesso

**Rendered by:** `SubmitInfoSuccessView`, which `SubmitInfoForm` swaps in for the form in-place after a 200 OK.

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
