import { validateEnv } from './env.validation';

describe('validateEnv()', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3002',
    BACKEND_INTERNAL_URL: 'http://localhost:3001',
    JWT_SECRET: 'a'.repeat(64),
    JWT_EXPIRES_IN: '7d',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3002/v1/auth/google/callback',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    CRON_SECRET: 'b'.repeat(32),
  };

  it('returns parsed env when all required vars are present and valid', () => {
    const original = { ...process.env };
    Object.assign(process.env, valid);

    const result = validateEnv();

    expect(result.PORT).toBe(3002);
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');

    Object.keys(valid).forEach((k) => delete process.env[k]);
    Object.assign(process.env, original);
  });
});
