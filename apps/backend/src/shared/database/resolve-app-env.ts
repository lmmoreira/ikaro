export const APP_ENVS = ['local', 'staging', 'production'] as const;

export type AppEnv = (typeof APP_ENVS)[number];

/**
 * Resolves `APP_ENV` for code that reads `process.env` directly instead of going through the
 * validated Nest config: migrations and the TypeORM CLI data source.
 *
 * An unset `APP_ENV` means `local` (the same default `env.validation.ts` applies). An unknown
 * value throws, so a typo can never silently take the cloud path or, worse, a data-seeding
 * migration's production branch.
 */
export function resolveAppEnv(env: NodeJS.ProcessEnv): AppEnv {
  const raw = env['APP_ENV'];
  if (raw === undefined || raw === '') {
    return 'local';
  }
  const known = APP_ENVS.find((appEnv) => appEnv === raw);
  if (known === undefined) {
    throw new Error(`Unknown APP_ENV "${raw}" — expected one of: ${APP_ENVS.join(', ')}`);
  }
  return known;
}
