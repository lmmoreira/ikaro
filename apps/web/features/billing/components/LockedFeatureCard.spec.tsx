// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeatureKey } from '@ikaro/types';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { LockedFeatureCard } from './LockedFeatureCard';

const FEATURES: readonly FeatureKey[] = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'];

describe('LockedFeatureCard', () => {
  it('draws the route variant with its feature description and no buy action', async () => {
    const { container } = renderWithIntl(<LockedFeatureCard feature="LOYALTY" variant="page" />);

    expect(screen.getByRole('heading', { name: 'Recurso não contratado' })).toBeInTheDocument();
    expect(screen.getByText('Não contratado')).toBeInTheDocument();
    expect(screen.getByText(/A Fidelidade permite acumular pontos/)).toBeInTheDocument();
    expect(screen.getByText(/no próximo período de cobrança/)).toBeInTheDocument();
    expect(screen.getByTestId('locked-feature-kept')).toHaveTextContent(
      'Seus dados já registrados foram mantidos',
    );
    // M25 ships the card without CTAs (M26 adds them), for a manager and staff alike.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('draws the section variant with the "settings kept" note', async () => {
    const { container } = renderWithIntl(<LockedFeatureCard feature="CHATBOT" variant="section" />);

    expect(screen.getByText(/O Chatbot responde dúvidas/)).toBeInTheDocument();
    expect(screen.getByTestId('locked-feature-kept')).toHaveTextContent(
      'Suas configurações foram mantidas.',
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders in English', () => {
    renderWithIntl(<LockedFeatureCard feature="BOOKING" variant="page" />, { locale: 'en' });

    expect(screen.getByRole('heading', { name: 'Feature not included' })).toBeInTheDocument();
    expect(screen.getByText(/Booking lets your customers reserve/)).toBeInTheDocument();
  });

  it.each(['pt-BR', 'en'] as const)('has a description for every feature in %s', (locale) => {
    const messages = locale === 'en' ? enMessages : ptBRMessages;
    const descriptions = messages.dashboard.billing.locked.features;

    for (const feature of FEATURES) {
      expect(descriptions[feature].description.length).toBeGreaterThan(10);
    }
  });
});
