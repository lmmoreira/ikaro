import { makeBackendHttp } from '../../test/backend-http.mock';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { CorrectBookingNoShowSchema, MarkBookingNoShowSchema } from '@ikaro/validation';
import { CorrectNoShowBodySchema, MarkNoShowBodySchema } from './bookings.schemas';
import { BookingsNoShowController } from './bookings-no-show.controller';

const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

describe('BookingsNoShowController', () => {
  afterEach(() => jest.resetAllMocks());

  it('validates request bodies with the schemas shared with the backend', () => {
    expect(MarkNoShowBodySchema).toBe(MarkBookingNoShowSchema);
    expect(CorrectNoShowBodySchema).toBe(CorrectBookingNoShowSchema);
  });

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
  });
});
