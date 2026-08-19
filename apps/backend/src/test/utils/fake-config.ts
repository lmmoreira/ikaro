import { IApplicationConfig } from '../../shared/ports/application-config.port';

// Mirrors env.validation.ts's own Zod .default(...) values for keys IApplicationConfig.getOrThrow
// has no built-in fallback for — real IApplicationConfig only ever resolves a key because
// ConfigModule's validate step already applied the schema default and copied it back into
// process.env (docs/CI_TRAPS.md's ConfigService.getOrThrow() trap). Keep in sync with
// apps/backend/src/config/env.validation.ts when either changes.
const SCHEMA_DEFAULTS: Record<string, string> = {
  CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD: '1',
  CHATBOT_MIN_PROVIDER_BALANCE_USD: '2',
  CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES: '5',
};

/** A fake IApplicationConfig — `overrides` stands in for real process.env values; anything not
 * overridden falls back to the real env.validation.ts schema default. */
export function fakeConfig(overrides: Record<string, string> = {}): IApplicationConfig {
  return {
    getOrThrow: (key: string) => {
      const value = overrides[key] ?? SCHEMA_DEFAULTS[key];
      if (value === undefined) throw new Error(`Missing config: ${key}`);
      return value;
    },
  };
}
