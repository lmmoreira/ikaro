# TD02 — Localization: Full Multi-Country Support

**Status:** Open  
**Priority:** High — blocks any non-BR tenant onboarding  
**Effort estimate:** Large (10 stories across 5 waves)  
**Affects:** `apps/backend/`, `apps/bff/`, `apps/web/`, `packages/i18n/` (new), `packages/types/`  
**Initial locales:** `pt-BR` (Brazil) · `en` (United States)  
**Last updated:** 2026-06-19

---

## Problem

The codebase was built with pt-BR / Brazil as the only target. Localization concerns are scattered across every layer with no shared abstraction:

- **54 individual hardcoded sites** identified across backend, BFF, web, and packages.
- **P0 breaks** (rejects valid non-BR input at the API boundary): Brazil-only address validation, BRL-literal Money type, Brazilian phone format.
- **P1 wrong output**: all email notifications, date/time display, and currency formatting show pt-BR / R$ regardless of tenant settings.
- **P2 copy**: ~40 web components with hardcoded Portuguese strings; no i18n infrastructure.
- **Localization config exists but drives nothing**: `currency`, `language`, `decimal_places`, `currency_symbol` are stored in tenant settings but no formatter reads them.

---

## Architecture Decisions

### 1. `country_code` as the primary locale signal

`LocalizationSettings` gains a `country_code: string` field (ISO 3166-1 alpha-2).  
A shared `CountrySpec` registry maps every country code to its complete locale defaults.  
All other fields (`currency`, `language`) become **optional overrides** on top of those defaults.  
Adding a new country = one new entry in the registry. No schema migration, no code change.

### 2. `CountrySpec` registry — single source of truth for all locale defaults

Lives in `packages/i18n/src/country-defaults.ts`. Imported by backend, seeds, and web.

```ts
export interface CountrySpec {
  currency: string;              // ISO 4217
  language: string;              // BCP-47
  phonePrefix: string;           // E.164 country prefix (e.g. '+55')
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  timeFormat: '24h' | '12h';
  numberFormat: '1.234,56' | '1,234.56';
  firstDayOfWeek: 0 | 1;        // 0 = Sunday, 1 = Monday
  address: {
    // Country-specific terms — do NOT put these in i18n files (see split rule below)
    postalLabel: string;         // 'CEP', 'ZIP Code', 'Postcode' — country term, not translated
    postalPlaceholder: string;   // '00000-000', '90210', 'SW1A 1AA'
    postalRegex: RegExp | null;  // validation logic — code, never JSON
    stateLabel: string;          // 'UF', 'State', 'County' — country term, not translated
    stateMaxLen: number | null;  // null = unconstrained
    requireNeighborhood: boolean;
    neighborhoodLabel: string | null; // 'Bairro' — country term, null if concept doesn't exist
    lookupService: 'viacep' | 'none';
  };
}

// Registry vs. i18n split rule:
// - CountrySpec holds data that varies by COUNTRY (postal system name, validation rules,
//   phone prefix, currency code). A BR tenant showing UI in English still uses 'CEP',
//   not 'Postal Code' — because CEP is the name of Brazil's postal system, not a translation.
// - i18n locale files hold data that varies by LANGUAGE (generic field labels like "Street",
//   help text, error messages, button copy). 'streetLabel', 'cityLabel', 'searching',
//   'notFound' all go in web.json — they translate, but they don't vary by country.
// - Regex stays in code (never JSON) — no type safety, serialization risk.
```

**BR entry:**
```ts
BR: {
  currency: 'BRL', language: 'pt-BR', phonePrefix: '+55',
  dateFormat: 'DD/MM/YYYY', timeFormat: '24h',
  numberFormat: '1.234,56', firstDayOfWeek: 0,
  address: {
    postalLabel: 'CEP', postalPlaceholder: '00000-000', postalRegex: /^\d{8}$/,
    stateLabel: 'UF', stateMaxLen: 2,
    requireNeighborhood: true, neighborhoodLabel: 'Bairro',
    lookupService: 'viacep',
  },
}
```

**US entry:**
```ts
US: {
  currency: 'USD', language: 'en', phonePrefix: '+1',
  dateFormat: 'MM/DD/YYYY', timeFormat: '12h',
  numberFormat: '1,234.56', firstDayOfWeek: 0,
  address: {
    postalLabel: 'ZIP Code', postalPlaceholder: '90210', postalRegex: /^\d{5}(-\d{4})?$/,
    stateLabel: 'State', stateMaxLen: 2,
    requireNeighborhood: false, neighborhoodLabel: null,
    lookupService: 'none',
  },
}
```

**FALLBACK (unknown country):**
```ts
{
  currency: 'USD', language: 'en', phonePrefix: '+1',
  dateFormat: 'DD/MM/YYYY', timeFormat: '24h',
  numberFormat: '1,234.56', firstDayOfWeek: 1,
  address: {
    postalLabel: 'Postal Code', postalPlaceholder: '', postalRegex: null,
    stateLabel: 'State/Province', stateMaxLen: null,
    requireNeighborhood: false, neighborhoodLabel: null,
    lookupService: 'none',
  },
}
```

Export: `export function countrySpec(code: string): CountrySpec`

### 3. Money VO — currency from tenant settings, not hardcoded

`currency: 'BRL'` literal type removed from `Money` VO and `packages/types/src/money.ts`.  
`Money.from(amount, currency)` receives currency from `tenant.localization.effectiveCurrency`.  
`Money.format(locale, currency)` uses `Intl.NumberFormat(locale, { style: 'currency', currency })`.  
No new DB column — currency is always read from the tenant at reconstitution time.

### 4. PhoneNumber VO — E.164 international standard

`PhoneNumber.isValid()` validates E.164 format: `+` followed by 7–15 digits.  
`PhoneNumber.format()` returns the E.164 string as-is (no country-specific display formatting).  
The web UI shows a country-code prefix (`+55`, `+1`, etc.) from `manifest.localization.phonePrefix` derived from `countrySpec(country_code).phonePrefix`.

### 5. Address validation — `countrySpec`-driven

`Address` VO reads rules from `countrySpec(country_code)`:
- `postalRegex` — `null` means accept any string
- `requireNeighborhood` — conditional validation
- `stateMaxLen` — `null` means unconstrained

Web `AddressFields.tsx` reads `manifest.localization.address` for labels and lookup service toggle.

### 6. Web i18n — `next-intl`, tenant-driven locale, no URL prefix

`next-intl` installed in `apps/web`.  
No URL locale prefix (`/pt-BR/slug` not needed — tenant slug already identifies context).  
Locale resolved from `manifest.localization.language` at SSR time.  
Translation files in `packages/i18n/locales/{locale}/web.json`.

---

## Updated `LocalizationSettings` Shape

```ts
// In tenant-settings.vo.ts
interface LocalizationSettings {
  country_code: string;       // required — ISO 3166-1 alpha-2, key into CountrySpec
  currency?: string;          // override (default: countrySpec(country_code).currency)
  language?: string;          // override (default: countrySpec(country_code).language)
  decimal_places?: number;    // override for non-standard currencies (JPY=0, KWD=3); default 2
  // currency_symbol removed — derived from Intl.NumberFormat at render time
}

// Resolved/effective settings — what all formatters actually use
interface ResolvedLocalization {
  language: string;
  currency: string;
  decimalPlaces: number;
  phonePrefix: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  numberFormat: string;
  firstDayOfWeek: 0 | 1;
  address: CountrySpec['address'];
}
```

`TenantSettings.resolveLocalization()` merges `countrySpec(country_code)` with stored overrides.

---

## `packages/i18n` Package Structure

