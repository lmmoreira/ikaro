import { makeBackendHttp } from '../test/backend-http.mock';
import { ScheduleClosureResponse } from './schedule.types';
import { ScheduleController } from './schedule.controller';

const mockClosure: ScheduleClosureResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  date: '2026-12-25',
  startTime: null,
  endTime: null,
  reason: 'HOLIDAY',
  notes: null,
  createdBy: '00000000-0000-4000-8000-000000000002',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ScheduleController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('list()', () => {
    it('calls GET /schedule/closures with from/to query params', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ items: [mockClosure] }),
      });
      const controller = new ScheduleController(backendHttp);

      const result = await controller.list({ from: '2026-12-01', to: '2026-12-31' });

      expect(backendHttp.get).toHaveBeenCalledWith(
        '/schedule/closures?from=2026-12-01&to=2026-12-31',
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('create()', () => {
    it('calls POST /schedule/closures and returns the created closure', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockClosure),
      });
      const controller = new ScheduleController(backendHttp);

      const result = await controller.create({ date: '2026-12-25', reason: 'HOLIDAY' });

      expect(backendHttp.post).toHaveBeenCalledWith('/schedule/closures', {
        date: '2026-12-25',
        reason: 'HOLIDAY',
      });
      expect(result.id).toBe(mockClosure.id);
    });

    it('passes startTime and endTime for partial closures', async () => {
      const partialClosure = { ...mockClosure, startTime: '10:00', endTime: '12:00' };
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(partialClosure),
      });
      const controller = new ScheduleController(backendHttp);

      await controller.create({
        date: '2026-12-26',
        reason: 'MAINTENANCE',
        startTime: '10:00',
        endTime: '12:00',
      });

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/schedule/closures',
        expect.objectContaining({ startTime: '10:00', endTime: '12:00' }),
      );
    });
  });

  describe('remove()', () => {
    it('calls DELETE /schedule/closures/:id', async () => {
      const backendHttp = makeBackendHttp({
        delete: jest.fn().mockResolvedValue(undefined),
      });
      const controller = new ScheduleController(backendHttp);

      await controller.remove('00000000-0000-4000-8000-000000000001');

      expect(backendHttp.delete).toHaveBeenCalledWith(
        '/schedule/closures/00000000-0000-4000-8000-000000000001',
      );
    });
  });
});
