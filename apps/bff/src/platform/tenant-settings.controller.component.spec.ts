import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantSettingsResponse } from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  TENANT_ID,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../test/component-test.helpers';

const settingsResponse: TenantSettingsResponse = {
  tenantId: TENANT_ID,
  name: 'Lavacar Estrela',
  slug: 'lavacar-estrela',
  loyalty: {
    expiryDays: 180,
    enableNotifications: true,
    expiryWarningDays: 7,
    notificationMinPoints: 10,
    pointsPerCurrencyUnit: 1,
  },
  booking: {
    cancellationWindowHours: 48,
    autoApproveEnabled: false,
    minBookingAdvanceHours: 2,
    maxBookingAdvanceDays: 60,
    serviceBufferMinutes: 30,
    slotGranularityMinutes: 30,
  },
  businessHours: {
    timezone: 'America/Sao_Paulo',
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: { open: '09:00', close: '14:00' },
    sunday: null,
  },
  localization: {
    countryCode: 'BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    language: 'pt-BR',
    decimalPlaces: 2,
  },
};

describe('TenantSettingsController (component)', () => {
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

  describe('authentication and role gates', () => {
    it('GET /v1/tenants/settings → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/tenants/settings');
      expect(res.status).toBe(401);
    });

    it('GET /v1/tenants/settings → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/tenants/settings → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ settings: { loyalty: { expiryDays: 90 } } });
      expect(res.status).toBe(403);
    });
  });

  describe('getSettings', () => {
    it('GET /v1/tenants/settings → 200, proxies to backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(settingsResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(TENANT_ID);
      expect(res.body.loyalty.expiryDays).toBe(180);
      expect(res.body.businessHours.sunday).toBeNull();
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/settings');
    });
  });

  describe('updateSettings', () => {
    it('PATCH /v1/tenants/settings → 200, forwards the parsed body and returns the backend response', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(settingsResponse);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ settings: { loyalty: { expiryDays: 365 } } });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith('/tenants/settings', {
        settings: { loyalty: { expiryDays: 365 } },
      });
      expect(res.body.loyalty.expiryDays).toBe(180);
    });

    it('round-trip: PATCH a field then GET reflects the persisted value', async () => {
      setupActiveGuardMock(httpService);
      const updated: TenantSettingsResponse = {
        ...settingsResponse,
        loyalty: { ...settingsResponse.loyalty, expiryDays: 365 },
      };
      backendHttpService.patch.mockResolvedValueOnce(updated);

      const patchRes = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ settings: { loyalty: { expiryDays: 365 } } });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.loyalty.expiryDays).toBe(365);

      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(updated);

      const getRes = await request(app.getHttpServer())
        .get('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.loyalty.expiryDays).toBe(365);
    });

    it('PATCH /v1/tenants/settings → 400 for an empty settings object', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ settings: {} });

      expect(res.status).toBe(400);
      expect(backendHttpService.patch).not.toHaveBeenCalled();
    });

    it('PATCH /v1/tenants/settings → 400 for an unknown key inside settings', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ settings: { notACategory: { foo: 'bar' } } });

      expect(res.status).toBe(400);
      expect(backendHttpService.patch).not.toHaveBeenCalled();
    });

    it('PATCH /v1/tenants/settings → forwards the backend error status (e.g. 422 invalid field)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ status: 422, detail: 'invalid timezone' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ settings: { businessHours: { timezone: 'Not/AZone' } } });

      expect(res.status).toBe(422);
    });
  });
});
