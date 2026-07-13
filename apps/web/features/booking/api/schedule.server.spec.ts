import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import {
  fetchScheduleClosures,
  fetchScheduleOpenings,
  ScheduleFetchError,
} from './schedule.server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('fetchScheduleClosures', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /schedule/closures with the auth token', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchScheduleClosures('token-123', '2026-07-01', '2026-07-31');

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/schedule/closures?from=2026-07-01&to=2026-07-31',
    );
    expect(result.items).toHaveLength(0);
  });

  it('throws ScheduleFetchError on a non-ok response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      fetchScheduleClosures('token-123', '2026-07-01', '2026-07-31'),
    ).rejects.toMatchObject(new ScheduleFetchError(500));
  });

  it('parses code from the response body instead of discarding it', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'BOOKING_SCHEDULE_CLOSURE_NOT_FOUND' }), {
        status: 404,
      }),
    );

    await expect(
      fetchScheduleClosures('token-123', '2026-07-01', '2026-07-31'),
    ).rejects.toMatchObject({
      status: 404,
      code: 'BOOKING_SCHEDULE_CLOSURE_NOT_FOUND',
    });
  });
});

describe('fetchScheduleOpenings', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /schedule/openings with the auth token', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchScheduleOpenings('token-123', '2026-07-01', '2026-07-31');

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/schedule/openings?from=2026-07-01&to=2026-07-31',
    );
    expect(result.items).toHaveLength(0);
  });
});
