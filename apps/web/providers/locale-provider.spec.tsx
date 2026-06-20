// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from './locale-provider';

const PT_BR_MESSAGES = { common: { back: 'Voltar', cancel: 'Cancelar' } };
const EN_MESSAGES = { common: { back: 'Back', cancel: 'Cancel' } };

function TranslationConsumer({ ns }: { readonly ns: string }) {
  const t = useTranslations(ns);
  return (
    <div>
      <span data-testid="back">{t('back')}</span>
      <span data-testid="cancel">{t('cancel')}</span>
    </div>
  );
}

describe('LocaleProvider', () => {
  it('provides pt-BR translations to child components', () => {
    render(
      <LocaleProvider locale="pt-BR" messages={PT_BR_MESSAGES}>
        <TranslationConsumer ns="common" />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('back')).toHaveTextContent('Voltar');
    expect(screen.getByTestId('cancel')).toHaveTextContent('Cancelar');
  });

  it('provides en translations to child components', () => {
    render(
      <LocaleProvider locale="en" messages={EN_MESSAGES}>
        <TranslationConsumer ns="common" />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('back')).toHaveTextContent('Back');
    expect(screen.getByTestId('cancel')).toHaveTextContent('Cancel');
  });

  it('renders children without crashing when messages are empty', () => {
    render(
      <LocaleProvider locale="pt-BR" messages={{}}>
        <span data-testid="child">content</span>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
