import { HttpException } from '@nestjs/common';
import { HotsiteServiceListResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { GetPublicServiceIntakeSchemaResult } from './services.types';
import { ServicesPublicController } from './services.public.controller';
import { HotsiteServiceBuilder } from '../../test/builders/hotsite-service.builder';

const mockServiceResponse = new HotsiteServiceBuilder().build();

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
      expect(result).toEqual(mockList);
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

  describe('getResourceOptions() (M23-S29)', () => {
    const SERVICE_ID = '10000000-0000-4000-8000-000000000003';
    const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const controller = new ServicesPublicController(makeBackendHttp());

      const err = await controller
        .getResourceOptions(undefined, SERVICE_ID)
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('resolves slug to tenantId, calls the backend path and maps id/name only', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue({
          requirements: [
            {
              serviceId: SERVICE_ID,
              legIndex: null,
              resourceType: 'STAFF',
              selectionMode: 'CUSTOMER_CHOICE',
              requiredQuantity: 1,
              options: [{ resourceId: 'r-1', name: 'Ana', refId: 'staff-uuid', hours: {} }],
            },
          ],
        }),
      });
      const controller = new ServicesPublicController(backendHttp);

      const result = await controller.getResourceOptions('lavacar-bh', SERVICE_ID);

      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/resource-options`,
        'tenant-uuid',
      );
      expect(result.requirements[0].options).toEqual([{ resourceId: 'r-1', name: 'Ana' }]);
    });
  });

  describe('getQuote() (M23-S29)', () => {
    const SERVICE_ID = '10000000-0000-4000-8000-000000000003';
    const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const controller = new ServicesPublicController(makeBackendHttp());

      const err = await controller.getQuote(undefined, SERVICE_ID, {}).catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('forwards the chosen duration to the backend quote path and maps the result', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest
          .fn()
          .mockResolvedValue({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } }),
      });
      const controller = new ServicesPublicController(backendHttp);

      const result = await controller.getQuote('lavacar-bh', SERVICE_ID, { durationMinutes: 90 });

      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/quote`,
        'tenant-uuid',
        { durationMinutes: 90 },
      );
      expect(result).toEqual({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } });
    });
  });
});
