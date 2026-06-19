import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '../bff-client';
import { getCustomerProfile, updateCustomerProfile } from './customers';

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

describe('updateCustomerProfile', () => {
  it('calls PATCH /customers/me with body', async () => {
    mock.onPatch('/customers/me').reply(200, { ...profile, phone: '11999998888' });
    const res = await updateCustomerProfile({ phone: '11999998888' });
    expect(res.phone).toBe('11999998888');
  });
});
