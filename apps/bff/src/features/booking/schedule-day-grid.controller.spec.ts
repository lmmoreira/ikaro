import { makeBackendHttp } from '../../test/backend-http.mock';
import { DayGridResponse } from './schedule.types';
import { ScheduleDayGridController } from './schedule-day-grid.controller';

const mockResponse: DayGridResponse = {
  date: '2026-06-01',
  columns: [
    {
      resourceId: '00000000-0000-4000-8000-000000000001',
      name: 'Estúdio 1',
      type: 'ROOM',
      blocks: [
        {
          startsAt: '2026-06-01T13:00:00.000Z',
          endsAt: '2026-06-01T15:00:00.000Z',
          kind: 'BOOKING',
          refId: '00000000-0000-4000-8000-0000000000b1',
          gap: { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' },
        },
      ],
    },
  ],
};

describe('ScheduleDayGridController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('get()', () => {
    it('calls GET /schedule/day-grid with the date query param', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(mockResponse),
      });
      const controller = new ScheduleDayGridController(backendHttp);

      const result = await controller.get({ date: '2026-06-01' });

      expect(backendHttp.get).toHaveBeenCalledWith('/schedule/day-grid', { date: '2026-06-01' });
      expect(result).toEqual(mockResponse);
    });
  });
});
