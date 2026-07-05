// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { InvalidLinkView } from './InvalidLinkView';

describe('InvalidLinkView', () => {
  it('renders the generic invalid-link reasons list for reason="invalid"', () => {
    renderWithIntl(
      <InvalidLinkView reason="invalid" tenantName="BeloAuto" tenantSlug="belo-auto" />,
    );

    expect(screen.getByRole('heading', { name: 'Link inválido ou expirado' })).toBeInTheDocument();
    expect(screen.getByText('O link já foi utilizado anteriormente')).toBeInTheDocument();
    expect(
      screen.getByText('O agendamento já foi aprovado, rejeitado ou cancelado'),
    ).toBeInTheDocument();
  });

  it('renders the distinct processed message for reason="processed"', () => {
    renderWithIntl(<InvalidLinkView reason="processed" tenantName="BeloAuto" />);

    expect(screen.getByText('Este agendamento já foi processado.')).toBeInTheDocument();
    expect(screen.queryByText('O link já foi utilizado anteriormente')).not.toBeInTheDocument();
  });

  it('links "Ir para o site" to the tenant hotsite when tenantSlug is present', () => {
    renderWithIntl(<InvalidLinkView reason="invalid" tenantSlug="belo-auto" />);

    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute(
      'href',
      '/belo-auto',
    );
  });

  it('falls back to "/" and omits the login link when tenantSlug is absent', () => {
    renderWithIntl(<InvalidLinkView reason="invalid" />);

    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute('href', '/');
    expect(
      screen.queryByRole('link', { name: 'Entrar para ver seus agendamentos' }),
    ).not.toBeInTheDocument();
  });
});
