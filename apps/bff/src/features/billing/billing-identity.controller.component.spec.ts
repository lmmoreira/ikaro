import { HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';
import { BillingIdentityBuilder } from '../../test/builders/billing-identity.builder';

describe('BillingController — the billing identity (component, M26-S16)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const read = (jwt: string) =>
    request(app.getHttpServer()).get('/v1/billing/identity').set('Authorization', `Bearer ${jwt}`);

  const save = (jwt: string, body: unknown) =>
    request(app.getHttpServer())
      .put('/v1/billing/identity')
      .set('Authorization', `Bearer ${jwt}`)
      .send(body as object);

  it('GET and PUT → 401 without a token', async () => {
    expect((await request(app.getHttpServer()).get('/v1/billing/identity')).status).toBe(401);
    expect((await request(app.getHttpServer()).put('/v1/billing/identity').send({})).status).toBe(
      401,
    );
  });

  it.each(['STAFF', 'CUSTOMER'])('GET and PUT → 403 for %s, backend never called', async (role) => {
    setupActiveGuardMock(httpService);
    const jwt = role === 'STAFF' ? makeStaffJwt(jwtService) : makeCustomerJwt(jwtService);

    const reading = await read(jwt);
    const writing = await save(jwt, { legalName: 'x' });

    expect([reading.status, writing.status]).toEqual([403, 403]);
    expect(backendHttpService.get).not.toHaveBeenCalled();
    expect(backendHttpService.put).not.toHaveBeenCalled();
  });

  it('GET → 200 for a MANAGER with the backend’s identity', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce(new BillingIdentityBuilder().build());

    const res = await read(makeManagerJwt(jwtService));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(new BillingIdentityBuilder().build());
    expect(backendHttpService.get).toHaveBeenCalledWith('/billing/identity');
  });

  it('PUT → 200 forwards only the declared fields, with an alphanumeric CNPJ untouched', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.put.mockResolvedValueOnce(new BillingIdentityBuilder().build());

    const res = await save(makeManagerJwt(jwtService), {
      taxIdType: 'CNPJ',
      taxId: '12.ABC.345/01DE-35',
      tenantId: 'smuggled',
    });

    expect(res.status).toBe(200);
    expect(backendHttpService.put).toHaveBeenCalledWith('/billing/identity', {
      taxIdType: 'CNPJ',
      taxId: '12.ABC.345/01DE-35',
    });
  });

  it.each([
    ['a taxIdType without a taxId', { taxIdType: 'CPF' }],
    ['a null address', { address: null }],
    ['an unknown taxIdType', { taxIdType: 'SSN', taxId: '1' }],
    ['a legalName over 255 characters', { legalName: 'x'.repeat(256) }],
  ])('PUT → 400 for %s, backend never called', async (_label, body) => {
    setupActiveGuardMock(httpService);

    const res = await save(makeManagerJwt(jwtService), body);

    expect(res.status).toBe(400);
    expect(backendHttpService.put).not.toHaveBeenCalled();
  });

  it('PUT forwards the backend’s typed refusal to the caller, as it came', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.put.mockRejectedValueOnce(
      new HttpException(
        {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          code: 'BILLING_IDENTITY_TAX_ID_INVALID',
          detail: 'invalid',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
    );

    const res = await save(makeManagerJwt(jwtService), { taxId: '123' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BILLING_IDENTITY_TAX_ID_INVALID');
  });
});