```
packages/i18n/
├── package.json                          # name: @ikaro/i18n
├── src/
│   ├── country-defaults.ts               # CountrySpec registry — BR + US + FALLBACK
│   ├── index.ts                          # re-exports
│   └── types.ts                          # CountrySpec, LocaleKey types
└── locales/
    ├── pt-BR/
    │   ├── web.json                       # all web UI strings
    │   ├── notifications.json             # email subject + body per trigger_event × recipient
    │   └── email-tables.json              # admin schedule table column headers
    └── en/
        ├── web.json
        ├── notifications.json
        └── email-tables.json
```

### Registry vs. i18n split — quick reference

| What | Where | Why |
|---|---|---|
| `postalLabel` (`'CEP'`, `'ZIP Code'`) | Registry | Country term — `'CEP'` is correct even for a BR tenant in English |
| `postalPlaceholder` (`'00000-000'`) | Registry | Country-specific format example |
| `postalRegex` | Registry | Validation logic — never put regex in JSON |
| `stateLabel` (`'UF'`, `'State'`) | Registry | Country term |
| `neighborhoodLabel` (`'Bairro'`) | Registry | Country-specific concept name |
| `streetLabel` (`'Rua'` / `'Street'`) | i18n | Translates by language, same across countries |
| `numberLabel`, `complementLabel`, `cityLabel` | i18n | Same — language-varies, country-stable |
| `address.searching`, `address.notFound` | i18n | User-facing message — language-specific |
| Error messages, button copy, help text | i18n | Always language-specific |

---

### `locales/pt-BR/web.json` (full key spec)

```json
{
  "common": {
    "back": "Voltar",
    "next": "Próximo",
    "confirm": "Confirmar",
    "cancel": "Cancelar",
    "loading": "Carregando...",
    "save": "Salvar"
  },
  "auth": {
    "signIn": "Entrar",
    "signOut": "Sair",
    "signInWith": "Entrar com {provider}",
    "signInError": "Erro ao entrar. Tente novamente.",
    "pageTitle": "Entrar — {name}"
  },
  "booking": {
    "title": "Agendar serviço",
    "serviceSelection": {
      "title": "Escolha os serviços",
      "pickupAddressPrompt": "Informe o endereço de coleta...",
      "singular": "serviço",
      "plural": "serviços"
    },
    "slotPicker": {
      "loading": "Carregando horários...",
      "noSlots": "Nenhum horário disponível"
    },
    "availability": {
      "loadError": "Não foi possível carregar a disponibilidade",
      "loading": "Carregando disponibilidade...",
      "previousDays": "Dias anteriores",
      "nextDays": "Próximos dias",
      "noSlots": "Nenhum horário disponível nos próximos dias"
    },
    "personalInfo": {
      "nameLabel": "Nome",
      "emailLabel": "E-mail",
      "phoneLabel": "Telefone",
      "addressLabel": "Endereço de contato (opcional)",
      "nameRequired": "Informe seu nome.",
      "emailRequired": "Informe um e-mail válido.",
      "phoneRequired": "Informe seu telefone."
    },
    "address": {
      "searching": "Buscando endereço...",
      "notFound": "CEP não encontrado. Preencha o endereço manualmente.",
      "streetLabel": "Rua",
      "numberLabel": "Número",
      "complementLabel": "Complemento",
      "cityLabel": "Cidade"
    },
    "confirmation": {
      "backToSite": "Voltar para o site",
      "sending": "Enviando...",
      "submit": "Confirmar agendamento"
    },
    "summary": {
      "serviceSingular": "Serviço",
      "servicePlural": "Serviços"
    },
    "photo": {
      "unsupportedFormat": "Formato de imagem não suportado",
      "uploadFailed": "Falha ao enviar a imagem",
      "uploading": "Enviando...",
      "uploadError": "Erro ao enviar",
      "title": "Fotos do veículo (opcional)",
      "clickToAdd": "Clique para adicionar fotos"
    },
    "errors": {
      "submitFailed": "Não foi possível enviar o agendamento. Tente novamente.",
      "slotUnavailable": "Horário indisponível, escolha outro"
    }
  },
  "hotsite": {
    "services": {
      "defaultTitle": "Nossos Serviços",
      "pointsSuffix": "+{count} pontos",
      "empty": "Nenhum serviço disponível no momento"
    },
    "gallery": {
      "defaultTitle": "Nossos Resultados",
      "showMore": "Ver mais",
      "photoAlt": "Foto do serviço",
      "beforeLabel": "Antes",
      "afterLabel": "Depois"
    },
    "testimonials": {
      "defaultTitle": "O que nossos clientes dizem",
      "previousAriaLabel": "Depoimento anterior",
      "nextAriaLabel": "Próximo depoimento"
    },
    "contact": { "phoneLabel": "Telefone" },
    "unavailable": { "label": "Em breve" }
  },
  "notFound": {
    "title": "Não encontrado",
    "tenantNotFound": "Tenant não encontrado",
    "tenantNotFoundDescription": "O tenant que você está procurando não existe ou foi removido.",
    "backToHome": "Voltar para o Ikaro"
  },
  "seo": {
    "defaultSubtitle": "Agendamento Online",
    "defaultDescription": "Agende seu serviço de forma rápida, fácil e online."
  },
  "errors": {
    "internalServerError": "Erro interno do servidor"
  }
}
```

### `locales/en/web.json` (full key spec)

```json
{
  "common": {
    "back": "Back",
    "next": "Next",
    "confirm": "Confirm",
    "cancel": "Cancel",
    "loading": "Loading...",
    "save": "Save"
  },
  "auth": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "signInWith": "Sign in with {provider}",
    "signInError": "Sign-in failed. Please try again.",
    "pageTitle": "Sign in — {name}"
  },
  "booking": {
    "title": "Book a service",
    "serviceSelection": {
      "title": "Choose services",
      "pickupAddressPrompt": "Enter pickup address...",
      "singular": "service",
      "plural": "services"
    },
    "slotPicker": {
      "loading": "Loading time slots...",
      "noSlots": "No time slots available"
    },
    "availability": {
      "loadError": "Could not load availability",
      "loading": "Loading availability...",
      "previousDays": "Previous days",
      "nextDays": "Next days",
      "noSlots": "No time slots available in the coming days"
    },
    "personalInfo": {
      "nameLabel": "Name",
      "emailLabel": "Email",
      "phoneLabel": "Phone",
      "addressLabel": "Contact address (optional)",
      "nameRequired": "Please enter your name.",
      "emailRequired": "Please enter a valid email.",
      "phoneRequired": "Please enter your phone number."
    },
    "address": {
      "searching": "Looking up address...",
      "notFound": "Address not found. Please fill in manually.",
      "streetLabel": "Street",
      "numberLabel": "Number",
      "complementLabel": "Apt / Suite",
      "cityLabel": "City"
    },
    "confirmation": {
      "backToSite": "Back to website",
      "sending": "Sending...",
      "submit": "Confirm booking"
    },
    "summary": {
      "serviceSingular": "Service",
      "servicePlural": "Services"
    },
    "photo": {
      "unsupportedFormat": "Unsupported image format",
      "uploadFailed": "Failed to upload image",
      "uploading": "Uploading...",
      "uploadError": "Upload error",
      "title": "Vehicle photos (optional)",
      "clickToAdd": "Click to add photos"
    },
    "errors": {
      "submitFailed": "Could not submit booking. Please try again.",
      "slotUnavailable": "This time slot is no longer available, please choose another"
    }
  },
  "hotsite": {
    "services": {
      "defaultTitle": "Our Services",
      "pointsSuffix": "+{count} points",
      "empty": "No services available at the moment"
    },
    "gallery": {
      "defaultTitle": "Our Results",
      "showMore": "Show more",
      "photoAlt": "Service photo",
      "beforeLabel": "Before",
      "afterLabel": "After"
    },
    "testimonials": {
      "defaultTitle": "What our clients say",
      "previousAriaLabel": "Previous testimonial",
      "nextAriaLabel": "Next testimonial"
    },
    "contact": { "phoneLabel": "Phone" },
    "unavailable": { "label": "Coming soon" }
  },
  "notFound": {
    "title": "Not found",
    "tenantNotFound": "Tenant not found",
    "tenantNotFoundDescription": "The tenant you are looking for does not exist or has been removed.",
    "backToHome": "Back to Ikaro"
  },
  "seo": {
    "defaultSubtitle": "Online Booking",
    "defaultDescription": "Book your service quickly, easily, and online."
  },
  "errors": {
    "internalServerError": "Internal server error"
  }
}
```

