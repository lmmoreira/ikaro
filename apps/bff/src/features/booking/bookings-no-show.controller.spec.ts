import { makeBackendHttp } from '../../test/backend-http.mock';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { CorrectNoShowBodySchema, MarkNoShowBodySchema } from './bookings.schemas';
import { BookingsNoShowController } from './bookings-no-show.controller';

const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

describe('BookingsNoShowController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('markNoShow()', () => {
    it('forwards the optional reason to the backend route', async () => {
      const response = { bookingId: BOOKING_ID, status: 'NO_SHOW' };
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(response) });
      const controller = new BookingsNoShowController(backendHttp);

      const result = await controller.markNoShow(BOOKING_ID, { reason: 'Não atendeu' });

      expect(backendHttp.post).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/no-show`, {
        reason: 'Não atendeu',
      });
      expect(result).toBe(response);
    });

    it('is restricted to STAFF and MANAGER', () => {
      expect(Reflect.getMetadata(ROLES_KEY, BookingsNoShowController.prototype.markNoShow)).toEqual(
        ['MANAGER', 'STAFF'],
      );
    });

    it('accepts an empty body, trims the reason and caps it at 500 characters', () => {
      expect(MarkNoShowBodySchema.parse(undefined)).toEqual({});
      expect(MarkNoShowBodySchema.parse({ reason: '  ok  ' })).toEqual({ reason: 'ok' });
      expect(MarkNoShowBodySchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    });
  });

  describe('correctNoShow()', () => {
    it('forwards the correction to the backend route', async () => {
      const response = {
        bookingId: BOOKING_ID,
        status: 'COMPLETED',
        completedAt: '2026-06-01T15:00:00.000Z',
      };
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(response) });
      const controller = new BookingsNoShowController(backendHttp);
      const body = { correctedStatus: 'COMPLETED' as const, reason: 'Cliente foi atendido.' };

      const result = await controller.correctNoShow(BOOKING_ID, body);

      expect(backendHttp.post).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/no-show/correct`,
        body,
      );
      expect(result).toBe(response);
    });

    it('is restricted to MANAGER only', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, BookingsNoShowController.prototype.correctNoShow),
      ).toEqual(['MANAGER']);
    });

    it('requires COMPLETED and a 10–500 character trimmed reason', () => {
      const ok = { correctedStatus: 'COMPLETED', reason: 'Cliente foi atendido.' };
      expect(CorrectNoShowBodySchema.safeParse(ok).success).toBe(true);
      expect(
        CorrectNoShowBodySchema.safeParse({ ...ok, correctedStatus: 'CANCELLED' }).success,
      ).toBe(false);
      expect(CorrectNoShowBodySchema.safeParse({ ...ok, reason: '   curto   ' }).success).toBe(
        false,
      );
      expect(CorrectNoShowBodySchema.safeParse({ ...ok, reason: 'x'.repeat(501) }).success).toBe(
        false,
      );
      expect(CorrectNoShowBodySchema.safeParse({ correctedStatus: 'COMPLETED' }).success).toBe(
        false,
      );
    });
  });
});
