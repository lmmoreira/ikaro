// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { describe, expect, it } from 'vitest';
import { useHotsiteActionFeedback, type ActionBanner } from './useHotsiteActionFeedback';

function feedbackFor(banner: ActionBanner | null) {
  return renderHook(() => useHotsiteActionFeedback(banner, 'acme'), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
        {children}
      </NextIntlClientProvider>
    ),
  }).result.current;
}

describe('useHotsiteActionFeedback', () => {
  it('has no feedback without a banner', () => {
    expect(feedbackFor(null)).toBeNull();
  });

  it.each([
    ['publish', 'Hotsite atualizado e no ar!'],
    ['unpublish', 'Hotsite offline'],
  ] as const)('maps a %s success to a success model with the slug in its body', (kind, title) => {
    const feedback = feedbackFor({ kind, status: 'success' });

    expect(feedback).toMatchObject({
      variant: 'success',
      title,
      testId: 'hotsite-action-success-banner',
    });
    expect(feedback?.body).toContain('@acme');
  });

  it('maps an error to an error model carrying the resolved message', () => {
    expect(feedbackFor({ kind: 'publish', status: 'error', message: 'Falha ao publicar' })).toEqual(
      {
        variant: 'error',
        title: 'Falha ao publicar',
        testId: 'hotsite-action-error-banner',
      },
    );
  });
});
