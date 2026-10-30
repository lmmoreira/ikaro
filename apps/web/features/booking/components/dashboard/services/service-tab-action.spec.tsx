// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { describe, expect, it, vi } from 'vitest';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { useRegisterTabAction, useTabFeedback } from './service-tab-action';

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

describe('useRegisterTabAction feedback', () => {
  const SAVED: FeedbackModel = { variant: 'success', title: 'Alterações salvas', body: 'Pronto.' };

  it('registers the tab feedback with the action and defaults to none', () => {
    const onActionChange = vi.fn();
    renderHook(() => useRegisterTabAction(onActionChange, { ...BASE, onSubmit: vi.fn() }));

    expect(onActionChange).toHaveBeenLastCalledWith(expect.objectContaining({ feedback: null }));
  });

  it('re-registers when the feedback changes and clears it on unmount', () => {
    const onActionChange = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ feedback }: { feedback: FeedbackModel | null }) =>
        useRegisterTabAction(onActionChange, { ...BASE, onSubmit: vi.fn(), feedback }),
      { initialProps: { feedback: null as FeedbackModel | null } },
    );

    rerender({ feedback: SAVED });
    expect(onActionChange).toHaveBeenLastCalledWith(expect.objectContaining({ feedback: SAVED }));

    unmount();
    expect(onActionChange).toHaveBeenLastCalledWith(null);
  });

  it('does not re-register while the same feedback is passed again', () => {
    const onActionChange = vi.fn();
    const { rerender } = renderHook(() =>
      useRegisterTabAction(onActionChange, { ...BASE, onSubmit: vi.fn(), feedback: SAVED }),
    );
    const registrations = onActionChange.mock.calls.length;

    rerender();

    expect(onActionChange.mock.calls).toHaveLength(registrations);
  });
});

describe('useTabFeedback', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      {children}
    </NextIntlClientProvider>
  );

  function feedbackFor(form: { error: string | null; success: string | null }) {
    return renderHook(() => useTabFeedback(form), { wrapper }).result.current;
  }

  it('is null with no message', () => {
    expect(feedbackFor({ error: null, success: null })).toBeNull();
  });

  it('puts the error under the shared error title', () => {
    expect(feedbackFor({ error: 'Algo falhou.', success: null })).toEqual({
      variant: 'error',
      title: 'Não foi possível salvar',
      body: 'Algo falhou.',
    });
  });

  it('puts the success under the shared saved title', () => {
    expect(feedbackFor({ error: null, success: 'Pronto.' })).toEqual({
      variant: 'success',
      title: 'Alterações salvas',
      body: 'Pronto.',
    });
  });
});
