import { z } from 'zod';
import { validateEnvWithSchema } from '@ikaro/env-validation';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3002),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'VERBOSE']).default('INFO'),
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
});

export type Env = z.infer<typeof schema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return validateEnvWithSchema(schema, config);
}
