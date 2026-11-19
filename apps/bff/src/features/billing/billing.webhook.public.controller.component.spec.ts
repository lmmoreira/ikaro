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

  it('refuses an oversized body before any handler runs: the body parser rejects it and no backend call is made', async () => {
    const oversized = { id: 'evt_big&1', payload: 'x'.repeat(70 * 1024) };

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send(oversized);

    // The shared error filter maps the parser's 413 to a generic non-2xx (it only knows HttpException);
    // what matters here is that the request is refused and never reaches the backend.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('caps a URL-encoded body to the same 64 KB: the global form parser never reads this public route', async () => {
    const oversizedForm = `payload=${'x'.repeat(70 * 1024)}`;

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(oversizedForm);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('accepts a normal-sized provider payload under the 64 KB cap', async () => {
    backendHttpService.postWithoutTenant.mockResolvedValueOnce(undefined);

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send({ id: 'evt_ok&1', payload: 'x'.repeat(20 * 1024) });

    expect(res.status).toBe(200);
  });

  it('checks the token before looking at the body: a JSON array without the token is a 401, not a 400', async () => {
    const res = await request(app.getHttpServer()).post(URL).send([1, 2, 3]);

    expect(res.status).toBe(401);
    expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('forwards an authenticated body of any shape untouched: the backend decides it is unreadable', async () => {
    backendHttpService.postWithoutTenant.mockResolvedValueOnce(undefined);

    const res = await request(app.getHttpServer())
      .post(URL)
      .set('asaas-access-token', TOKEN)
      .send([1, 2, 3]);

    expect(res.status).toBe(200);
    expect(backendHttpService.postWithoutTenant).toHaveBeenCalledWith(
      '/internal/billing/webhooks/asaas',
      [1, 2, 3],
    );
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
