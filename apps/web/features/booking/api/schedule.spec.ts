import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  createClosure,
  createOpening,
  listClosures,
  listOpenings,
  removeClosure,
  removeOpening,
} from './schedule';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('listClosures', () => {
  it('calls GET /schedule/closures with date params', async () => {
    mock.onGet('/schedule/closures').reply(200, { items: [] });
    const res = await listClosures('2026-07-01', '2026-07-31');
    expect(res.items).toHaveLength(0);
  });
});

describe('createClosure', () => {
  it('calls POST /schedule/closures', async () => {
    const closure = {
      id: 'c-1',
      date: '2026-07-04',
      reason: 'HOLIDAY',
      startTime: null,
      endTime: null,
      notes: null,
      createdBy: 'staff-1',
      createdAt: '',
    };
    mock.onPost('/schedule/closures').reply(201, closure);
    const res = await createClosure({ date: '2026-07-04', reason: 'HOLIDAY' });
    expect(res.id).toBe('c-1');
  });
});

describe('removeClosure', () => {
  it('calls DELETE /schedule/closures/:id', async () => {
    mock.onDelete('/schedule/closures/c-1').reply(204);
    await expect(removeClosure('c-1')).resolves.toBeUndefined();
  });
});

describe('listOpenings', () => {
  it('calls GET /schedule/openings with date params', async () => {
    mock.onGet('/schedule/openings').reply(200, { items: [] });
    const res = await listOpenings('2026-07-01', '2026-07-31');
    expect(res.items).toHaveLength(0);
  });
});

describe('createOpening', () => {
  it('calls POST /schedule/openings', async () => {
    const opening = {
      id: 'o-1',
      date: '2026-07-05',
      startTime: '09:00',
      endTime: '17:00',
      notes: null,
      createdBy: 'staff-1',
      createdAt: '',
    };
    mock.onPost('/schedule/openings').reply(201, opening);
    const res = await createOpening({ date: '2026-07-05', startTime: '09:00', endTime: '17:00' });
    expect(res.id).toBe('o-1');
  });
});

describe('removeOpening', () => {
  it('calls DELETE /schedule/openings/:id', async () => {
    mock.onDelete('/schedule/openings/o-1').reply(204);
    await expect(removeOpening('o-1')).resolves.toBeUndefined();
  });
});
