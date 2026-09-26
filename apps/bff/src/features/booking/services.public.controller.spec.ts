import { HttpException } from '@nestjs/common';
import { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { GetPublicServiceIntakeSchemaResult } from './services.types';
import { ServicesPublicController } from './services.public.controller';

const mockServiceResponse: HotsiteServiceResponse = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Lavagem Completa',
  description: null,
  price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ServicesPublicController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('list()', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new ServicesPublicController(backendHttp);

      const err = await controller.list(undefined).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('resolves slug to tenantId then calls GET /services', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      const mockList: HotsiteServiceListResponse = { items: [mockServiceResponse] };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(mockList),
      });
      const controller = new ServicesPublicController(backendHttp);

      const result = await controller.list('lavacar-bh');

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttp.getForPublic).toHaveBeenCalledWith('/services', 'tenant-uuid');
      expect(result).toBe(mockList);
    });
  });

  describe('getIntakeSchema() (M23-S02, UC-068)', () => {
    const SERVICE_ID = '10000000-0000-4000-8000-000000000002';

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new ServicesPublicController(backendHttp);

      const err = await controller.getIntakeSchema(undefined, SERVICE_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('resolves slug to tenantId, calls the public backend path, and maps to active-only shape', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendResult: GetPublicServiceIntakeSchemaResult = {
        active: {
          id: 'schema-uuid',
          version: 1,
          questions: [
            { fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true },
          ],
          consentText: 'Aceito os termos',
          consentVersion: 1,
          requiresNamedAttendees: false,
          participantCountRequired: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(backendResult),
      });
      const controller = new ServicesPublicController(backendHttp);

      const result = await controller.getIntakeSchema('lavacar-bh', SERVICE_ID);

      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/intake-schema/public`,
        'tenant-uuid',
      );
      expect(result).toEqual({ active: backendResult.active });
      expect(result).not.toHaveProperty('history');
    });
  });
});
