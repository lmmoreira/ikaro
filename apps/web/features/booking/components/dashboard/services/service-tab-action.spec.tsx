// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRegisterTabAction } from './service-tab-action';

const BASE = { label: 'Salvar', disabled: false, pending: false };

describe('useRegisterTabAction', () => {
  it('registers the action on mount and clears it with null on unmount', () => {
    const onActionChange = vi.fn();
    const { unmount } = renderHook(() =>
      useRegisterTabAction(onActionChange, { ...BASE, onSubmit: vi.fn() }),
    );

    expect(onActionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'Salvar', disabled: false, pending: false }),
    );

    unmount();
    expect(onActionChange).toHaveBeenLastCalledWith(null);
  });

  it('re-registers when label, disabled or pending change', () => {
    const onActionChange = vi.fn();
    const { rerender } = renderHook(
      ({ disabled }) =>
        useRegisterTabAction(onActionChange, { ...BASE, disabled, onSubmit: vi.fn() }),
      { initialProps: { disabled: false } },
    );

    rerender({ disabled: true });

    expect(onActionChange).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
  });

  it('keeps a stable onSubmit identity while always invoking the latest handler', () => {
    const onActionChange = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onSubmit }) => useRegisterTabAction(onActionChange, { ...BASE, onSubmit }),
      { initialProps: { onSubmit: first } },
    );
    const registered = onActionChange.mock.calls.filter(([a]) => a !== null).at(-1)![0];
    const registrationsBefore = onActionChange.mock.calls.length;

    rerender({ onSubmit: second });
    registered.onSubmit();

    expect(onActionChange.mock.calls).toHaveLength(registrationsBefore);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
