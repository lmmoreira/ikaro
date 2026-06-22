import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '../bff-client';
import {
  createService,
  deactivateService,
  getService,
  listServices,
  updateService,
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
