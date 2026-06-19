import { applyEnvDefaults, type Env } from './env.validation';

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'development',
    PORT: 3001,
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USER: 'ikaro_app',
    DB_PASSWORD: 'ikaro_app',
    DB_NAME: 'ikaro',
    PLATFORM_ADMIN_KEY: 'a'.repeat(32),
    INTERNAL_API_KEY: 'a'.repeat(32),
    PUBSUB_PROJECT_ID: 'ikaro-local',
    PUBSUB_MAX_DELIVERY_ATTEMPTS: 5,
    PUBSUB_AUTO_CREATE: true,
    GCS_BUCKET_NAME: 'ikaro-local',
    GCS_PUBLIC_BUCKET_NAME: 'ikaro-local-public',
    GCS_PUBLIC_BASE_URL: 'https://storage.googleapis.com',
    GCS_MAX_UPLOAD_BYTES: 10_485_760,
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    EMAIL_ADAPTER: 'mailhog',
    EMAIL_FROM: 'noreply@ikaro.example',
    FRONTEND_URL: 'http://localhost:3000',
    JWT_SECRET: 'a'.repeat(32),
    HOTSITE_REVALIDATE_SECRET: 'a'.repeat(32),
    ...overrides,
  };
}

describe('applyEnvDefaults()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('sets a defaulted key that is absent from process.env', () => {
    delete process.env['PUBSUB_PROJECT_ID'];

    applyEnvDefaults(buildEnv());

    expect(process.env['PUBSUB_PROJECT_ID']).toBe('ikaro-local');
  });

  it('does not overwrite a key already present in process.env', () => {
    process.env['PUBSUB_PROJECT_ID'] = 'real-gcp-project';

    applyEnvDefaults(buildEnv());

    expect(process.env['PUBSUB_PROJECT_ID']).toBe('real-gcp-project');
  });

  it('stringifies non-string defaulted values', () => {
    delete process.env['PUBSUB_AUTO_CREATE'];

    applyEnvDefaults(buildEnv());

    expect(process.env['PUBSUB_AUTO_CREATE']).toBe('true');
  });
});
