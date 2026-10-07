import { makeBackendHttp } from '../../test/backend-http.mock';
import { AvailabilityAlertResponse } from '@ikaro/types';
import { AvailabilityAlertsController } from './availability-alerts.controller';

const ALERT_ID = '00000000-0000-4000-8000-000000000001';
const SERVICE_ID = '00000000-0000-4000-8000-000000000002';

const mockAlert: AvailabilityAlertResponse = {
  id: ALERT_ID,
  serviceId: SERVICE_ID,
  preferredResourceId: null,
  criteriaType: 'WEEKLY_PREFERENCE',
  timezone: 'America/Sao_Paulo',
  acceptableStartAt: null,
  acceptableEndAt: null,
  weekdays: ['tuesday'],
  localStartTime: '18:00',
  localEndTime: '20:00',
  durationMinutes: null,
  participantCount: null,
  status: 'ACTIVE',
  expiresAt: '2026-11-04T12:00:00.000Z',
  createdAt: '2026-10-05T12:00:00.000Z',
};

describe('AvailabilityAlertsController', () => {
  afterEach(() => jest.resetAllMocks());

  it('POST / forwards the body to the backend', async () => {
    const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(mockAlert) });
    const controller = new AvailabilityAlertsController(backendHttp);
    const body = {
      serviceId: SERVICE_ID,
      criteriaType: 'WEEKLY_PREFERENCE' as const,
      weekdays: ['tuesday' as const],
      localStartTime: '18:00',
      localEndTime: '20:00',
    };

    const result = await controller.create(body);

    expect(backendHttp.post).toHaveBeenCalledWith('/availability-alerts', body);
    expect(result).toEqual(mockAlert);
  });

  it('GET / lists the alerts through the backend', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({ items: [mockAlert] }),
    });
    const controller = new AvailabilityAlertsController(backendHttp);

    const result = await controller.list();

    expect(backendHttp.get).toHaveBeenCalledWith('/availability-alerts');
    expect(result.items).toEqual([mockAlert]);
  });

  it('PATCH /:id forwards the id and the body to the backend', async () => {
    const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(mockAlert) });
    const controller = new AvailabilityAlertsController(backendHttp);

    const result = await controller.update(ALERT_ID, { durationMinutes: 60 });

    expect(backendHttp.patch).toHaveBeenCalledWith(`/availability-alerts/${ALERT_ID}`, {
      durationMinutes: 60,
    });
    expect(result).toEqual(mockAlert);
  });

  it('DELETE /:id forwards the cancel to the backend', async () => {
    const backendHttp = makeBackendHttp({
      delete: jest.fn().mockResolvedValue({ id: ALERT_ID, status: 'CANCELLED' }),
    });
    const controller = new AvailabilityAlertsController(backendHttp);

    const result = await controller.cancel(ALERT_ID);

    expect(backendHttp.delete).toHaveBeenCalledWith(`/availability-alerts/${ALERT_ID}`);
    expect(result).toEqual({ id: ALERT_ID, status: 'CANCELLED' });
  });
});
