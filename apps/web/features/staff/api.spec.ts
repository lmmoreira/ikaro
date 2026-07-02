import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { deactivateStaff, getStaffMember, inviteStaff, listStaff } from './api';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const staffMember = {
  id: 's-1',
  email: 'ana@acme.com',
  name: 'Ana',
  role: 'STAFF' as const,
  isActive: true,
  createdAt: '',
};

describe('listStaff', () => {
  it('calls GET /staff and returns list', async () => {
    mock.onGet('/staff').reply(200, {
      items: [staffMember],
      pagination: { limit: 50, offset: 0, total: 1, hasMore: false, nextOffset: null },
    });
    const res = await listStaff();
    expect(res.items).toHaveLength(1);
  });
});

describe('getStaffMember', () => {
  it('calls GET /staff/:id', async () => {
    mock.onGet('/staff/s-1').reply(200, staffMember);
    const res = await getStaffMember('s-1');
    expect(res.id).toBe('s-1');
  });
});

describe('inviteStaff', () => {
  it('calls POST /staff/invite', async () => {
    mock
      .onPost('/staff/invite')
      .reply(201, { staffId: 's-2', email: 'bob@acme.com', role: 'STAFF', isActive: false });
    const res = await inviteStaff({
      email: 'bob@acme.com',
      firstName: 'Bob',
      lastName: 'Smith',
      role: 'STAFF',
    });
    expect(res.staffId).toBe('s-2');
  });
});

describe('deactivateStaff', () => {
  it('calls PATCH /staff/:id/deactivate', async () => {
    mock.onPatch('/staff/s-1/deactivate').reply(200, { staffId: 's-1', isActive: false });
    const res = await deactivateStaff('s-1');
    expect(res.isActive).toBe(false);
  });
});
