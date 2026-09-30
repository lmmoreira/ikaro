import { makeBackendHttp } from '../../test/backend-http.mock';
import {
  SchedulingExceptionBulkResultResponse,
  SchedulingExceptionListResponse,
} from './scheduling-exceptions.types';
import { SchedulingExceptionsController } from './scheduling-exceptions.controller';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';

const listResponse: SchedulingExceptionListResponse = {
  items: [
    {
      id: ID_A,
      sourceType: 'RESOURCE_DEACTIVATION',
      sourceId: '00000000-0000-4000-8000-0000000000c1',
      affectedType: 'BOOKING',
      affectedId: '00000000-0000-4000-8000-0000000000d1',
      status: 'OPEN',
      alternatives: [
        { resourceId: '00000000-0000-4000-8000-0000000000e1', resourceName: 'Sala 2' },
      ],
      createdAt: '2027-03-10T12:00:00.000Z',
      booking: {
        contactName: 'Ana Souza',
        scheduledAt: '2027-03-12T12:00:00.000Z',
        totalDurationMins: 60,
        serviceNames: ['Sessão'],
        status: 'APPROVED',
        resourceName: 'Sala 1',
      },
    },
  ],
};

const bulkResponse: SchedulingExceptionBulkResultResponse = {
  results: [
    { exceptionId: ID_A, outcome: 'RESOLVED' },
    {
      exceptionId: ID_B,
      outcome: 'STILL_OPEN',
      errorCode: 'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID',
    },
  ],
};

describe('SchedulingExceptionsController', () => {
  afterEach(() => jest.resetAllMocks());

  it('GET / forwards the status filter to the backend list endpoint', async () => {
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(listResponse) });
    const controller = new SchedulingExceptionsController(backendHttp);

    const result = await controller.list({ status: 'OPEN' });

    expect(backendHttp.get).toHaveBeenCalledWith('/scheduling-exceptions', { status: 'OPEN' });
    expect(result).toEqual(listResponse);
  });

  it('POST /resolve forwards the whole body and returns the per-entry results untouched', async () => {
    const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(bulkResponse) });
    const controller = new SchedulingExceptionsController(backendHttp);
    const body = {
      exceptionIds: [ID_A, ID_B],
      resolutionType: 'REASSIGN' as const,
      target: { mode: 'AUTO' as const },
    };

    const result = await controller.resolve(body);

    expect(backendHttp.post).toHaveBeenCalledWith('/scheduling-exceptions/resolve', body);
    expect(result).toEqual(bulkResponse);
  });

  it('POST /dismiss forwards the ids and reason', async () => {
    const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(bulkResponse) });
    const controller = new SchedulingExceptionsController(backendHttp);
    const body = { exceptionIds: [ID_A], reason: 'handled by phone' };

    const result = await controller.dismiss(body);

    expect(backendHttp.post).toHaveBeenCalledWith('/scheduling-exceptions/dismiss', body);
    expect(result).toEqual(bulkResponse);
  });

  it('exposes no per-id route', () => {
    const controller = new SchedulingExceptionsController(makeBackendHttp({}));

    expect('resolveOne' in controller).toBe(false);
    expect('dismissOne' in controller).toBe(false);
  });
});
