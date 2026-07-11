import { z } from 'zod';
import { validateEnvWithSchema } from '@ikaro/env-validation';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    PORT: z.coerce.number().default(3001),
    LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'VERBOSE']).default('INFO'),
    LOG_VENDOR: z.enum(['gcp', 'none']).default('gcp'),
    GCP_PROJECT: z.string().optional(),
    DB_HOST: z.string().min(1, { message: 'DB_HOST is required' }),
    DB_PORT: z.coerce.number().default(5432),
    DB_USER: z.string().min(1, { message: 'DB_USER is required' }),
    DB_PASSWORD: z.string().min(1, { message: 'DB_PASSWORD is required' }),
    DB_NAME: z.string().min(1, { message: 'DB_NAME is required' }),
    DB_POOL_SIZE: z.coerce.number().int().min(1).default(10),
    PLATFORM_ADMIN_KEY: z
      .string()
      .min(32, { message: 'PLATFORM_ADMIN_KEY must be at least 32 characters' }),
    INTERNAL_API_KEY: z
      .string()
      .min(32, { message: 'INTERNAL_API_KEY must be at least 32 characters' }),
    PUBSUB_EMULATOR_HOST: z.string().optional(),
    PUBSUB_PROJECT_ID: z.string().default('ikaro-local'),
    PUBSUB_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    // z.stringbool() (not coerce.boolean(), which treats the *string* "false" as truthy)
    // correctly parses real .env string values: "true"/"false" (and common synonyms).
    PUBSUB_AUTO_CREATE: z.stringbool().default(true),
    PUBSUB_CONSUMER_MODE: z.enum(['pull', 'push']).default('pull'),
    PUBSUB_PUSH_AUDIENCE: z.string().optional(),
    PUBSUB_PUSH_SERVICE_ACCOUNT: z.string().optional(),
    GCS_EMULATOR_HOST: z.string().optional(),
    GCS_BUCKET_NAME: z.string().default('ikaro-local'),
    GCS_PUBLIC_BUCKET_NAME: z.string().default('ikaro-local-public'),
    GCS_PUBLIC_BASE_URL: z.string().default('https://storage.googleapis.com'),
    GCS_KEY_FILE: z.string().optional(),
    GCS_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    EMAIL_ADAPTER: z.enum(['sendgrid', 'mailhog']).default('mailhog'),
    EMAIL_FROM: z
      .email({ message: 'EMAIL_FROM must be a valid email address' })
      .default('noreply@ikaro.example'),
    SENDGRID_API_KEY: z.string().min(1).optional(),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    JWT_SECRET: z.string().min(64, { message: 'JWT_SECRET must be at least 64 characters' }),
    HOTSITE_REVALIDATE_SECRET: z
      .string()
      .min(32, { message: 'HOTSITE_REVALIDATE_SECRET must be at least 32 characters' }),
    // TD24-S01 — shared.outbox / OutboxRelayService config. INBOX_RETENTION_DAYS + its >= 8
    // startup check arrive with the inbox in S04.
    OUTBOX_INLINE_DISPATCH_ENABLED: z.stringbool().default(true),
    OUTBOX_SWEEP_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
    OUTBOX_SWEEP_GRACE_SECONDS: z.coerce.number().int().min(0).default(30),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).default(14),
  })
  .superRefine((data, ctx) => {
    if (data.EMAIL_ADAPTER === 'sendgrid' && !data.SENDGRID_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SENDGRID_API_KEY'],
        message: 'SENDGRID_API_KEY is required when EMAIL_ADAPTER=sendgrid',
      });
    }
    if (data.PUBSUB_CONSUMER_MODE === 'push' && data.PUBSUB_AUTO_CREATE) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBSUB_AUTO_CREATE'],
        message:
          'PUBSUB_AUTO_CREATE must be false when PUBSUB_CONSUMER_MODE=push — Terraform pre-provisions all Pub/Sub resources in push mode',
      });
    }
    if (data.APP_ENV !== 'local' && data.PUBSUB_AUTO_CREATE) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBSUB_AUTO_CREATE'],
        message:
          'PUBSUB_AUTO_CREATE must be false when APP_ENV is not "local" — Terraform owns all Pub/Sub resources in staging/production regardless of consumer mode',
      });
    }
    if (data.APP_ENV !== 'local' && data.PUBSUB_CONSUMER_MODE !== 'push') {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBSUB_CONSUMER_MODE'],
        message:
          'PUBSUB_CONSUMER_MODE must be "push" when APP_ENV is not "local" — Cloud Run staging/production use push delivery, so pull consumers would silently stop processing events',
      });
    }
    if (data.APP_ENV !== 'local' && data.EMAIL_ADAPTER === 'mailhog') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_ADAPTER'],
        message: 'EMAIL_ADAPTER=mailhog is not allowed when APP_ENV is not "local" — use SendGrid',
      });
    }
    if (data.PUBSUB_CONSUMER_MODE === 'push') {
      if (!data.PUBSUB_PUSH_AUDIENCE) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBSUB_PUSH_AUDIENCE'],
          message: 'PUBSUB_PUSH_AUDIENCE is required when PUBSUB_CONSUMER_MODE=push',
        });
      }
      if (!data.PUBSUB_PUSH_SERVICE_ACCOUNT) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBSUB_PUSH_SERVICE_ACCOUNT'],
          message: 'PUBSUB_PUSH_SERVICE_ACCOUNT is required when PUBSUB_CONSUMER_MODE=push',
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return validateEnvWithSchema(schema, config);
}