### `locales/pt-BR/notifications.json` (subjects; bodies follow existing migration HTML structure)

```json
{
  "BookingRequested": {
    "admin":    { "subject": "Novo agendamento recebido" },
    "customer": { "subject": "Solicitação de agendamento recebida" }
  },
  "BookingApproved":      { "customer": { "subject": "Seu agendamento foi confirmado!" } },
  "BookingRejected":      { "customer": { "subject": "Seu agendamento foi rejeitado" } },
  "BookingInfoRequested": { "customer": { "subject": "Precisamos de mais informações sobre seu agendamento" } },
  "BookingInfoSubmitted": { "admin":    { "subject": "Cliente respondeu à solicitação de informações" } },
  "BookingCancelled": {
    "customer": { "subject": "Seu agendamento foi cancelado" },
    "admin":    { "subject": "Agendamento cancelado" }
  },
  "BookingRescheduled": {
    "customer": { "subject": "Seu agendamento foi reagendado" },
    "admin":    { "subject": "Agendamento reagendado" }
  },
  "BookingReminderDue":        { "customer": { "subject": "Lembrete: seu agendamento é amanhã!" } },
  "BookingReminderDueToday":   { "customer": { "subject": "Lembrete: seu agendamento é hoje!" } },
  "AdminDailyScheduleReminder":{ "admin":    { "subject": "Agenda do dia" } },
  "ServicePointsEarned":       { "customer": { "subject": "Você ganhou pontos de fidelidade!" } },
  "PointsExpiringSoon":        { "customer": { "subject": "Seus pontos estão prestes a expirar" } },
  "StaffInvited":              { "staff":    { "subject": "Convite para equipe Ikaro" } }
}
```

### `locales/en/notifications.json`

```json
{
  "BookingRequested": {
    "admin":    { "subject": "New booking received" },
    "customer": { "subject": "Booking request received" }
  },
  "BookingApproved":      { "customer": { "subject": "Your booking is confirmed!" } },
  "BookingRejected":      { "customer": { "subject": "Your booking was not accepted" } },
  "BookingInfoRequested": { "customer": { "subject": "We need more information about your booking" } },
  "BookingInfoSubmitted": { "admin":    { "subject": "Customer responded to the information request" } },
  "BookingCancelled": {
    "customer": { "subject": "Your booking has been cancelled" },
    "admin":    { "subject": "Booking cancelled" }
  },
  "BookingRescheduled": {
    "customer": { "subject": "Your booking has been rescheduled" },
    "admin":    { "subject": "Booking rescheduled" }
  },
  "BookingReminderDue":        { "customer": { "subject": "Reminder: your booking is tomorrow!" } },
  "BookingReminderDueToday":   { "customer": { "subject": "Reminder: your booking is today!" } },
  "AdminDailyScheduleReminder":{ "admin":    { "subject": "Today's schedule" } },
  "ServicePointsEarned":       { "customer": { "subject": "You earned loyalty points!" } },
  "PointsExpiringSoon":        { "customer": { "subject": "Your points are about to expire" } },
  "StaffInvited":              { "staff":    { "subject": "Invitation to join Ikaro" } }
}
```

### `locales/{locale}/email-tables.json`

```json
// pt-BR
{ "adminDailySchedule": { "time": "Horário", "customer": "Cliente", "phone": "Telefone", "services": "Serviços", "duration": "Duração", "notes": "Notas" } }

// en
{ "adminDailySchedule": { "time": "Time", "customer": "Customer", "phone": "Phone", "services": "Services", "duration": "Duration", "notes": "Notes" } }
```

---

## `HotsiteLocalizationResponse` — Expanded

```ts
// packages/types/src/hotsite.ts
interface HotsiteLocalizationResponse {
  language: string;      // BCP-47 — existing field
  currency: string;      // ISO 4217 — NEW
  phonePrefix: string;   // e.g. '+55' — NEW
  dateFormat: string;    // 'DD/MM/YYYY' | 'MM/DD/YYYY' — NEW
  timeFormat: '24h' | '12h';  // NEW
  numberFormat: string;  // '1.234,56' | '1,234.56' — NEW
  firstDayOfWeek: 0 | 1; // NEW
  address: {             // NEW
    postalLabel: string;
    stateLabel: string;
    requireNeighborhood: boolean;
    neighborhoodLabel: string | null;
    lookupService: 'viacep' | 'none';
  };
}
```

The BFF's `get-hotsite-manifest` use-case populates this from `TenantSettings.resolveLocalization()`.  
The web reads it once at SSR and passes it to `LocaleProvider` and formatting utilities.

---

## Story Map

### Wave 1 — Foundation (P0 blockers — implement first, in order)

---

#### TD02-S01 — `LocalizationSettings` expansion + `CountrySpec` registry ✅ Done

**Scope:**
- Create `packages/i18n/` package (`package.json`, `tsconfig.json`, `src/country-defaults.ts`, `src/index.ts`)
- Implement `CountrySpec` interface + `countrySpec()` function with BR, US, and FALLBACK entries
- Add `country_code: string` to `LocalizationSettings` in `tenant-settings.vo.ts`
- Add `resolveLocalization(): ResolvedLocalization` method to `TenantSettings`
- Remove `currency_symbol` from the stored struct (derived at render time); keep as optional override for tenants that need it
- Add `country_code` to `LocalizationSchema` Zod DTO in `update-tenant-settings.dto.ts`
- Add `country_code` to `provision-tenant.dto.ts` (required)
- Add migration: `ALTER TABLE tenants ADD COLUMN country_code VARCHAR(2) NOT NULL DEFAULT 'BR'`
- Update seed: explicit `country_code: 'BR'` in `shared/database/seed.ts`
- Replace all `?? 'America/Sao_Paulo'` fallbacks (8 files) with `TenantSettings.default().business_hours.timezone`
- Expand `HotsiteLocalizationResponse` in `packages/types/src/hotsite.ts` (all new fields)
- Add `localization` to `TenantSettings` in `packages/types/src/tenant.dto.ts`
- Update `get-hotsite-manifest.use-case.ts` to populate the expanded response from `resolveLocalization()`

**Key files:**
`packages/i18n/src/country-defaults.ts` (new) · `tenant-settings.vo.ts` · `update-tenant-settings.dto.ts` · `provision-tenant.dto.ts` · `get-hotsite-manifest.use-case.ts` · `packages/types/src/hotsite.ts` · `packages/types/src/tenant.dto.ts` · migration (new) · `seed.ts`

**Acceptance criteria:**
- [ ] `countrySpec('BR')` returns full BR spec; `countrySpec('US')` returns full US spec; unknown code returns FALLBACK
- [ ] `TenantSettings.resolveLocalization()` merges spec defaults with stored overrides
- [ ] `POST /internal/tenants` requires `country_code`; defaults to `'BR'` on existing rows via migration
- [ ] `GET /hotsite/:slug/manifest` response includes all new localization fields
- [ ] All `'America/Sao_Paulo'` string literals removed from non-VO source files
- [ ] Unit tests for `countrySpec()` and `resolveLocalization()`

