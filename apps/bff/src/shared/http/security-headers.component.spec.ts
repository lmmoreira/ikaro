import { INestApplication } from '@nestjs/common';
import { createTestApp, request } from '../../test/component-test.helpers';

describe('Security headers (component)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('applies helmet defaults to every response', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/live');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
