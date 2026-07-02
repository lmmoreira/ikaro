import { HttpException, HttpStatus } from '@nestjs/common';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { AvailabilitySummaryResponse } from './schedule.types';
import { ScheduleAvailabilitySummaryController } from './schedule-availability-summary.controller';

const SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_SLUG = 'lavacar-test';
const FROM = '2026-06-01';
const TO = '2026-06-07';

const mockSummary: AvailabilitySummaryResponse = [
  { date: '2026-06-01', available: true, slotCount: 12 },
  { date: '2026-06-02', available: false, slotCount: 0 },
];

describe('ScheduleAvailabilitySummaryController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('get()', () => {
    it('resolves tenant slug and calls backend getForPublic', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest.fn().mockResolvedValue(mockSummary),
      });
      const controller = new ScheduleAvailabilitySummaryController(backendHttp);

      const result = await controller.get(TENANT_SLUG, {
        from: FROM,
        to: TO,
        serviceIds: SERVICE_ID,
      });

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/tenants/by-slug/${TENANT_SLUG}`);
      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        `/schedule/availability/summary?from=${FROM}&to=${TO}&serviceIds=${SERVICE_ID}`,
        TENANT_ID,
      );
      expect(result).toHaveLength(2);
      expect(result[0].slotCount).toBe(12);
    });

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new ScheduleAvailabilitySummaryController(backendHttp);

      const err = await controller
        .get(undefined, { from: FROM, to: TO, serviceIds: SERVICE_ID })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('propagates backend 422 for invalid range', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest
          .fn()
          .mockRejectedValue(
            new HttpException(
              { status: 422, detail: 'from > to' },
              HttpStatus.UNPROCESSABLE_ENTITY,
            ),
          ),
      });
      const controller = new ScheduleAvailabilitySummaryController(backendHttp);

      const err = await controller
        .get(TENANT_SLUG, { from: TO, to: FROM, serviceIds: SERVICE_ID })
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
      const controller = new ScheduleAvailabilitySummaryController(backendHttp);

      const err = await controller
        .get(TENANT_SLUG, { from: FROM, to: TO, serviceIds: SERVICE_ID })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns array with available and unavailable days', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
        getForPublic: jest.fn().mockResolvedValue(mockSummary),
      });
      const controller = new ScheduleAvailabilitySummaryController(backendHttp);

      const result = await controller.get(TENANT_SLUG, {
        from: FROM,
        to: TO,
        serviceIds: SERVICE_ID,
      });

      expect(result.some((d) => d.available)).toBe(true);
      expect(result.some((d) => !d.available)).toBe(true);
    });
  });
});
