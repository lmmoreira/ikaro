import { z } from 'zod';
import { config } from 'dotenv';

config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3002),
  BACKEND_INTERNAL_URL: z.string().url(),
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(): Env {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    process.stderr.write(`\n❌ ENV validation failed:\n${errors}\n\n`);
    process.exit(1);
  }

  return result.data;
}
