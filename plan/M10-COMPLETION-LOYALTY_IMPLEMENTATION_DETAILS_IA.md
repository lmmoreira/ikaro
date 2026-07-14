# M10 — Booking Completion + Loyalty: Implementation Details (IA)

## Artifacts

| Artifact | Path |
|---|---|
| `LoyaltyEntry` aggregate | `apps/backend/src/contexts/loyalty/domain/loyalty-entry.aggregate.ts` |
| `LoyaltyBalance` aggregate | `apps/backend/src/contexts/loyalty/domain/loyalty-balance.aggregate.ts` |
| `LoyaltyRedemption` aggregate | `apps/backend/src/contexts/loyalty/domain/loyalty-redemption.aggregate.ts` |
| Domain errors | `apps/backend/src/contexts/loyalty/domain/errors/loyalty-domain.error.ts` |
| `ServicePointsEarned` event | `apps/backend/src/contexts/loyalty/domain/events/service-points-earned.event.ts` |
| `RecordLoyaltyEntriesUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/record-loyalty-entries/` |
| `GetLoyaltyBalanceUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/get-loyalty-balance/` |
| `GetLoyaltyEntriesUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/get-loyalty-entries/` |
| `GetLoyaltyRedemptionsUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/get-loyalty-redemptions/` |
| `RedeemPointsUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/redeem-points/` |
| `ExpirePointsUseCase` | `apps/backend/src/contexts/loyalty/application/use-cases/expire-points/` |
| `LoyaltyController` (tenant-scoped) | `apps/backend/src/contexts/loyalty/infrastructure/controllers/loyalty.controller.ts` |
| `CronLoyaltyController` (expiry trigger) | `apps/backend/src/contexts/loyalty/infrastructure/controllers/cron-loyalty.controller.ts` |
| `BookingCompletedHandler` | `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.ts` |
| `SendServicePointsEarnedNotificationUseCase` | `apps/backend/src/contexts/notification/application/use-cases/send-service-points-earned-notification/` |
| `ServicePointsEarnedHandler` | `apps/backend/src/contexts/notification/infrastructure/events/service-points-earned.handler.ts` |
| `ILoyaltyEntryRepository` port | `apps/backend/src/contexts/loyalty/application/ports/loyalty-entry-repository.port.ts` |
| `ILoyaltyBalanceRepository` port | `apps/backend/src/contexts/loyalty/application/ports/loyalty-balance-repository.port.ts` |
| `ILoyaltyRedemptionRepository` port | `apps/backend/src/contexts/loyalty/application/ports/loyalty-redemption-repository.port.ts` |
| `IBalanceExpiryLogRepository` port | `apps/backend/src/contexts/loyalty/application/ports/balance-expiry-log-repository.port.ts` |
| `IInboxRepository` port (shared, replaces the deleted `IProcessedEventRepository` — TD24-S04) | `apps/backend/src/shared/ports/inbox.port.ts` |
| `ILoyaltyTenantSettingsPort` | `apps/backend/src/contexts/loyalty/application/ports/loyalty-tenant-settings.port.ts` |
| `IServiceCatalogPort` | `apps/backend/src/contexts/loyalty/application/ports/service-catalog.port.ts` |
| `LoyaltyTenantSettingsAdapter` | `apps/backend/src/contexts/loyalty/infrastructure/cross-context/loyalty-tenant-settings.adapter.ts` |
| `ServiceCatalogAdapter` | `apps/backend/src/contexts/loyalty/infrastructure/cross-context/service-catalog.adapter.ts` |
| `INotificationCustomerPort` | `apps/backend/src/contexts/notification/application/ports/notification-customer.port.ts` |
| `INotificationServicePort` | `apps/backend/src/contexts/notification/application/ports/notification-service.port.ts` |
| Migration 1 (entries only — the `processed_events` block this migration originally also created was removed when migration history was squashed pre-production, TD24-S04 D16) | `apps/backend/src/contexts/loyalty/infrastructure/migrations/1748000000016-CreateLoyaltyLoyaltyEntries.ts` |
| Migration 2 (balances + redemptions + expiry_log) | `apps/backend/src/contexts/loyalty/infrastructure/migrations/1748000000017-CreateLoyaltyBalancesRedemptionsExpiryLog.ts` |
| `LoyaltyModule` | `apps/backend/src/contexts/loyalty/loyalty.module.ts` |
| BFF loyalty controller | `apps/bff/src/loyalty/loyalty.controller.ts` |
| Loyalty error mapper | `apps/backend/src/contexts/loyalty/infrastructure/http/loyalty-error.mapper.ts` |
| HTTP file (customer/admin routes) | `apps/backend/http/loyalty/loyalty.http` |
| HTTP file (expiry trigger) | `apps/backend/http/loyalty/cron-loyalty-expiry.http` |
| Integration app helper | `apps/backend/src/test/utils/loyalty-integration-app.ts` |

