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

  it('GET /:id forwards to the backend by-id read and returns the item', async () => {
    const item = {
      id: mockSchedule.id,
      customerId: '00000000-0000-4000-8000-0000000000c1',
      serviceId: '00000000-0000-4000-8000-000000000002',
      serviceName: 'Sala Aurora',
      recurrence: {
        frequency: 'WEEKLY' as const,
        daysOfWeek: ['tuesday' as const],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: '2026-09-01',
      endsOn: '2026-11-24',
      status: 'ACTIVE' as const,
      assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
      approvalHoldExpiresAt: null,
    };
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(item) });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.get(mockSchedule.id);

    expect(backendHttp.get).toHaveBeenCalledWith(`/recurring-booking-schedules/${mockSchedule.id}`);
    expect(result).toEqual(item);
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
      endsOn: '2026-11-24',
    };

    const result = await controller.request(body);

    expect(backendHttp.post).toHaveBeenCalledWith('/recurring-booking-schedules', body);
    expect(result).toEqual(mockSchedule);
  });

  it('exposes no per-occurrence route (an occurrence is its linked booking)', () => {
    const controller = new RecurringBookingSchedulesController(makeBackendHttp({}));

    expect('skipOrReschedule' in controller).toBe(false);
  });

  it('exposes no pause route', () => {
    const controller = new RecurringBookingSchedulesController(makeBackendHttp({}));

    expect('pause' in controller).toBe(false);
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

  it('POST /:id/approve forwards to the backend with an empty body', async () => {
    const backendHttp = makeBackendHttp({
      post: jest
        .fn()
        .mockResolvedValue({ id: mockSchedule.id, status: 'ACTIVE', occurrenceCount: 5 }),
    });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.approve(mockSchedule.id);

    expect(backendHttp.post).toHaveBeenCalledWith(
      `/recurring-booking-schedules/${mockSchedule.id}/approve`,
      {},
    );
    expect(result).toEqual({ id: mockSchedule.id, status: 'ACTIVE', occurrenceCount: 5 });
  });

  it('POST /:id/reject forwards to the backend with an empty body', async () => {
    const backendHttp = makeBackendHttp({
      post: jest.fn().mockResolvedValue({ id: mockSchedule.id, status: 'CANCELLED' }),
    });
    const controller = new RecurringBookingSchedulesController(backendHttp);

    const result = await controller.reject(mockSchedule.id);

    expect(backendHttp.post).toHaveBeenCalledWith(
      `/recurring-booking-schedules/${mockSchedule.id}/reject`,
      {},
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('restricts approve and reject to STAFF and MANAGER, overriding the class-level roles', () => {
    const roles = (handler: unknown) => Reflect.getMetadata('roles', handler as object);

    expect(roles(RecurringBookingSchedulesController.prototype.approve)).toEqual([
      'MANAGER',
      'STAFF',
    ]);
    expect(roles(RecurringBookingSchedulesController.prototype.reject)).toEqual([
      'MANAGER',
      'STAFF',
    ]);
  });
});
