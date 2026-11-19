import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';

const TOKEN = 'component-asaas-webhook-token';
const URL = '/v1/public/billing/webhooks/asaas';
const BODY = { id: 'evt_1&1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 49 } };

// The webhook route through the REAL guard chain (global web-only guard, JWT guard, throttler): it
// needs no `@BypassWebOnlyGuard()` because the web gateway sends the shared-secret header itself.
describe('BillingWebhookPublicController (component)', () => {
  let app: INestApplication;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;
  const previousToken = process.env['ASAAS_WEBHOOK_TOKEN'];

  beforeAll(async () => {
    process.env['ASAAS_WEBHOOK_TOKEN'] = TOKEN;
    ({ app, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
    if (previousToken === undefined) delete process.env['ASAAS_WEBHOOK_TOKEN'];
    else process.env['ASAAS_WEBHOOK_TOKEN'] = previousToken;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('answers exactly 200 (not 201) with an empty body, with no JWT, and forwards the body untouched', async () => {
    backendHttpService.postWithoutTenant.mockResolvedValueOnce(undefined);

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(backendHttpService.postWithoutTenant).toHaveBeenCalledWith(
      '/internal/billing/webhooks/asaas',
      BODY,
    );
  });

  it('passes the web-only guard with the gateway shared-secret header alone (the route carries no @BypassWebOnlyGuard)', async () => {
    backendHttpService.postWithoutTenant.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send(BODY);

    // The per-IP throttle is skipped in `local`, so its absence on this route is pinned by the unit
    // spec (`@SkipThrottle()` metadata), not here.
    expect(res.status).toBe(200);
  });

  it('refuses a request that did not come through the gateway (no shared-secret header) with 401', async () => {
    const supertest = (await import('supertest')).default;

    const res = await supertest(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send(BODY);

    expect(res.status).toBe(401);
    expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong token', 'wrong-token'],
    ['a missing token', undefined],
  ])('answers 401 and calls no backend for %s', async (_label, token) => {
    const agent = request(app.getHttpServer()).post(URL);
    if (token) agent.set('asaas-access-token', token);

    const res = await agent.send(BODY);

    expect(res.status).toBe(401);
    expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('forwards a backend failure as non-2xx so Asaas retries', async () => {
    backendHttpService.postWithoutTenant.mockRejectedValueOnce(
      new HttpException({ title: 'Service Unavailable', status: 503 }, 503),
    );

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send(BODY);

    expect(res.status).toBe(503);
  });
});
