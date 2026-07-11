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
    JWT_SECRET: 'c'.repeat(64),
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
    expect(result.DB_POOL_SIZE).toBe(10);
    expect(result.LOG_LEVEL).toBe('INFO');
    expect(result.LOG_VENDOR).toBe('gcp');
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

  it('throws when JWT_SECRET is shorter than 64 characters', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'c'.repeat(63) })).toThrow(
      'JWT_SECRET must be at least 64 characters',
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

  it('throws when APP_ENV is not local and PUBSUB_CONSUMER_MODE is not push', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'development',
        APP_ENV: 'staging',
        PUBSUB_AUTO_CREATE: 'false',
      }),
    ).toThrow('PUBSUB_CONSUMER_MODE must be "push" when APP_ENV is not "local"');
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

  it('throws when APP_ENV is not local and EMAIL_ADAPTER=mailhog', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'development',
        APP_ENV: 'staging',
        PUBSUB_AUTO_CREATE: 'false',
        PUBSUB_CONSUMER_MODE: 'push',
        PUBSUB_PUSH_AUDIENCE: 'https://backend.internal/pubsub/push',
        PUBSUB_PUSH_SERVICE_ACCOUNT: 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com',
        EMAIL_ADAPTER: 'mailhog',
      }),
    ).toThrow('EMAIL_ADAPTER=mailhog is not allowed when APP_ENV is not "local"');
  });

  it('accepts non-local APP_ENV when push mode and sendgrid are configured', () => {
    const result = validateEnv({
      ...valid,
      NODE_ENV: 'development',
      APP_ENV: 'staging',
      PUBSUB_AUTO_CREATE: 'false',
      PUBSUB_CONSUMER_MODE: 'push',
      PUBSUB_PUSH_AUDIENCE: 'https://backend.internal/pubsub/push',
      PUBSUB_PUSH_SERVICE_ACCOUNT: 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com',
      EMAIL_ADAPTER: 'sendgrid',
      SENDGRID_API_KEY: 'SG.fake-key',
      DB_POOL_SIZE: '3',
    });
    expect(result.DB_POOL_SIZE).toBe(3);
  });

  it('throws when APP_ENV != local and PUBSUB_AUTO_CREATE is left true, even in pull mode', () => {
    expect(() => validateEnv({ ...valid, APP_ENV: 'staging' })).toThrow(
      'PUBSUB_AUTO_CREATE must be false when APP_ENV is not "local"',
    );
  });

  it('allows pull mode and MailHog when APP_ENV=local even if NODE_ENV=production', () => {
    const result = validateEnv({
      ...valid,
      NODE_ENV: 'production',
      APP_ENV: 'local',
      PUBSUB_CONSUMER_MODE: 'pull',
      EMAIL_ADAPTER: 'mailhog',
    });
    expect(result.PUBSUB_AUTO_CREATE).toBe(true);
    expect(result.PUBSUB_CONSUMER_MODE).toBe('pull');
    expect(result.EMAIL_ADAPTER).toBe('mailhog');
  });

  it('accepts APP_ENV=staging with push mode and sendgrid', () => {
    const result = validateEnv({
      ...valid,
      APP_ENV: 'staging',
      PUBSUB_AUTO_CREATE: 'false',
      PUBSUB_CONSUMER_MODE: 'push',
      PUBSUB_PUSH_AUDIENCE: 'https://backend.internal/pubsub/push',
      PUBSUB_PUSH_SERVICE_ACCOUNT: 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com',
      EMAIL_ADAPTER: 'sendgrid',
      SENDGRID_API_KEY: 'SG.fake-key',
    });
    expect(result.APP_ENV).toBe('staging');
    expect(result.PUBSUB_AUTO_CREATE).toBe(false);
    expect(result.PUBSUB_CONSUMER_MODE).toBe('push');
  });

  it('accepts optional GCP_PROJECT for Cloud Logging trace correlation', () => {
    const result = validateEnv({
      ...valid,
      GCP_PROJECT: 'ikaro-staging',
    });
    expect(result.GCP_PROJECT).toBe('ikaro-staging');
  });

  it('accepts LOG_VENDOR=none to disable vendor-specific log fields', () => {
    const result = validateEnv({
      ...valid,
      LOG_VENDOR: 'none',
    });
    expect(result.LOG_VENDOR).toBe('none');
  });

  it('defaults the outbox config vars (TD24-S01)', () => {
    const result = validateEnv(valid);
    expect(result.OUTBOX_INLINE_DISPATCH_ENABLED).toBe(true);
    expect(result.OUTBOX_SWEEP_BATCH_SIZE).toBe(100);
    expect(result.OUTBOX_SWEEP_GRACE_SECONDS).toBe(30);
    expect(result.OUTBOX_RETENTION_DAYS).toBe(14);
  });

  it('parses overridden outbox config vars from string env input', () => {
    const result = validateEnv({
      ...valid,
      OUTBOX_INLINE_DISPATCH_ENABLED: 'false',
      OUTBOX_SWEEP_BATCH_SIZE: '250',
      OUTBOX_SWEEP_GRACE_SECONDS: '60',
      OUTBOX_RETENTION_DAYS: '30',
    });
    expect(result.OUTBOX_INLINE_DISPATCH_ENABLED).toBe(false);
    expect(result.OUTBOX_SWEEP_BATCH_SIZE).toBe(250);
    expect(result.OUTBOX_SWEEP_GRACE_SECONDS).toBe(60);
    expect(result.OUTBOX_RETENTION_DAYS).toBe(30);
  });
});
