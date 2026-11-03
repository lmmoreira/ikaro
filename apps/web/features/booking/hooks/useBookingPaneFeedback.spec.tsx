// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { useBookingPaneFeedback } from './useBookingPaneFeedback';

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function render(actionState: string, openSheet = vi.fn()) {
  const view = renderHook(() => useBookingPaneFeedback(actionState, openSheet), { wrapper });
  return { ...view, openSheet };
}

describe('useBookingPaneFeedback', () => {
  it('has no message while nothing failed', () => {
    const { result } = render('idle');

    expect(result.current.paneFeedback).toBeNull();
  });

  it('turns a failed action into an error message and clears it again', () => {
    const { result } = render('idle');

    act(() => result.current.setInlineError('Erro ao aprovar. Tente novamente.'));
    expect(result.current.paneFeedback).toMatchObject({
      variant: 'error',
      title: 'Erro ao aprovar. Tente novamente.',
    });

    act(() => result.current.setInlineError(null));
    expect(result.current.paneFeedback).toBeNull();
  });

  it('reports a no-show network failure with its retry, which reopens the no-show sheet', () => {
    const { result, openSheet } = render('no-show-error');

    const feedback = result.current.paneFeedback;
    expect(feedback).toMatchObject({
      variant: 'error',
      title: 'Não foi possível registrar o não comparecimento',
      retryLabel: 'Tentar novamente',
      testId: 'booking-no-show-error',
    });
    feedback?.onRetry?.();
    expect(openSheet).toHaveBeenCalledWith('no-show');
  });

  it('reports a correction network failure with its retry, which reopens the correction sheet', () => {
    const { result, openSheet } = render('correct-error');

    expect(result.current.paneFeedback).toMatchObject({
      title: 'Não foi possível corrigir',
      testId: 'booking-no-show-correct-error',
    });
    result.current.paneFeedback?.onRetry?.();
    expect(openSheet).toHaveBeenCalledWith('correct-no-show');
  });

  // Negative guarantee: the 409 "already closed" is a state of the booking (a banner), not a pane message.
  it.each(['no-show-terminal', 'no-show-not-ended', 'no-show', 'corrected', 'correct-forbidden'])(
    'leaves %s to its banner: no pane message',
    (state) => {
      const { result } = render(state);

      expect(result.current.paneFeedback).toBeNull();
    },
  );

  it('prefers the message of the action that just failed over a no-show failure', () => {
    const { result } = render('no-show-error');

    act(() => result.current.setInlineError('Outro erro'));

    expect(result.current.paneFeedback).toMatchObject({ title: 'Outro erro' });
  });
});