---

## DB Schema (`loyalty` schema)

### `loyalty.loyalty_entries` (append-only)
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
booking_id       UUID NOT NULL
booking_line_id  UUID NOT NULL
service_id       UUID NOT NULL
points           INTEGER NOT NULL CHECK (points > 0)
earned_at        TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at       TIMESTAMPTZ NOT NULL
UNIQUE (tenant_id, booking_line_id)   -- idempotency key
INDEX (tenant_id)
INDEX (tenant_id, customer_id)
INDEX (tenant_id, customer_id, expires_at)   -- for expiry trigger
```

### `loyalty.loyalty_balances` (mutable running total)
```sql
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
current_points   INTEGER NOT NULL DEFAULT 0 CHECK (current_points >= 0)
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (tenant_id, customer_id)   -- one row per customer per tenant
```

### `loyalty.loyalty_redemptions` (append-only)
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
customer_id      UUID NOT NULL
points_redeemed  INTEGER NOT NULL CHECK (points_redeemed > 0)
redeemed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
redeemed_by      UUID NOT NULL   -- staffId
notes            TEXT
booking_id       UUID            -- nullable
INDEX (tenant_id, customer_id)
```

### `loyalty.balance_expiry_log` (idempotency for expiry trigger)
```sql
entry_id         UUID PRIMARY KEY   -- FK → loyalty_entries.id
processed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `loyalty.processed_events` — never existed (migration history squashed pre-production, TD24-S04 D16)
Pub/Sub consumer idempotency now lives in the shared `shared.inbox` table instead — see `docs/13-DATABASE_SCHEMA.md`'s `Schema: shared` section for its shape.

---

## Structural Decisions

### LoyaltyBalance is a running total — never SUM entries
`loyalty_balances.current_points` is the authoritative balance. It is incremented on earn (`RecordLoyaltyEntriesUseCase`), decremented on redemption (`RedeemPointsUseCase`) and expiry (`ExpirePointsUseCase`). Never compute balance via `SUM(loyalty_entries.points)` — O(n) and ignores redemptions.

### Points expiry via HTTP trigger, not @Cron
`POST /cron/loyalty-expiry` is called by GCP Cloud Scheduler at 02:00 UTC daily. `@nestjs/schedule` / `@Cron` not used. Reason: Cloud Run scales to zero (in-process cron never fires); multi-pod would duplicate. One HTTP request → one pod handles it. Controller is `CronLoyaltyController` — no TenantContext, no guard in MVP (M115-S03 adds `CronAuthGuard` with OIDC token).

### Expiry trigger idempotency via `balance_expiry_log`
`ExpirePointsUseCase` calls `findExpiringBefore(new Date())` then filters out already-processed entry IDs via `IBalanceExpiryLogRepository.hasBeenProcessed()`. Entries marked in the same `txManager.run()` as the balance upsert. If balance is already 0 or null, entries are still marked — no infinite retry.

### Pub/Sub consumer idempotency via the shared inbox (updated by TD24-S04 — `loyalty.processed_events` no longer exists, replaced by `shared.inbox`)
`CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME = 'COMPLETE_BOOKING_LOYALTY_EFFECTS'`. Each event checked via `inboxRepo.hasBeenProcessed(eventId, CONSUMER_NAME)` (`IInboxRepository`) before processing. Marked in the same transaction as entry saves + balance upsert.

### TenantContext NOT available in Pub/Sub handlers
`BookingCompletedHandler` runs outside the HTTP request lifecycle — AsyncLocalStorage TenantContext is not set. Loyalty settings are loaded via `ILoyaltyTenantSettingsPort.getLoyaltySettings(tenantId)` (injects `GetTenantByIdUseCase`). Fallback: `expiryDays = 180` if tenant settings absent.

### Cross-context reads via DataSource injection (not repo tokens)
`ServiceCatalogAdapter` queries `booking.services` table via `@InjectDataSource()` and raw TypeORM `DataSource`. Same pattern for `INotificationServicePort`. Never import a repository token from another context — context isolation invariant.

### ServicePointsEarned emitted once per booking, inside txManager.run() (corrected — was originally built as one event per line, published after commit; both since changed)
One `ServicePointsEarned` event per booking (not per line), carrying a `lines[]` summary array of all entries earned in that booking (see the event's current payload shape in `docs/03-DOMAIN_EVENTS.md`). `LoyaltyEntry`/`LoyaltyBalance` aren't among the 3 auto-draining aggregates (`Booking`/`Staff`/`Tenant`), so the use case publishes directly via `OUTBOX_PUBLISHER` as the last call **inside** the same `txManager.run()` block as the entry/balance/inbox writes — not a post-commit flush. Publishing inside the transaction closed a real bug (TD24-S03, "the loyalty re-emit"): a crash between commit and a post-commit publish used to lose `ServicePointsEarned` forever, since `hasBeenProcessed` already short-circuits any `BookingCompleted` redelivery. `currentBalance` field added to the event so the notification use case doesn't need a second DB query for the balance.

### Clamped decrement in ExpirePointsUseCase
If `expiredPoints > balance.currentPoints` (e.g. balance was reduced by redemptions since entries were created), the use case decrements `Math.min(expiredPoints, balance.currentPoints)` — clamps to 0 rather than throwing `LoyaltyInsufficientPointsError`. Entry IDs are still marked processed.

---

## Port + Adapter Summary (cross-context)

| Port | Adapter | What it reads |
|---|---|---|
| `ILoyaltyTenantSettingsPort` | `LoyaltyTenantSettingsAdapter` | `GetTenantByIdUseCase` → `settings.loyalty.expiryDays` |
| `IServiceCatalogPort` | `ServiceCatalogAdapter` | `booking.services` via `DataSource` |
| `INotificationCustomerPort` | `CustomerInfoAdapter` | `CustomerQueryService` (from CustomerModule) |
| `INotificationServicePort` | `ServiceInfoAdapter` | `booking.services` via `DataSource` |

---

## Error Mapping

| Domain Error | HTTP Status | Use case |
|---|---|---|
| `LoyaltyBalanceNotFoundError` | 404 | Customer has no balance row (never earned) |
| `LoyaltyInsufficientPointsError` | 422 | Redeem more than current balance |
| `LoyaltyInvalidPointsError` | 422 | `points <= 0` passed to increment/decrement |

---

## Pub/Sub Subscription Names

| Event | Consumer name | Subscription |
|---|---|---|
| `BookingCompleted` | `COMPLETE_BOOKING_LOYALTY_EFFECTS` | `ikaro-BookingCompleted-COMPLETE_BOOKING_LOYALTY_EFFECTS` |
| `ServicePointsEarned` | `notification` | `ikaro-ServicePointsEarned-notification` |

---

## Key Config

| Setting | Path | Default |
|---|---|---|
| Points expiry days | `tenants.settings.loyalty.expiryDays` | `180` |
| Expiry warning days (M11-S06) | `tenants.settings.loyalty.expiryWarningDays` | `7` |

---

## Test Infrastructure

| Double | Path |
|---|---|
| `InMemoryLoyaltyEntryRepository` | `src/test/infrastructure/in-memory-loyalty-entry.repository.ts` |
| `InMemoryLoyaltyBalanceRepository` | `src/test/infrastructure/in-memory-loyalty-balance.repository.ts` |
| `InMemoryLoyaltyRedemptionRepository` | `src/test/infrastructure/in-memory-loyalty-redemption.repository.ts` |
| `InMemoryBalanceExpiryLogRepository` | `src/test/infrastructure/in-memory-balance-expiry-log.repository.ts` |
| `InMemoryInboxRepository` (shared, replaces the deleted `InMemoryProcessedEventRepository` — TD24-S04) | `src/test/infrastructure/in-memory-inbox.repository.ts` |
| `InMemoryLoyaltyTenantSettingsPort` | `src/test/infrastructure/in-memory-loyalty-tenant-settings.port.ts` |
| `InMemoryServiceCatalogPort` | `src/test/infrastructure/in-memory-service-catalog.port.ts` |
| `InMemoryNotificationCustomerPort` | `src/test/infrastructure/in-memory-notification-customer.port.ts` |
| `InMemoryNotificationServicePort` | `src/test/infrastructure/in-memory-notification-service.port.ts` |
| `createLoyaltyIntegrationApp()` | `src/test/utils/loyalty-integration-app.ts` |
| Loyalty builders (aggregate + entity) | `src/test/builders/loyalty/index.ts` |
