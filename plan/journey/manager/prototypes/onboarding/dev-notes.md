# Dev Notes — MANAGER: Onboarding Preset Wizard

## Overview

New MANAGER-only wizard for M21 — Multi-Vertical Scheduling, Cluster 3. Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/manager-14-onboarding-preset.html` / `manager-14b-onboarding-preset-erro.html`. See `docs/discovery/multivertical-booking/multivertical-booking_ONBOARDING_PRESETS.md` for the full 7-preset taxonomy and `docs/02-DOMAIN_MODEL.md` for the underlying domain model this wizard configures.

## File map (❓ none exist yet)

Moved to the end of M24 on 2026-10-10 (previously M23-S10/S15): backend + BFF = `M24-S21` (Presets A/B/C/G) and `M24-S05` (SESSION presets D/E/F); this wizard = `M24-S22`, all seven presets. Specs: `plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md`.

| File | Status |
|---|---|
| `apps/web/app/dashboard/onboarding/page.tsx` | ❓ Gap (M24-S22) |
| `apps/web/features/booking/components/dashboard/onboarding/*` | ❓ Gap (M24-S22) |
| `apps/backend/http/booking/onboarding.http` | ❓ Gap (M24-S21) |

## BFF call (endpoint not yet implemented — contract per `docs/14-API_CONTRACTS.md`)

```
POST /v1/onboarding/bootstrap
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Body: { presetId: string, answers: Record<string, unknown> }   -- per-preset minimum-answer shape,
                                                                     see ONBOARDING_PRESETS.md §4 per preset
  Response 201: { tenantId, presetId, serviceIds: string[], resourceIds: string[] }   -- editable review
  Response 422: validation error naming the invalid minimum answer
```

Whole bootstrap rolls back atomically on any mid-transaction failure (UC-075 A3) — no partially-configured tenant is ever published.

## Screen: OnboardingPresetWizard (`/dashboard/onboarding`, UC-075)

**File:** `01-onboarding-preset.html` (prototype) — 3-step flow: preset choice (7 cards) → minimum questions for the chosen preset → review in business language before confirming. Worked example shown is Preset D (Estúdio de turmas).

**Preset taxonomy (7 presets → 13 underlying scheduling models — see `ONBOARDING_PRESETS.md`):**

| Preset | Models | Cluster availability |
|---|---|---|
| A — Auto/Estética | 1 | M24-S21 |
| B — Salão/Barbearia | 2 or 3 + 9 | M24-S21 |
| C — Clínica/Consultório | 2 + 9 | M24-S21 |
| G — Sala/Coworking/Locação por Tempo | 4, 7, 9 + variable duration | M24-S21 |
| D — Estúdio de Turmas | 5 + 10 + 11 | M24-S05 (needs `ClassScheduleTemplate`) |
| E — Box/Academia | 5 + 6 + 10 | M24-S05 |
| F — Estúdio Misto | 2 + 5 + 13 | M24-S05 (mixed preset) |

**Important for the implementing story:** the prototype's own worked example (Preset D) is a SESSION preset — genuinely not actionable until Cluster 4 ships `ClassScheduleTemplate` (UC-075 step 4). This cluster delivers Presets A/B/C/G. Build/verify the story against an appointment-only preset (e.g. re-derive Preset A's own review-step content from `ONBOARDING_PRESETS.md` §4), not by assuming the prototype's own example is representative of what ships now.

## Known limitations

- No `index.html` existed in the discovery folder for these 2 screens — added as part of this promotion.
- Final preset names/copy are explicitly deferred to a copy round (`ONBOARDING_PRESETS.md` §6 item 4) — not a product/schema blocker.

## Open questions / gaps

- [ ] Stories exist (M24-S21, M24-S05, M24-S22) — each needs `/story-discovery` first.
- [ ] The worked example needs to be re-targeted to an appointment-only preset before this is implementation-ready (see table above).