**Implementation:** Shipped as planned (PR #14, 53 files, 1376 unit + 331 integration + 225 BFF component tests). Two deviations from scope: the `?? 'America/Sao_Paulo'` fallbacks were replaced with `?? 'UTC'` rather than `TenantSettings.default().business_hours.timezone`; and `country_code` backfilled into the existing `settings` JSONB column via migration rather than a new top-level `tenants.country_code` column.

---

#### TD02-S02 — `Money` VO multi-currency ✅ Done

**Scope:**
- Change `currency: 'BRL'` literal to `currency: string` in `apps/backend/src/shared/value-objects/money.ts`
- Change `currency: 'BRL'` literal to `currency: string` in `packages/types/src/money.ts`
- Update `Money.from(amount: string, currency: string)` — remove default parameter
- Update `Money.format(locale: string, currency: string): string` — use `Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: decimalPlaces })`
- Add `ITenantLocalizationPort` to booking application ports: `getCurrency(tenantId): Promise<string>`
- Inject port into `CreateServiceUseCase` and `UpdateServiceUseCase`; replace `Money.from(amount, 'BRL')` with `Money.from(amount, await this.localizationPort.getCurrency(tenantId))`
- Update `TypeOrmServiceRepository.toDomain()` and `TypeOrmBookingRepository.toDomain()` (5 call sites): inject `ITenantLocalizationPort` and resolve currency at reconstitution
- Update `money-format.ts` signature to `formatMoney(amount: Decimal, locale: string, currency: string, decimalPlaces = 2): string`
- Update all callers of `money-format.ts` to pass locale + currency from tenant `resolveLocalization()`

**Key files:**
`shared/value-objects/money.ts` · `packages/types/src/money.ts` · `booking/application/ports/` (new port) · `create-service.use-case.ts` · `update-service.use-case.ts` · `typeorm-service.repository.ts` · `typeorm-booking.repository.ts` · `shared/utils/money-format.ts`

**Acceptance criteria:**
- [ ] `Money.from('100', 'USD')` compiles and is valid
- [ ] `Money.format('en', 'USD')` returns `'$100.00'`; `Money.format('pt-BR', 'BRL')` returns `'R$ 100,00'`
- [ ] `TypeScript` strict: no `'BRL'` literal type anywhere outside locale files
- [ ] All existing money-related unit tests pass; new tests for USD formatting

**Implementation:** Shipped as planned (PR #15, 48 files, 1378 unit + 331 integration + 225 BFF tests). Added `ITenantLocalizationPort` + `BookingTenantLocalizationAdapter` (booking→platform cross-context port — the first instance of what later turned out to be a duplicated-adapter pattern, addressed in S04's PR). Wired into 6 use-cases (`CreateService`, `UpdateService`, `CompleteBooking`, `GetBooking`, `ListBookings`, `ListServices`) plus both `TypeOrmServiceRepository`/`TypeOrmBookingRepository`. One incidental fix: `ServiceController`'s integration spec had to start provisioning real tenants via `POST /internal/tenants`, since currency resolution now does a real tenant lookup instead of assuming `'BRL'`.

---

#### TD02-S03 — `PhoneNumber` VO → E.164 ✅ Done

**Scope:**
- Rewrite `phone-number.vo.ts`: `isValid()` accepts E.164 (`/^\+[1-9]\d{6,14}$/`); `format()` returns E.164 as-is
- Update `customer.aggregate.ts` domain error message (remove "Brazilian")
- Remove `formatPhoneBR()` from `apps/web/lib/utils.ts`; replace callers with raw E.164 display or a new locale-aware `formatPhone(e164: string, spec: CountrySpec): string` util in `packages/i18n`
- Update web `PersonalInfoStep.tsx`: phone input stores E.164; country-code prefix span reads `manifest.localization.phonePrefix` instead of hardcoded `+55`; placeholder updated to locale-appropriate example
- Update all DTO validators that accept phone: ensure they pass the stored E.164 value through without re-validating format (VO already validated at write time)

**Key files:**
`shared/value-objects/phone-number.vo.ts` · `customer/domain/customer.aggregate.ts` · `apps/web/lib/utils.ts` · `apps/web/components/booking/PersonalInfoStep.tsx` · `packages/i18n/src/index.ts`

**Acceptance criteria:**
- [ ] `PhoneNumber.isValid('+5511912345678')` → `true`
- [ ] `PhoneNumber.isValid('+14155552671')` → `true` (US)
- [ ] `PhoneNumber.isValid('11912345678')` → `false` (missing `+`)
- [ ] Domain error no longer mentions "Brazilian"
- [ ] Web phone input prefix is dynamic from manifest

**Implementation:** Shipped as planned (PR #16, 42 files, 1381 unit + 332 integration + 225 BFF tests). The 3 Zod phone validators (backend `request-booking.dto.ts`; BFF `bookings.controller.ts`/`customers.controller.ts`) were relaxed to an E.164-shaped regex rather than a bare `.min(1)` — kept format-boundary validation at the DTO layer so malformed input still 400s instead of leaking through to a domain-layer 500 (the same lesson later generalized for addresses in S04). ~30 test/builder/seed files needed fixing since their bare BR phone literals (e.g. `'11912345678'`) failed the new stricter E.164 validation at runtime. Manually verified in a real browser session against the seeded dev DB.

---

#### TD02-S04 — Address validation → `countrySpec`-driven ✅ Done

**Scope:**
- Update `Address` VO (`apps/backend/src/shared/value-objects/address.ts`):
  - `validate(props, spec: CountrySpec['address'])` — uses `spec.postalRegex` (null = skip), `spec.requireNeighborhood`, `spec.stateMaxLen` (null = skip)
  - `format(spec)` — generic format without hardcoded BR conventions
  - Error message: remove "Invalid CEP" → "Invalid postal code"
- Update all DTOs that contain address fields to remove hardcoded regexes (5 backend DTOs + 2 BFF validators):
  - `request-booking.dto.ts`, `request-authenticated-booking.dto.ts`, `update-customer-profile.dto.ts` — `zip_code: z.string().min(1).max(20)`, `neighborhood: z.string().optional()`
  - `update-tenant-settings.dto.ts` — `BusinessInfoAddressSchema`: same relaxation
  - `apps/bff/src/bookings/bookings.controller.ts`, `apps/bff/src/customers/customers.controller.ts` — remove CEP regex
- Make `neighborhood` optional in `packages/types/src/address.ts` and `packages/types/src/hotsite.ts` (`HotsiteBusinessInfoAddress`)
- Update `apps/web/components/booking/AddressFields.tsx`:
  - Accept `addressSpec: CountrySpec['address']` prop from parent (passed from manifest)
  - Labels from `addressSpec.postalLabel`, `addressSpec.stateLabel`, `addressSpec.neighborhoodLabel`
  - ViaCEP lookup only when `addressSpec.lookupService === 'viacep'`
  - Postal format validation against `addressSpec.postalRegex`
  - Neighborhood field only renders when `addressSpec.requireNeighborhood`

**Key files:**
`shared/value-objects/address.ts` · `request-booking.dto.ts` · `request-authenticated-booking.dto.ts` · `update-customer-profile.dto.ts` · `update-tenant-settings.dto.ts` · `apps/bff/src/bookings/bookings.controller.ts` · `apps/bff/src/customers/customers.controller.ts` · `packages/types/src/address.ts` · `packages/types/src/hotsite.ts` · `apps/web/components/booking/AddressFields.tsx`

**Acceptance criteria:**
- [ ] `POST /v1/tenants/:id/settings` with US address (`zip_code: '90210'`, `state: 'CA'`, no `neighborhood`) → 200
- [ ] `POST /v1/tenants/:id/settings` with BR address (`zip_code: '01310100'`, `neighborhood: 'Bela Vista'`) → 200
- [ ] Web address form shows "ZIP Code" / no Bairro field for US tenants; "CEP" / Bairro for BR
- [ ] ViaCEP lookup only fires for BR tenants
- [ ] Tenant-isolation test for address update

**Implementation:** The `Address` VO work itself shipped as planned (countrySpec-driven validation, optional `neighborhood`, no more digit-stripping that would corrupt non-BR formats). Scope grew substantially mid-PR: fixing this story's bot-review comments surfaced `ITenantLocalizationPort` (booking, from S02) duplicating the already-existing `IBookingPlatformPort` — pulling that thread revealed 4 separate cross-context adapters each independently re-fetching a slice of the same `tenants.settings` row across 28 call sites. With explicit sign-off, the same PR absorbed three further phases: (1) renamed `TenantContext`→`RequestContext` (it already carried actor info beyond "tenant"); (2) eager-loaded tenant settings into `RequestContext` once per request via a new `ITenantSettingsPort`, replacing N adapters each re-querying the same row; (3) deleted Customer's port+adapter entirely, shrank Booking's from 5 methods to 1 (`findAllActive()`, still needed by 2 cron jobs). Mid-implementation, discovered `TypeOrmBookingRepository`/`TypeOrmServiceRepository` are called from 3 invocation contexts (HTTP, cron jobs, event handlers) but only HTTP populates `RequestContext` — reverted both repos to stay `tenantId`-parameterized via the port instead of reading ambient context. Both lessons (eager-load-over-duplicate-adapters; never read `RequestContext` from shared infrastructure) are now documented in `docs/ENGINEERING_RULES.md`/`docs/ANTI_PATTERNS.md`. Merged via PR #17 — 195 files total, 3 bot-review rounds (Copilot ×2, CodeRabbit ×1) triaged and fixed, SonarCloud Quality Gate passed clean.

---

### Wave 2 — i18n Infrastructure

---

#### TD02-S05 — `packages/i18n` locale files + backend `ILocalizationPort` ✅ Done

**Scope:**
- Create `packages/i18n/locales/pt-BR/web.json` — full key set from spec above
- Create `packages/i18n/locales/en/web.json` — full key set from spec above
- Create `packages/i18n/locales/pt-BR/notifications.json` — all subjects from spec above + HTML bodies (ported from existing migration SQL)
- Create `packages/i18n/locales/en/notifications.json` — all subjects + translated HTML bodies
- Create `packages/i18n/locales/pt-BR/email-tables.json` and `en/email-tables.json`
- Create `ILocalizationPort` in `apps/backend/src/contexts/notification/application/ports/`
- Create `JsonLocalizationAdapter` in notification infrastructure — reads locale files at startup, implements `ILocalizationPort`
- Register adapter in `NotificationModule`

**Key files:**
`packages/i18n/locales/**` (all new) · `notification/application/ports/localization.port.ts` (new — named to match the codebase's existing `<concept>.port.ts` convention, not the literal `i-localization.port.ts` filename above) · `notification/infrastructure/adapters/json-localization.adapter.ts` (new) · `notification/notification.module.ts`

**Acceptance criteria:**
- [ ] `JsonLocalizationAdapter.getNotificationTemplate('BookingApproved', 'customer', 'pt-BR')` returns correct subject
- [ ] `JsonLocalizationAdapter.getNotificationTemplate('BookingApproved', 'customer', 'en')` returns English subject
- [ ] Unknown locale falls back to `'pt-BR'`
- [ ] Unit tests for adapter

**Known gap — intentionally deferred to S10:** the existing `notification_templates` DB table (seeded via the `CreateNotificationTemplates` migration, copied per-tenant at provisioning) is what every `Send*NotificationUseCase` actually uses today, via `INotificationTemplateRepository`. That path is **not locale-aware** — it always renders pt-BR content regardless of `tenant.settings.localization.language`, which is TD02's P1 bug. `JsonLocalizationAdapter` is registered in `NotificationModule` but nothing calls it yet; this story does not fix that bug, only lays the groundwork. The two content sources also have minor subject-wording differences for `BookingRejected`, `AdminDailyScheduleReminder`, `ServicePointsEarned`, and `PointsExpiringSoon` — reconcile them when S10 rewires the 13 use-cases to `ILocalizationPort` and retires the DB-seeded approach.

**Implementation:** Shipped as planned — 6 locale JSON files (`web`/`notifications`/`email-tables` × `pt-BR`/`en`), `ILocalizationPort` + `JsonLocalizationAdapter`. The adapter reads both locales' JSON once at construction via `require.resolve('@ikaro/i18n/package.json')` + `fs.readFileSync`, since `locales/` sits outside `packages/i18n`'s `tsc` build scope — documented as a reusable pattern in `docs/ENGINEERING_RULES.md` for S10's benefit. One naming deviation from this story's own spec: the port file is `localization.port.ts`, not the literal `i-localization.port.ts` named above — no existing port in this codebase uses an `i-` prefix, so it follows the established `<concept>.port.ts` convention instead. Post-review, Copilot flagged 2 diagnosability gaps (file read/parse errors lacked path context; missing-template errors reported the originally-requested locale instead of the one actually resolved after fallback) — both fixed. Merged via PR #18 — 1404 unit + 332 integration + 225 BFF tests, SonarCloud Quality Gate passed clean.

---

#### TD02-S06 — `next-intl` setup in `apps/web` ✅ Done

**Scope:**
- Install `next-intl` in `apps/web`
- Configure `next-intl` without URL prefix routing: `i18n/request.ts` resolves locale from `manifest.localization.language` stored in a RSC-accessible source (tenant manifest fetched in layout)
- Create `LocaleProvider` wrapping the `[slug]/layout.tsx` — passes resolved messages to `next-intl`'s `NextIntlClientProvider`
- `apps/web/next.config.ts` — add `next-intl` plugin; do NOT add `i18n.locales` (no URL routing)
- Create `getMessages(locale: string)` helper that loads `packages/i18n/locales/{locale}/web.json`
- Update root `app/layout.tsx`: `lang` attribute reads from tenant manifest; fallback `'pt-BR'`
- Vitest: add `next-intl` mock as needed; existing component tests must still pass

**Key files:**
`apps/web/package.json` · `apps/web/next.config.ts` · `apps/web/i18n/request.ts` (new) · `apps/web/app/[slug]/layout.tsx` · `apps/web/app/layout.tsx` · `apps/web/lib/i18n/get-messages.ts` (new)

**Acceptance criteria:**
- [ ] `useTranslations('booking')` available in any component under `[slug]/`
- [ ] Locale resolves from manifest with `'pt-BR'` fallback
- [ ] `lang` attribute on `<html>` is dynamic
- [ ] Existing Vitest component tests unaffected

**Implementation:** Shipped with several deviations from spec, all intentional. (1) `next.config.mjs` → `next.config.ts` migration included — the spec correctly named `.ts`; the `.mjs` file was the inconsistency. (2) `<html lang>` dynamism achieved via middleware: `middleware.ts` extended to set `x-pathname` header on all non-API/non-static routes; `i18n/request.ts` reads it, extracts the slug, fetches the manifest locale — Next.js fetch deduplication means zero extra HTTP calls vs the slug layout's own `fetchManifest()` call. (3) `LocaleProvider` kept as a minimal `NextIntlClientProvider` wrapper (separate from `FormattingProvider`, which arrived in S07). (4) `resolveSupportedLocale()` exported from `get-messages.ts` and used at every call site to prevent locale/messages mismatch when a tenant has an unsupported `language` value. (5) `lib/i18n/resolve-locale.ts` guards against empty `NEXT_PUBLIC_BFF_URL` and path-traversal slugs. (6) `@ikaro/i18n` added to `apps/web` dependencies; `packages/i18n/package.json` gained `exports` field so webpack/Vite can import `./locales/*` directly. (7) Pre-existing `pnpm-workspace.yaml` placeholder for `@parcel/watcher` build approval was unset — fixed as part of this PR. Post-review: Copilot flagged middleware running on `/api/*` (fixed; matcher now excludes `api`) and missing BFF URL guard (fixed). CodeRabbit flagged locale/messages mismatch, path-traversal, explicit return types, `afterEach` env cleanup — all fixed. SonarCloud S4043 (`.filter()[0]` → `.find()`): fixed. Merged via PR #19 — 465 web unit + 332 backend integration + 225 BFF component tests, SonarCloud Quality Gate passed clean.

---

### Wave 3 — Formatters Wired End-to-End

---

#### TD02-S07 — Locale-aware money + date + time formatting in `apps/web` ✅ Done

**Scope:**
- Update `apps/web/lib/hotsite/format-money.ts`: `formatMoney(amount: number, locale: string, currency: string): string` using `Intl.NumberFormat(locale, { style: 'currency', currency })`; remove module-level instance
- Update `apps/web/lib/booking/format-time.ts`: `formatTime(date: Date, locale: string, timezone: string, format: '24h' | '12h'): string` and `formatDate(date: Date, locale: string, timezone: string, dateFormat: string): string`; remove module-level `Intl` instances
- Create `FormattingContext` React context (`apps/web/lib/formatting/formatting-context.ts`) carrying `ResolvedLocalization` fields; provided by `LocaleProvider` from manifest
- Create `useFormatting()` hook returning `{ formatMoney, formatDate, formatTime }` bound to tenant locale
- Update all components that call `formatBRL()` / `formatDateBR()` / `formatDateLongBR()` to use `useFormatting()` instead
- Update backend `money-format.ts` and `send-admin-daily-schedule-reminder` use-case to use `ILocalizationPort.getTableHeaders()` from TD02-S05

**Key files:**
`apps/web/lib/hotsite/format-money.ts` · `apps/web/lib/booking/format-time.ts` · `apps/web/lib/formatting/formatting-context.ts` (new) · `apps/web/lib/formatting/use-formatting.ts` (new) · `apps/backend/src/shared/utils/money-format.ts` · `send-admin-daily-schedule-reminder-notification.use-case.ts`

**Acceptance criteria:**
- [ ] `formatMoney(100, 'pt-BR', 'BRL')` → `'R$ 100,00'`
- [ ] `formatMoney(100, 'en', 'USD')` → `'$100.00'`
- [ ] `formatDate` uses tenant timezone and date format (not hardcoded `America/Sao_Paulo`)
- [ ] Admin schedule email headers come from locale file, not inline TS string

**E2E gap — deferred to S09:** S07 has full unit and integration coverage. However, the localization stack (currency display, date formats, phone prefix, address fields, `<html lang>`) has **zero Playwright E2E coverage**. The existing `e2e/guest-booking.spec.ts` tests a BR-only happy path and makes no locale assertions. Full E2E coverage is deferred to TD02-S09 — see that story's acceptance criteria for the required test scenarios and the US tenant Playwright seed that must be in place.

**Implementation:** Scope extended beyond spec in two ways. (1) `timezone` added to `HotsiteLocalizationResponse` (packages/types), `HotsiteLocalization` (get-hotsite-manifest use-case), and `mapLocalization()` (reads from `tenant.settings.business_hours.timezone`) — not in original spec but required for `formatTime` to work correctly; without it `FormattingContext` had no timezone source. (2) `email-tables.json` gained an `emptyState` key (pt-BR: "Nenhum agendamento para hoje" / en: "No bookings for today") so `buildBookingsHtml`'s empty-state message is also localized, not just the column headers. Key design choices: (a) `FormattingProvider` kept separate from `LocaleProvider` (single responsibility — locale/i18n vs. number/date formatting); (b) `formatDate` uses the explicit `dateFormat` pattern parameter (not locale-implied Intl format) to correctly handle tenants whose country and language differ (e.g. English-speaking BR tenant still uses `DD/MM/YYYY`); (c) `formatDateLong` is an unspecced addition to the hook — needed to replace `formatDateLongBR` callers in `ConfirmationStep` and `BookingSummaryCard`, which the spec said to migrate. `ConfirmationStep` and `BookingSummaryCard` gained `'use client'` directive — both are rendered inside `'use client'` parent components so this is safe. `InMemoryLocalizationPort` test double created in `src/test/infrastructure/` for future notification use-case specs. `send-admin-daily-schedule-reminder` spec gained an explicit `en` locale header assertion to verify locale dispatch. Backend `money-format.ts` left unchanged — it already has the correct `(amount, locale, currency, decimalPlaces)` signature from S02. `seo.spec.ts` and `platform.spec.ts` fixture objects updated to include `timezone`.

---

### Wave 4 — UI String Extraction

---

#### TD02-S08 — Booking components → `next-intl` ✅ Done

**Scope:**  
Replace all hardcoded pt-BR strings in booking components with `useTranslations('booking')`. Components: `BookingForm`, `ServiceSelectionStep`, `SlotPicker`, `AvailabilityCarousel`, `PersonalInfoStep`, `AddressFields`, `ConfirmationStep`, `BookingSummaryCard`, `PhotoUpload`.  
Pass `addressSpec` from manifest into `AddressFields` (aligns with TD02-S04 web changes).  
Update Vitest specs to use `next-intl` test utilities.

**Key files:** All files under `apps/web/components/booking/`

**Acceptance criteria:**
- [ ] Zero hardcoded pt-BR strings in booking components
- [ ] All component Vitest specs pass with mocked translations
- [ ] `PersonalInfoStep` phone prefix is locale-driven

**Implementation:** 15 new `booking.*` keys added to both locale files: `stepIndicator`, `slotPicker.loadError`, `availability.heading/today`, `serviceSelection.pickupAddress*`, `personalInfo.heading`, `confirmation.heading/successHeading/successBody`, `summary.heading/dateTimeLabel/at`, `photo.uploaded/formatHint/remove`, `errors.tryAgain`. Key structural changes beyond spec: (1) `dayNumber` and `dayCarouselLabel` extracted to `lib/formatting/date-utils.ts` as pure functions — `dayCarouselLabel` takes `todayLabel` as a parameter so it carries no React context dependency and is directly testable; `AvailabilityCarousel` replaced the hardcoded `WEEKDAY_LABELS` array with `Intl.DateTimeFormat(locale, { weekday: 'short' })` via `useLocale()`. (2) `uploadFile` in `PhotoUpload` and `validate()` in `PersonalInfoStep` moved inside the component body to capture `t()` via closure — the pattern for async/callback functions that need translated error messages. (3) `renderWithIntl()` test helper created at `apps/web/test-utils.tsx` wrapping `NextIntlClientProvider` + `FormattingProvider` with locale-aware defaults (`locale='en'` → en messages + USD/New_York/12h; `locale='pt-BR'` → pt-BR messages + BRL/Sao_Paulo/24h) so future tests can exercise non-BR tenants without manual setup. All 9 spec files migrated to `renderWithIntl`; text assertions updated to match canonical strings from `web.json`. Post-review fixes: `neighborhoodLabel ?? 'Neighborhood'` fallback (a11y — never actually empty since CountrySpec guarantees it when `requireNeighborhood: true`, but defensive); `rounded` Tailwind class on `BookingSummaryCard` replaced with `style={{ borderRadius: 'var(--ba-radius)' }}` (branding token convention).

---

#### TD02-S09 — Hotsite components + pages → `next-intl` ✅ Done

**Scope:**  
Replace all hardcoded pt-BR strings in hotsite module components (`HeroModule`, `ServiceListModule`, `GalleryModule`, `GalleryItem`, `GalleryGrid`, `TestimonialsModule`, `TestimonialsCarousel`, `AboutModule`, `ContactModule`, `BookingCtaModule`, `HotsiteAuthBar`, `Unavailable`), `app/not-found.tsx`, `app/[slug]/login/page.tsx`, `apps/web/lib/api/bff-client.ts` error string, and SEO defaults in `lib/hotsite/seo.ts`.  
Update Vitest specs for affected module components.

**E2E scope (mandatory — closes the localization E2E gap):**  
Add a US tenant (`country_code: 'US'`, `language: 'en'`, `currency: 'USD'`, `timezone: 'America/New_York'`) to the Playwright seed/fixture. Then add E2E specs to `apps/web/e2e/` that validate the full localization stack end-to-end for both tenants. This is the first story where every layer (DB → backend → BFF → web) is fully wired — it is the right and only moment to add these tests.

**Key files:** All files under `apps/web/components/hotsite/` · `apps/web/app/not-found.tsx` · `apps/web/app/[slug]/login/page.tsx` · `apps/web/lib/hotsite/seo.ts` · `apps/web/lib/api/bff-client.ts` · `apps/web/e2e/localization.spec.ts` (new)

**Acceptance criteria:**
- [x] Zero hardcoded pt-BR strings in hotsite components and pages
- [x] All component Vitest specs pass
- [x] Default module titles read from locale file (e.g. "Our Services" for `en` tenants)
- [x] **E2E — BR tenant** (`/lavacar-beloauto`): `<html lang="pt-BR">`, prices shown as `R$ X,XX`, weekday/long-date formatting in pt-BR, phone prefix `+55`, address field labelled "CEP", neighborhood field present
- [x] **E2E — US tenant** (`/ikaro`): `<html lang="en">`, prices shown as `$X.XX`, weekday/long-date formatting in en, phone prefix `+1`, address field labelled "ZIP Code", no neighborhood field
- [x] **E2E — BR tenant regression**: existing `guest-booking.spec.ts` golden path still passes unchanged (verified locale-agnostic — no text assertions — so it's unaffected by the tenant-locale reassignment below)

**Implementation:** Mid-story pivot on tenant assignment: rather than adding a 4th synthetic `us-demo` tenant as the spec suggested, `apps/backend/src/shared/database/seed.ts`'s `ikaro` tenant (slug `ikaro`) was reassigned to be the US-localized demo tenant (en/USD/America/New_York, services renamed "Basic Wash"/"Premium Wash"); `lavacar-beloauto`/`autospa-premium` stay pt-BR/BRL. This reuses two already richly-seeded tenants (existing bookings/loyalty/staff data) instead of a barely-populated 4th fixture, and `localization.spec.ts` targets them directly. Caused one real regression, fixed in the same commit: `hotsite-auth-bar.spec.ts` asserted hardcoded `'Entrar na'` against `/ikaro/login`, which now renders in English (`'Sign in to'`). `formatDate()`'s literal `DD/MM/YYYY`/`MM/DD/YYYY` numeric output has no UI consumer anywhere in the app (only `formatDateLong`'s weekday+month-name long form is actually rendered, in `ConfirmationStep`/`BookingSummaryCard`) — E2E date-locale coverage asserts against the real rendered weekday-abbreviation (`AvailabilityCarousel`'s day options) and long-form date text instead of inventing a numeric-format UI surface that didn't already exist. `lib/hotsite/seo.ts`'s `buildHotsiteMetadata()` was made `async` and switched from `next-intl/server`'s `getTranslations()` (ambient request-context locale) to `next-intl`'s `createTranslator()` with an explicit `resolveSupportedLocale(manifest.localization.language)` — the ambient approach couldn't satisfy `seo.spec.ts`'s existing tests, which vary `manifest.localization.language` per test case and require the function's translation choice to follow that parameter, not request-context guessing; explicit resolution is also more correct for any future caller where the manifest's tenant might differ from the request's own slug. `app/not-found.tsx` is now an async server component (`generateMetadata` + default export both call `getTranslations`) and also replaced car-wash-specific copy ("Lavacar não encontrada") with the already-prepared generic `notFound.*` keys — per the project's own page/layout testing rule this made it untestable with `render()`, so `not-found.spec.tsx` was deleted and `apps/web/app/not-found.tsx` added to `sonar.coverage.exclusions` alongside the existing `page.tsx`/`layout.tsx` entries. `bff-client.ts`'s `'Erro interno do servidor'` fallback was confirmed (via grep) to never reach end users — `BookingForm` always shows its own static `t('errors.submitFailed')` regardless of the underlying error — so it was simply translated to English (`'Internal server error'`) as an internal-only marker rather than wired through next-intl. New locale keys: `hotsite.gallery.{closeLightboxAriaLabel,closeAriaLabel}`, `hotsite.contact.{defaultTitle,addressLabel,emailLabel,whatsappLabel,whatsappDefaultCta,mapTitle}`, `hotsite.unavailable.body`, `auth.{myAccount,heading,subtitle,disclaimer}`; `seo.defaultSubtitle`/`defaultDescription` replaced with `seo.{defaultTitle,defaultTitleWithLocation,defaultDescription,defaultDescriptionWithLocation}` (ICU `{name}`/`{location}` placeholders, preserving the exact pre-existing visible copy). Separately, while resetting the local dev DB for the above: deleted `1748400000010-RebrandStaffInvitationTemplate.ts` (a fix-up migration correcting `1748100000010-CreateNotificationTemplates.ts`'s hardcoded "plataforma BeloAuto" to "plataforma Ikaro") and folded the fix directly into the original migration — safe pre-production squash, removed from `integration-global-setup.ts`'s migration list in the same commit. This was originally TD02-S10 scope; doing it now means S10 doesn't need to repeat it.

---

### Wave 5 — Backend Notification Strings

---

#### TD02-S10 — Notification template i18n ✅ Done

**Scope:**  
Inject `ILocalizationPort` into all notification use-cases that currently read subjects from the DB template.  
Update migration `1748100000010-CreateNotificationTemplates.ts` to read subjects and bodies from `packages/i18n/locales/pt-BR/notifications.json` at migration-run time (helper function imports from the package).  
Update all notification unit specs to assert against locale keys or a deterministic `ILocalizationPort` test double — not raw pt-BR literals.  
Update `booking-full-workflow.handler.integration.spec.ts` to use key-based assertions instead of `includes('reagendado')` substring matches.

**Key files:**  
`notification/infrastructure/migrations/1748100000010-CreateNotificationTemplates.ts` · all `send-*-notification.use-case.ts` files · all `send-*-notification.use-case.spec.ts` files · `booking-full-workflow.handler.integration.spec.ts` · `seed-default-templates.use-case.spec.ts`

> `1748400000010-RebrandStaffInvitationTemplate.ts` was already deleted in TD02-S09 (folded into `1748100000010-CreateNotificationTemplates.ts` directly) while resetting the local dev DB — nothing left to do here for that file.

**Acceptance criteria:**
- [x] No pt-BR string literals in **production** `.ts` files outside `packages/i18n/locales/` (unit-test fixtures legitimately mirror locale-file content to exercise the `ILocalizationPort` overlay — that's not the same violation as production code hardcoding copy)
- [x] Notification specs assert against `ILocalizationPort`-sourced fixture content, not DB-template literals — and the test double now keys by `eventName:recipientType:locale`, so a spec fails if the use case ever requests the wrong locale
- [x] Integration spec uses key assertions (`notificationType` + `to`, never subject-text substrings)
- [x] Migration is reproducible (locale file is the single source)

**Implementation:** Scope expanded mid-story per user direction: added a `locale` column to `notification_templates` (`VARCHAR(10) NOT NULL DEFAULT 'pt-BR'`), and the migration now seeds **two** rows per `NotificationTemplateKey` × channel — one `pt-BR`, one `en` — sourced directly from `packages/i18n/locales/<locale>/notifications.json` via a new `NOTIFICATION_TEMPLATE_KEY_MAPPING` (`notification/domain/notification-template-key.mapping.ts`) that maps each kebab-case `trigger_event` to the JSON's `{eventName, recipientType}` shape (handles irregularities like single-recipient events dropping the recipient suffix, and `staff-invitation`'s non-booking naming). `copyGlobalDefaultsForTenant(tenantId, locale)` now takes a `locale` param and only copies the global defaults matching the new tenant's resolved language, read via the already-existing `INotificationPlatformPort.getTenantInfo().locale` — kept `TenantProvisioned` thin, no new event field needed. All 13 `send-*-notification.use-case.ts` files now inject `ILocalizationPort` and call a new `BaseNotificationUseCase.localizeTemplates()` helper, which overlays localized subject/body onto the fetched `NotificationTemplate` aggregate via its existing `.update()` method before `.render()` interpolates variables — so `dispatchTemplates`/`dispatchTemplatesToMany` needed zero changes. `OutboundMessage` gained a `notificationType` field (populated from `template.triggerEvent` at both dispatch call sites in `BaseNotificationUseCase`) so `booking-full-workflow.handler.integration.spec.ts`'s 14 substring-matching assertions could be replaced with `notificationType`+`to` checks instead of parsing subject text — this also surfaced that the real `notifications.json` content differs from the old inline pt-BR literals (e.g. staff-invitation subject is "Convite para equipe Ikaro", not "Você foi convidado..."), which the old substring assertions had silently been relying on. Confirmed end-to-end against the real local dev DB: a fresh `pnpm db:seed` correctly copies 16 `en` templates to the `ikaro` tenant and 16 `pt-BR` templates each to `lavacar-beloauto`/`autospa-premium`, matching each tenant's `settings.localization.language`.

CodeRabbit + Copilot review on PR #23 found 7 real issues, fixed in a follow-up commit: (1) `localizeTemplates()` originally required every one of the 13 call sites to pass `eventName`/`recipientType` literals duplicating `NOTIFICATION_TEMPLATE_KEY_MAPPING` — refactored to derive both from `template.triggerEvent` via the mapping internally, net −63 lines across 16 files; (2) the migration's seed `INSERT` got `ON CONFLICT DO NOTHING` for consistency with `copyGlobalDefaultsForTenant`'s existing idempotent pattern; (3) `NotificationTemplate.create()` now rejects an empty/whitespace `locale`, matching the existing `subject`/`body` validation; (4) `copyGlobalDefaultsForTenant`'s `result?.rowCount` was **always undefined** — `DataSource.query()` doesn't populate `rowCount` for raw `INSERT` in TypeORM 0.3.x/pg — fixed with a `RETURNING 1 AS inserted` clause and counting the returned rows; this was the actual root cause of the `"seeded":0` log line noticed earlier in this session (the copy itself always worked, confirmed via direct DB inspection — only the logged count was wrong, and now correctly reports `16`); (5) `InMemoryLocalizationPort.getNotificationTemplate()` previously ignored its `locale` parameter entirely, so every one of the 13 use-case specs would have silently passed even if the use case sent the wrong locale — fixed by keying the lookup map on `eventName:recipientType:locale` (defaulting `setTemplate()` to `pt-BR`, with a new `setTemplateForLocale()` for explicit-locale fixtures); (6) `booking-full-workflow.handler.integration.spec.ts`'s `requestedCustomerMsgs` filter was missing the `m.to === customerEmail` check present on every sibling assertion; (7) this doc's acceptance-criteria wording overstated what was actually tested (see above). One finding was deliberately **not** applied: CodeRabbit flagged the migration as non-deterministic because it derives seed content from `NotificationTemplateKey`/`NOTIFICATION_TEMPLATE_KEY_MAPPING`/`@ikaro/i18n` at migration-run time rather than freezing a static snapshot — true in the abstract, but freezing content would directly reverse the user's explicit design intent for this story (`notifications.json` as the single source of truth, no inline-literal drift), and migration-historical-determinism isn't yet a real risk since there's no production deploy history to protect (consistent with the already-established pre-production migration-squashing precedent from TD02-S09). Revisit if/when this codebase nears a real production deploy. A second Copilot "Minor" finding (typing `OutboundMessage.notificationType` as `NotificationTemplateKey` instead of `string`) was also skipped — `NotificationLog.notificationType` and `IProcessedEventRepository`'s params already type the same value as plain `string`, so fixing only `OutboundMessage` would create inconsistency; broader enum-strictness at the persistence boundary is a separate exercise outside this story's scope.

---

## Dependency Diagram

```
TD02-S01  ──────────────────────────────────────────┐
  (CountrySpec registry + settings expansion)        │
         │                                           │
    ┌────┴────┐                                      │
    ▼         ▼                                      ▼
TD02-S02   TD02-S03   TD02-S04                  TD02-S05
(Money)    (Phone)    (Address)              (i18n package)
                                                     │
                                                     ▼
                                                TD02-S06
                                            (next-intl setup)
                                            ┌────────┘
                                            ▼
                                       TD02-S07
                                      (formatters)
                                      ┌────┘ └────┐
                                      ▼           ▼
                                 TD02-S08    TD02-S09
                                 (booking)  (hotsite)
                                            
TD02-S05 ──► TD02-S10
(i18n pkg)  (notifications)
```

Wave 1 stories (S01–S04) can be parallelized across engineers after S01 completes.  
Wave 2–5 stories within a wave can run in parallel.

---

## P0 / P1 / P2 Inventory Summary

| Severity | Count | Example |
|---|---|---|
| **P0** — breaks non-BR tenant at API boundary | 16 | `zip_code regex`, `Money 'BRL' literal`, `PhoneNumber 10/11 digit` |
| **P1** — wrong output / broken UX | 16 | `Money.format()` returns `R$`, date formatting hardcoded `pt-BR`, `lang="pt-BR"` static |
| **P2** — copy hardcoded, functionally OK | 22 | Booking/hotsite component strings, notification subjects |

Full 54-item table available in the audit session (2026-06-19).

---

## What is NOT in Scope

- **CPF / CNPJ** — Brazilian tax documents. Do not implement until `country_code === 'BR'` gating is in place via this TD.
- **Dashboard admin UI strings** — covered by a separate future story; dashboard is internal tooling and not tenant-language-sensitive yet.
- **Multi-locale runtime switching per user** — locale is per-tenant, not per-user session.
- **i18n URL routing** (`/en/slug`, `/pt-BR/slug`) — tenant slug already disambiguates context; URL locale prefix adds complexity with no benefit for this SaaS model.
- **Domain error messages** — English-only by project rule (CLAUDE.md §7).
- **Prototypes** (`plan/journey/*/prototypes/`) — remain as-is.
- **Seed content** (service names, hotsite copy) — tenant-owned data, Brazilian sample is intentional.
- **Additional locales beyond pt-BR and en** — registry pattern makes any future locale a data addition, not a code change.

---

## Acceptance Criteria (milestone complete when all are green)

- [ ] `countrySpec('BR')` and `countrySpec('US')` return correct full specs; unknown code returns FALLBACK
- [ ] `POST /internal/tenants` accepts `country_code`; existing rows default to `'BR'`
- [ ] Non-BR address (US ZIP, UK postcode, no neighborhood) passes all API validators
- [ ] `Money.from(amount, 'USD')` compiles; `Money.format('en', 'USD')` returns `$X.XX`
- [ ] `PhoneNumber.isValid('+14155552671')` → `true`
- [ ] `GET /hotsite/:slug/manifest` returns full `localization` object including `currency`, `phonePrefix`, `dateFormat`, `address`
- [ ] Web hotsite for a US tenant shows `$` prices, English strings, `MM/DD/YYYY` dates, ZIP Code field, no Bairro
- [ ] Web hotsite for a BR tenant behaves identically to today (zero regression)
- [ ] Zero hardcoded `pt-BR` / `BRL` / `America/Sao_Paulo` string literals outside `packages/i18n/locales/` and `tenant-settings.vo.ts` defaults
- [ ] All CI gates pass (lint, type-check, unit tests, coverage ≥ 80% on changed code)
- [ ] **E2E — Playwright tests confirm full localization stack for BR and US tenants** (added in S09): currency, date format, phone prefix, address field labels, `<html lang>`, and zero regression on existing BR booking flow
