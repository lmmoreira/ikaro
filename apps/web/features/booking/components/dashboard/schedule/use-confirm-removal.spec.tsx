// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmRemoval } from './use-confirm-removal';

describe('useConfirmRemoval', () => {
  it('submits and closes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useConfirmRemoval({
        open: true,
        onClose,
        onSubmit,
        getErrorMessage: () => 'error',
      }),
    );

    await act(async () => {
      await result.current.confirmRemoval('id-1');
    });

    expect(onSubmit).toHaveBeenCalledWith('id-1');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('stores the mapped error message on failure', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() =>
      useConfirmRemoval({
        open: true,
        onClose: vi.fn(),
        onSubmit,
        getErrorMessage: () => 'mapped error',
      }),
    );

    await act(async () => {
      await result.current.confirmRemoval('id-1');
    });

    expect(result.current.error).toBe('mapped error');
  });
});
