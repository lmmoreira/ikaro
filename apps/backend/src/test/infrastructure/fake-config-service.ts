import { ConfigService } from '@nestjs/config';

// Shared fake for the 4 outbox specs that each independently hand-rolled a makeConfigService()
// helper (bad-smell-audit BE-3, TD24-S01) — a plain object satisfying the one method every
// OutboxEventBus/OutboxRelayService constructor call actually uses. overrides[key] takes
// precedence; anything unset falls through to the caller's own .get(key, defaultValue) default,
// so tests only need to override the specific config var they're exercising.
export function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown): unknown => overrides[key] ?? defaultValue,
  } as unknown as ConfigService;
}
