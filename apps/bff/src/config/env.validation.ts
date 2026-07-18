import { z } from 'zod';
import { validateEnvWithSchema } from '@ikaro/env-validation';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    PORT: z.coerce.number().default(3002),
    LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'VERBOSE']).default('INFO'),
    LOG_VENDOR: z.enum(['gcp', 'none']).default('gcp'),
    GCP_PROJECT: z.string().optional(),
    BACKEND_INTERNAL_URL: z.url(),
    JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(
        /^\d+(ms|s|m|h|d|w|y)$/,
        'JWT_EXPIRES_IN must be a duration string like "7d", "24h", "3600s" — plain numbers are not accepted (jsonwebtoken interprets them as milliseconds)',
      )
      .default('7d'),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.url(),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    FRONTEND_URL: z.url().default('http://localhost:3000'),
    ENABLE_DEV_AUTH: z.string().optional(),
    INTERNAL_API_KEY: z.string().min(32, 'INTERNAL_API_KEY must be at least 32 characters'),
    BACKEND_AUTH_MODE: z.enum(['none', 'iam']).default('none'),
    BACKEND_AUDIENCE: z.url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.APP_ENV === 'production' && data.ENABLE_DEV_AUTH === 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['ENABLE_DEV_AUTH'],
        message:
          'ENABLE_DEV_AUTH=true is not allowed when APP_ENV=production — staging is the highest environment where dev auth may be enabled',
      });
    }

    if (data.NODE_ENV === 'production' && data.BACKEND_AUTH_MODE !== 'iam') {
      ctx.addIssue({
        code: 'custom',
        path: ['BACKEND_AUTH_MODE'],
        message:
          'BACKEND_AUTH_MODE must be "iam" when NODE_ENV=production — both staging and prod cloud builds set NODE_ENV=production, and the backend rejects unauthenticated Cloud Run traffic in both',
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return validateEnvWithSchema(schema, config);
}
