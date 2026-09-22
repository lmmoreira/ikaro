import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  activateService,
  createService,
  deactivateService,
  getService,
  getServiceIntakeSchema,
  listServices,
  publishServiceIntakeSchema,
  updateService,
  updateServiceBookingPolicy,
  updateServiceLegs,
  updateServiceResourceRequirements,
} from './services';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const service = { serviceId: 'svc-1', name: 'Lavagem Completa', isActive: true };

describe('listServices', () => {
  it('calls GET /services and returns the list', async () => {
    mock.onGet('/services').reply(200, { items: [service], total: 1 });
    const res = await listServices();
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
  });
});

describe('getService', () => {
  it('calls GET /services/:id and returns the service', async () => {
    mock.onGet('/services/svc-1').reply(200, service);
    const res = await getService('svc-1');
    expect(res).toMatchObject(service);
  });
});

describe('createService', () => {
  it('calls POST /services with body', async () => {
    mock.onPost('/services').reply(201, service);
    const res = await createService({
      name: 'Lavagem Completa',
      priceAmount: 80,
      durationMinutes: 60,
      loyaltyPointsValue: 10,
    });
    expect(res).toMatchObject(service);
  });
});

describe('activateService', () => {
  it('calls PATCH /services/:id/activate', async () => {
    mock.onPatch('/services/svc-1/activate').reply(200, { id: 'svc-1', isActive: true });
    await expect(activateService('svc-1')).resolves.toBeUndefined();
  });
});

describe('updateService', () => {
  it('calls PATCH /services/:id with body', async () => {
    mock.onPatch('/services/svc-1').reply(200, { ...service, name: 'Lavagem Premium' });
    const res = await updateService('svc-1', { name: 'Lavagem Premium' });
    expect(res.name).toBe('Lavagem Premium');
  });
});

describe('deactivateService', () => {
  it('calls DELETE /services/:id', async () => {
    mock.onDelete('/services/svc-1').reply(204);
    await expect(deactivateService('svc-1')).resolves.toBeUndefined();
  });
});

describe('updateServiceResourceRequirements', () => {
  it('calls PATCH /services/:id/resource-requirements with body', async () => {
    const body = {
      resourceRequirements: [{ type: 'STAFF' as const, selectionMode: 'CUSTOMER_CHOICE' as const }],
    };
    mock
      .onPatch('/services/svc-1/resource-requirements')
      .reply(200, { id: 'svc-1', resourceRequirements: body.resourceRequirements });
    const res = await updateServiceResourceRequirements('svc-1', body);
    expect(res.resourceRequirements).toHaveLength(1);
  });
});

describe('updateServiceLegs', () => {
  it('calls PUT /services/:id/legs with body', async () => {
    const body = {
      legs: [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 20,
          resourceRequirements: [{ type: 'ROOM' as const, selectionMode: 'AUTO_ANY' as const }],
        },
      ],
    };
    mock
      .onPut('/services/svc-1/legs')
      .reply(200, { id: 'svc-1', legs: body.legs, totalSpanMinutes: 20 });
    const res = await updateServiceLegs('svc-1', body);
    expect(res.totalSpanMinutes).toBe(20);
  });
});

describe('updateServiceBookingPolicy', () => {
  it('calls PATCH /services/:id/booking-policy with body', async () => {
    mock
      .onPatch('/services/svc-1/booking-policy')
      .reply(200, { id: 'svc-1', bookingPolicy: { recurrenceEligible: true } });
    const res = await updateServiceBookingPolicy('svc-1', { recurrenceEligible: true });
    expect(res.bookingPolicy.recurrenceEligible).toBe(true);
  });
});

describe('publishServiceIntakeSchema', () => {
  it('calls POST /services/:id/intake-schema with body', async () => {
    const body = {
      questions: [{ fieldKey: 'q', label: 'Q', type: 'FREE_TEXT' as const, required: false }],
      consentText: 'Concordo',
    };
    mock.onPost('/services/svc-1/intake-schema').reply(201, { id: 'schema-1', version: 1 });
    const res = await publishServiceIntakeSchema('svc-1', body);
    expect(res.version).toBe(1);
  });
});

describe('getServiceIntakeSchema', () => {
  it('calls GET /services/:id/intake-schema', async () => {
    mock.onGet('/services/svc-1/intake-schema').reply(200, { active: null, history: [] });
    const res = await getServiceIntakeSchema('svc-1');
    expect(res.active).toBeNull();
    expect(res.history).toEqual([]);
  });
});
