import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { getCustomerById, getCustomerProfile, searchCustomers, updateCustomerProfile } from './api';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const profile = {
  customerId: 'c-1',
  email: 'maria@example.com',
  name: 'Maria',
  phone: null,
  defaultAddress: null,
};

describe('getCustomerProfile', () => {
  it('calls GET /customers/me', async () => {
    mock.onGet('/customers/me').reply(200, profile);
    const res = await getCustomerProfile();
    expect(res.customerId).toBe('c-1');
  });
});

describe('getCustomerById', () => {
  it('calls GET /customers/:id', async () => {
    mock.onGet('/customers/c-1').reply(200, profile);
    const res = await getCustomerById('c-1');
    expect(res.customerId).toBe('c-1');
  });
});

describe('searchCustomers', () => {
  it('calls GET /customers with params', async () => {
    mock.onGet('/customers').reply(200, { items: [], total: 0 });
    const res = await searchCustomers('jo', 5);
    expect(res.items).toHaveLength(0);
  });
});

describe('updateCustomerProfile', () => {
  it('calls PATCH /customers/me with body', async () => {
    mock.onPatch('/customers/me').reply(200, { ...profile, phone: '11999998888' });
    const res = await updateCustomerProfile({ phone: '11999998888' });
    expect(res.phone).toBe('11999998888');
  });
});
