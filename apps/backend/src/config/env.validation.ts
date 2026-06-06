import { z } from 'zod';
import { config } from 'dotenv';

config();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    DB_HOST: z.string().min(1, { message: 'DB_HOST is required' }),
    DB_PORT: z.coerce.number().default(5432),
    DB_USER: z.string().min(1, { message: 'DB_USER is required' }),
    DB_PASSWORD: z.string().min(1, { message: 'DB_PASSWORD is required' }),
    DB_NAME: z.string().min(1, { message: 'DB_NAME is required' }),
    PLATFORM_ADMIN_KEY: z
      .string()
      .min(32, { message: 'PLATFORM_ADMIN_KEY must be at least 32 characters' }),
    INTERNAL_API_KEY: z
      .string()
      .min(32, { message: 'INTERNAL_API_KEY must be at least 32 characters' }),
    PUBSUB_EMULATOR_HOST: z.string().optional(),
    PUBSUB_PROJECT_ID: z.string().default('beloauto-local'),
    PUBSUB_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    PUBSUB_AUTO_CREATE: z.coerce.boolean().default(true),
    GCS_EMULATOR_HOST: z.string().optional(),
    GCS_BUCKET_NAME: z.string().default('beloauto-local'),
    GCS_KEY_FILE: z.string().optional(),
    GCS_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    EMAIL_ADAPTER: z.enum(['sendgrid', 'mailhog']).default('mailhog'),
    EMAIL_FROM: z
      .email({ message: 'EMAIL_FROM must be a valid email address' })
      .default('noreply@beloauto.com.br'),
    SENDGRID_API_KEY: z.string().min(1).optional(),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters' }),
  })
  .superRefine((data, ctx) => {
    if (data.EMAIL_ADAPTER === 'sendgrid' && !data.SENDGRID_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SENDGRID_API_KEY'],
        message: 'SENDGRID_API_KEY is required when EMAIL_ADAPTER=sendgrid',
      });
    }
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
