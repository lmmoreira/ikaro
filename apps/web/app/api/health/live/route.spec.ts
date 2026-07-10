import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health/live', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });
});
