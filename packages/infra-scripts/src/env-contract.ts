import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractPublicEnvKeys } from './public-env-keys';
import { extractSchemaKeys } from './schema-keys';
import { extractModuleEnvKeys } from './terraform-env-keys';

interface AppEnvSpec {
  readonly appName: string;
  readonly cloudRunModule: string;
  /**
   * Required keys that are never expected in Terraform's env/secret map,
   * either because they're local-only / platform-reserved (PORT,
   * *_EMULATOR_HOST, GCS_KEY_FILE, SMTP_*), or because the default is
   * already correct for cloud / their absence is a quality issue rather
   * than a startup crash (LOG_LEVEL, FRONTEND_URL, ...). Hand-maintained,
   * same discipline as modules/iam's secret_accessors comment — keep in
   * sync with the app's own env source (env.validation.ts, or
   * public-env.ts for web).
   */
  readonly exemptKeys: readonly string[];
  /**
   * Which env roots (staging/prod main.tf files) this app's keys are checked against. All three
   * apps are wired in both staging and prod (`ALL_ENV_ROOTS`) — web's NEXT_PUBLIC_* runtime vars
   * landed in staging first (M17-S25) and prod second (M17-S26), matching the rest.
   */
  readonly envRoots: readonly string[];
  readonly extractKeys: (repoRoot: string) => string[];
}

const ALL_ENV_ROOTS: readonly string[] = [
  'infra/terraform/envs/staging/main.tf',
  'infra/terraform/envs/prod/main.tf',
];

const BACKEND_EXEMPT_KEYS: readonly string[] = [
  'PORT',
  'PUBSUB_EMULATOR_HOST',
  'GCS_EMULATOR_HOST',
  'GCS_KEY_FILE',
  'SMTP_HOST',
  'SMTP_PORT',
  'NODE_ENV',
  'APP_ENV',
  'LOG_LEVEL',
  'LOG_VENDOR',
  'GCP_PROJECT',
  // TD33 — DB_HOST is APP_ENV=local-only now (raw TCP to Testcontainers/docker-compose Postgres);
  // staging/prod wire DB_INSTANCE_CONNECTION_NAME instead (Cloud SQL Connector), which is not
  // exempted here, so its presence in both env roots' cloudrun_backend module is still enforced.
  'DB_HOST',
  'DB_PORT',
  'PUBSUB_MAX_DELIVERY_ATTEMPTS',
  'GCS_PUBLIC_BASE_URL',
  'GCS_MAX_UPLOAD_BYTES',
  'EMAIL_FROM',
  'BREVO_SMTP_HOST',
  'BREVO_SMTP_PORT',
  'BREVO_SMTP_SECURE',
  'FRONTEND_URL',
  'OUTBOX_INLINE_DISPATCH_ENABLED',
  'OUTBOX_SWEEP_BATCH_SIZE',
  'OUTBOX_SWEEP_GRACE_SECONDS',
  'OUTBOX_RETENTION_DAYS',
  'INBOX_RETENTION_DAYS',
  // M17-S33 — SERVICE_NAME's default already matches this app in every environment;
  // OTEL_EXPORTER_OTLP_ENDPOINT's default (localhost:4318) is correct even in cloud, since the
  // collector runs as a same-pod sidecar (M17-S34) sharing the network namespace; OTEL_SDK_DISABLED
  // correctly defaults to false in cloud. OTEL_TRACES_SAMPLER_ARG is the one real TODO: M17-S34
  // must remove it from this list once Terraform sets a prod override (0.1) — until then, prod
  // silently runs at the 1.0 default (over-sampling cost risk per D12, not a startup crash).
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_TRACES_SAMPLER_ARG',
  'OTEL_SDK_DISABLED',
  'SERVICE_NAME',
];

