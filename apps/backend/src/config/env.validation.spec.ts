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

  it('defaults APP_ENV to local and PUBSUB_CONSUMER_MODE to pull', () => {
    const result = validateEnv(valid);
    expect(result.APP_ENV).toBe('local');
    expect(result.PUBSUB_CONSUMER_MODE).toBe('pull');
  });

  it('throws when PUBSUB_CONSUMER_MODE=push and PUBSUB_AUTO_CREATE is left true', () => {
    expect(() =>
      validateEnv({
        ...valid,
        PUBSUB_CONSUMER_MODE: 'push',
        PUBSUB_PUSH_AUDIENCE: 'https://backend.internal/pubsub/push',
        PUBSUB_PUSH_SERVICE_ACCOUNT: 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com',
      }),
    ).toThrow('PUBSUB_AUTO_CREATE must be false when PUBSUB_CONSUMER_MODE=push');
  });

  it('throws when PUBSUB_CONSUMER_MODE=push without PUBSUB_PUSH_AUDIENCE or PUBSUB_PUSH_SERVICE_ACCOUNT', () => {
    expect(() =>
      validateEnv({ ...valid, PUBSUB_CONSUMER_MODE: 'push', PUBSUB_AUTO_CREATE: 'false' }),
    ).toThrow('ENV validation failed');
  });

  it('accepts a fully configured push-mode env', () => {
    const result = validateEnv({
      ...valid,
      PUBSUB_CONSUMER_MODE: 'push',
      PUBSUB_AUTO_CREATE: 'false',
      PUBSUB_PUSH_AUDIENCE: 'https://backend.internal/pubsub/push',
      PUBSUB_PUSH_SERVICE_ACCOUNT: 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com',
    });
    expect(result.PUBSUB_CONSUMER_MODE).toBe('push');
  });

  it('throws when APP_ENV != local and PUBSUB_AUTO_CREATE is left true, even in pull mode', () => {
    expect(() => validateEnv({ ...valid, APP_ENV: 'staging' })).toThrow(
      'PUBSUB_AUTO_CREATE must be false when APP_ENV is not "local"',
    );
  });

  it('allows PUBSUB_AUTO_CREATE=true when APP_ENV=local', () => {
    const result = validateEnv({
      ...valid,
      APP_ENV: 'local',
      PUBSUB_CONSUMER_MODE: 'pull',
    });
    expect(result.PUBSUB_AUTO_CREATE).toBe(true);
  });

  it('accepts APP_ENV=staging with PUBSUB_AUTO_CREATE=false in pull mode', () => {
    const result = validateEnv({
      ...valid,
      APP_ENV: 'staging',
      PUBSUB_AUTO_CREATE: 'false',
    });
    expect(result.APP_ENV).toBe('staging');
    expect(result.PUBSUB_AUTO_CREATE).toBe(false);
  });
});
