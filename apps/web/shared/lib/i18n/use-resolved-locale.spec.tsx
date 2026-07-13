// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { useResolvedLocale } from './use-resolved-locale';

function wrapper(
  locale: string,
): (props: { readonly children: React.ReactNode }) => React.JSX.Element {
  return function Wrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return (
      <NextIntlClientProvider locale={locale} messages={{}}>
        {children}
      </NextIntlClientProvider>
    );
  };
}

describe('useResolvedLocale', () => {
  it('resolves pt-BR as-is', () => {
    const { result } = renderHook(() => useResolvedLocale(), { wrapper: wrapper('pt-BR') });
    expect(result.current).toBe('pt-BR');
  });

  it('resolves en as-is', () => {
    const { result } = renderHook(() => useResolvedLocale(), { wrapper: wrapper('en') });
    expect(result.current).toBe('en');
  });

  it('falls back to pt-BR for an unsupported locale', () => {
    const { result } = renderHook(() => useResolvedLocale(), { wrapper: wrapper('fr') });
    expect(result.current).toBe('pt-BR');
  });

  it('resolves a region-qualified en tag (e.g. en-US) to en', () => {
    const { result } = renderHook(() => useResolvedLocale(), { wrapper: wrapper('en-US') });
    expect(result.current).toBe('en');
  });
});
