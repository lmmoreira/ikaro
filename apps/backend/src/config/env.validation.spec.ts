import { validateEnv } from './env.validation';

describe('validateEnv()', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3001',
    DB_HOST: 'localhost',
    DB_USER: 'ikaro_app',
    DB_PASSWORD: 'ikaro_app',
    DB_NAME: 'ikaro',
    PLATFORM_ADMIN_KEY: 'a'.repeat(32),
    INTERNAL_API_KEY: 'b'.repeat(32),
    JWT_SECRET: 'c'.repeat(32),
    HOTSITE_REVALIDATE_SECRET: 'd'.repeat(32),
  };

  it('returns parsed env when all required vars are present and valid', () => {
    const result = validateEnv(valid);
    expect(result.PORT).toBe(3001);
    expect(result.DB_HOST).toBe('localhost');
  });

  it('fills in schema defaults for fields not present in the input', () => {
    const result = validateEnv(valid);
    expect(result.PUBSUB_PROJECT_ID).toBe('ikaro-local');
    expect(result.FRONTEND_URL).toBe('http://localhost:3000');
  });

  it('throws when a required var is missing', () => {
    const withoutSecret = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== 'JWT_SECRET'),
    );
    expect(() => validateEnv(withoutSecret)).toThrow('ENV validation failed');
  });

  it('throws when PLATFORM_ADMIN_KEY is too short', () => {
    expect(() => validateEnv({ ...valid, PLATFORM_ADMIN_KEY: 'short' })).toThrow(
      'ENV validation failed',
    );
  });
});
