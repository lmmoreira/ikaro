import { makeBackendHttp } from '../test/backend-http.mock';
import { ScheduleOpeningResponse } from './schedule.types';
import { ScheduleOpeningController } from './schedule-opening.controller';

const mockOpening: ScheduleOpeningResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  date: '2026-12-28',
  startTime: '09:00',
  endTime: '14:00',
  notes: null,
  createdBy: '00000000-0000-4000-8000-000000000002',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ScheduleOpeningController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('list()', () => {
    it('calls GET /schedule/openings with from/to query params', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ items: [mockOpening] }),
      });
      const controller = new ScheduleOpeningController(backendHttp);

      const result = await controller.list({ from: '2026-12-01', to: '2026-12-31' });

      expect(backendHttp.get).toHaveBeenCalledWith(
        '/schedule/openings?from=2026-12-01&to=2026-12-31',
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('create()', () => {
    it('calls POST /schedule/openings and returns the created opening', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockOpening),
      });
      const controller = new ScheduleOpeningController(backendHttp);

      const result = await controller.create({
        date: '2026-12-28',
        startTime: '09:00',
        endTime: '14:00',
      });

      expect(backendHttp.post).toHaveBeenCalledWith('/schedule/openings', {
        date: '2026-12-28',
        startTime: '09:00',
        endTime: '14:00',
      });
      expect(result.id).toBe(mockOpening.id);
    });

    it('passes optional notes when provided', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue({ ...mockOpening, notes: 'Special event' }),
      });
      const controller = new ScheduleOpeningController(backendHttp);

      await controller.create({
        date: '2026-12-28',
        startTime: '09:00',
        endTime: '14:00',
        notes: 'Special event',
      });

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/schedule/openings',
        expect.objectContaining({ notes: 'Special event' }),
      );
    });
  });

  describe('remove()', () => {
    it('calls DELETE /schedule/openings/:id', async () => {
      const backendHttp = makeBackendHttp({
        delete: jest.fn().mockResolvedValue(undefined),
      });
      const controller = new ScheduleOpeningController(backendHttp);

      await controller.remove('00000000-0000-4000-8000-000000000001');

      expect(backendHttp.delete).toHaveBeenCalledWith(
        '/schedule/openings/00000000-0000-4000-8000-000000000001',
      );
    });
  });
});
