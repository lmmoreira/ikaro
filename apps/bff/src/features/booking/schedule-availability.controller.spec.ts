import { HttpException, HttpStatus } from '@nestjs/common';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { AvailabilityResponse } from './schedule.types';
import { ScheduleAvailabilityController } from './schedule-availability.controller';

const SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_SLUG = 'lavacar-test';
const DATE = '2026-06-01';

const mockAvailability: AvailabilityResponse = {
  date: DATE,
  slots: [
    { startsAt: `${DATE}T12:00:00.000Z`, endsAt: `${DATE}T13:00:00.000Z` },
    { startsAt: `${DATE}T12:30:00.000Z`, endsAt: `${DATE}T13:30:00.000Z` },
  ],
  available: true,
};

describe('ScheduleAvailabilityController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('get()', () => {
    it('resolves tenant slug and calls backend getForPublic', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest.fn().mockResolvedValue(mockAvailability),
      });
      const controller = new ScheduleAvailabilityController(backendHttp);

      const result = await controller.get(TENANT_SLUG, { date: DATE, serviceIds: SERVICE_ID });

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/tenants/by-slug/${TENANT_SLUG}`);
      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        `/schedule/availability?date=${DATE}&serviceIds=${SERVICE_ID}`,
        TENANT_ID,
      );
      expect(result.available).toBe(true);
      expect(result.slots).toHaveLength(2);
    });

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new ScheduleAvailabilityController(backendHttp);

      const err = await controller
        .get(undefined, { date: DATE, serviceIds: SERVICE_ID })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('propagates backend 422 for past date', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest
          .fn()
          .mockRejectedValue(
            new HttpException(
              { status: 422, detail: 'past date' },
              HttpStatus.UNPROCESSABLE_ENTITY,
            ),
          ),
      });
      const controller = new ScheduleAvailabilityController(backendHttp);

      const err = await controller
        .get(TENANT_SLUG, { date: '2020-01-01', serviceIds: SERVICE_ID })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('propagates backend 400 for invalid serviceId', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest
          .fn()
          .mockRejectedValue(
            new HttpException({ status: 400, detail: 'service not found' }, HttpStatus.BAD_REQUEST),
          ),
      });
      const controller = new ScheduleAvailabilityController(backendHttp);

      const err = await controller
        .get(TENANT_SLUG, { date: DATE, serviceIds: '00000000-0000-7000-8000-000000009999' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns available:false and empty slots when backend returns no slots', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest.fn().mockResolvedValue({ date: DATE, slots: [], available: false }),
      });
      const controller = new ScheduleAvailabilityController(backendHttp);

      const result = await controller.get(TENANT_SLUG, { date: DATE, serviceIds: SERVICE_ID });

      expect(result.available).toBe(false);
      expect(result.slots).toHaveLength(0);
    });
  });
});