const BFF_EXEMPT_KEYS: readonly string[] = [
  'PORT',
  'NODE_ENV',
  'APP_ENV',
  'LOG_LEVEL',
  'LOG_VENDOR',
  'GCP_PROJECT',
  'JWT_EXPIRES_IN',
  'ALLOWED_ORIGINS',
  'FRONTEND_URL',
  'ENABLE_DEV_AUTH',
  'BACKEND_AUDIENCE',
  // M17-S33 — see the matching comment on BACKEND_EXEMPT_KEYS above; same reasoning applies here.
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_TRACES_SAMPLER_ARG',
  'OTEL_SDK_DISABLED',
  'SERVICE_NAME',
];

// Empty today — every key in apps/web's PUBLIC_ENV_KEYS is expected to be a
// real Cloud Run runtime env var. Add a key here only if a future
// NEXT_PUBLIC_* var is genuinely local-only (e.g. a next-dev-only debug
// flag never needed in a deployed environment).
const WEB_EXEMPT_KEYS: readonly string[] = [];

const APP_SPECS: readonly AppEnvSpec[] = [
  {
    appName: 'backend',
    cloudRunModule: 'cloudrun_backend',
    exemptKeys: BACKEND_EXEMPT_KEYS,
    envRoots: ALL_ENV_ROOTS,
    extractKeys: (repoRoot) =>
      extractSchemaKeys(path.join(repoRoot, 'apps/backend/src/config/env.validation.ts')),
  },
  {
    appName: 'bff',
    cloudRunModule: 'cloudrun_bff',
    exemptKeys: BFF_EXEMPT_KEYS,
    envRoots: ALL_ENV_ROOTS,
    extractKeys: (repoRoot) =>
      extractSchemaKeys(path.join(repoRoot, 'apps/bff/src/config/env.validation.ts')),
  },
  {
    appName: 'web',
    cloudRunModule: 'cloudrun_web',
    exemptKeys: WEB_EXEMPT_KEYS,
    envRoots: ALL_ENV_ROOTS,
    extractKeys: (repoRoot) =>
      extractPublicEnvKeys(path.join(repoRoot, 'apps/web/shared/lib/runtime-env/public-env.ts')),
  },
];

export interface EnvContractViolation {
  readonly envRoot: string;
  readonly appName: string;
  readonly cloudRunModule: string;
  readonly missingKeys: readonly string[];
}

export function checkEnvContract(repoRoot: string): EnvContractViolation[] {
  const violations: EnvContractViolation[] = [];

  for (const spec of APP_SPECS) {
    const schemaKeys = spec.extractKeys(repoRoot);
    const requiredKeys = schemaKeys.filter((key) => !spec.exemptKeys.includes(key));

    for (const envRoot of spec.envRoots) {
      const content = fs.readFileSync(path.join(repoRoot, envRoot), 'utf8');
      const terraformKeys = new Set(extractModuleEnvKeys(content, spec.cloudRunModule));

      const missingKeys = requiredKeys.filter((key) => !terraformKeys.has(key));
      if (missingKeys.length > 0) {
        violations.push({
          envRoot,
          appName: spec.appName,
          cloudRunModule: spec.cloudRunModule,
          missingKeys,
        });
      }
    }
  }

  return violations;
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const violations = checkEnvContract(repoRoot);

  if (violations.length === 0) {
    console.log(
      'env-contract: OK — every cloud-required env key (backend/bff env.validation.ts, ' +
        'web PUBLIC_ENV_KEYS) is wired in Terraform.',
    );
    return;
  }

  console.error('env-contract: FAILED\n');
  for (const violation of violations) {
    console.error(`  ${violation.envRoot} — module "${violation.cloudRunModule}" is missing:`);
    for (const key of violation.missingKeys) {
      console.error(`    - ${key}`);
    }
  }
  console.error(
    '\nAdd these to env_vars/secret_env_vars in the listed file(s), or exempt them in ' +
      'packages/infra-scripts/src/env-contract.ts if they are genuinely optional/local-only.',
  );
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}
