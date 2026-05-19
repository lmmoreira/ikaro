import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3002),
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
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof schema>;

// Called by ConfigModule.forRoot({ validate }) at startup.
// Throws on invalid config so NestJS refuses to boot.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = schema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`ENV validation failed:\n${errors}`);
  }

  return result.data;
}
