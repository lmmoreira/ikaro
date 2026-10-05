// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServiceQuote } from '@/features/booking/api/public';
import { useServiceQuote } from './useServiceQuote';

vi.mock('@/features/booking/api/public', () => ({ fetchServiceQuote: vi.fn() }));

const quote = (durationMinutes: number, amount: number) => ({
  durationMinutes,
  price: { amount, currency: 'BRL' },
});

describe('useServiceQuote', () => {
  beforeEach(() => vi.mocked(fetchServiceQuote).mockReset());

  it('is idle until a duration is chosen and makes no request', () => {
    const { result } = renderHook(() => useServiceQuote('slug', 'svc', null));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchServiceQuote).not.toHaveBeenCalled();
  });

  it('loads the quote for the chosen duration', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    const { result } = renderHook(() => useServiceQuote('slug', 'svc', 60));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', quote: quote(60, 50) }),
    );
    expect(fetchServiceQuote).toHaveBeenCalledWith('slug', 'svc', 60);
  });

  it('re-requests on every duration change and shows loading until the new quote lands', async () => {
    vi.mocked(fetchServiceQuote).mockImplementation(async (_slug, _id, minutes) =>
      quote(minutes, minutes),
    );
    const { result, rerender } = renderHook(
      ({ minutes }) => useServiceQuote('slug', 'svc', minutes),
      { initialProps: { minutes: 60 } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    rerender({ minutes: 90 });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', quote: quote(90, 90) }),
    );
  });

  it('fails closed on an error and recovers on retry', async () => {
    vi.mocked(fetchServiceQuote).mockRejectedValueOnce(new Error('network'));
    vi.mocked(fetchServiceQuote).mockResolvedValueOnce(quote(60, 50));
    const { result } = renderHook(() => useServiceQuote('slug', 'svc', 60));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchServiceQuote).toHaveBeenCalledTimes(2);
  });

  it('drops a response that arrives after the duration changed', async () => {
    let resolveFirst: (value: ReturnType<typeof quote>) => void = () => undefined;
    vi.mocked(fetchServiceQuote).mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    vi.mocked(fetchServiceQuote).mockResolvedValueOnce(quote(90, 75));
    const { result, rerender } = renderHook(
      ({ minutes }) => useServiceQuote('slug', 'svc', minutes),
      { initialProps: { minutes: 60 } },
    );

    rerender({ minutes: 90 });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', quote: quote(90, 75) }),
    );
    await act(async () => resolveFirst(quote(60, 50)));

    expect(result.current.state).toEqual({ status: 'ready', quote: quote(90, 75) });
  });
});
