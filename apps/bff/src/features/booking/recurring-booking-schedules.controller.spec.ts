import { makeBackendHttp } from '../../test/backend-http.mock';
import { RecurringBookingScheduleResponse } from './recurring-booking-schedules.types';
import { RecurringBookingSchedulesController } from './recurring-booking-schedules.controller';

const mockSchedule: RecurringBookingScheduleResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  approvalHoldExpiresAt: null,
};

describe('RecurringBookingSchedulesController', () => {
  afterEach(() => jest.resetAllMocks());

  it('GET / forwards the validated pagination and status params to the backend list endpoint', async () => {
    const page = {
      items: [],
      pagination: { limit: 10, offset: 20, total: 0, hasMore: false },
    };
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(page) });
    const controller = new RecurringBookingSchedulesController(backendHttp);
    const query = { limit: 10, offset: 20, status: 'PENDING_APPROVAL' as const };

    const result = await controller.list(query);

    expect(backendHttp.get).toHaveBeenCalledWith('/recurring-booking-schedules', query);
    expect(result).toEqual(page);
  });

  it('POST / forwards the body to the backend and returns 201 shape', async () => {
    const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(mockSchedule) });
    const controller = new RecurringBookingSchedulesController(backendHttp);
    const body = {
      serviceId: '00000000-0000-4000-8000-000000000002',
      recurrence: {
        frequency: 'WEEKLY' as const,
        daysOfWeek: ['tuesday' as const],
        startTime: '10:00',
        durationMinutes: 60,
      },
      assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
      resourceIds: ['00000000-0000-4000-8000-000000000003'],
      startsOn: '2026-09-01',
    };

    const result = await controller.request(body);

    expect(backendHttp.post).toHaveBeenCalledWith('/recurring-booking-schedules', body);
    expect(result).toEqual(mockSchedule);
  });

  it('PATCH /:id/occurrences/:occurrenceStart forwards SKIP/RESCHEDULE actions', async () => {
    const backendHttp = makeBackendHttp({
      patch: jest.fn().mockResolvedValue({
        scheduleId: mockSchedule.id,
        occurrenceStart: '2026-09-08T13:00:00.000Z',
        kind: 'SKIPPED',
      }),
    });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.skipOrReschedule(mockSchedule.id, '2026-09-08T13:00:00.000Z', {
      action: 'SKIP',
    });

    expect(backendHttp.patch).toHaveBeenCalledWith(
      `/recurring-booking-schedules/${mockSchedule.id}/occurrences/2026-09-08T13%3A00%3A00.000Z`,
      { action: 'SKIP' },
    );
    expect(result.kind).toBe('SKIPPED');
  });

  it('POST /:id/pause forwards to the backend', async () => {
    const backendHttp = makeBackendHttp({
      post: jest.fn().mockResolvedValue({ id: mockSchedule.id, status: 'PAUSED' }),
    });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.pause(mockSchedule.id);

    expect(backendHttp.post).toHaveBeenCalledWith(
      `/recurring-booking-schedules/${mockSchedule.id}/pause`,
      {},
    );
    expect(result.status).toBe('PAUSED');
  });

  it('POST /:id/end forwards to the backend', async () => {
    const backendHttp = makeBackendHttp({
      post: jest.fn().mockResolvedValue({
        id: mockSchedule.id,
        status: 'CANCELLED',
        cancelledBookingIds: [],
      }),
    });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.end(mockSchedule.id);

    expect(backendHttp.post).toHaveBeenCalledWith(
      `/recurring-booking-schedules/${mockSchedule.id}/end`,
      {},
    );
    expect(result.status).toBe('CANCELLED');
  });
});
