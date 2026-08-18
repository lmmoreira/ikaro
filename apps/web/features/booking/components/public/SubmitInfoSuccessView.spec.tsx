// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SubmitInfoSuccessView } from './SubmitInfoSuccessView';

const SUMMARY = {
  serviceSummary: 'Lavagem Simples',
  scheduledAt: '2026-06-18T13:00:00.000Z',
  infoRequestMessage: 'Envie fotos do veículo antes da lavagem.',
  contactName: 'João da Silva',
};

describe('SubmitInfoSuccessView', () => {
  it('renders the summary details when summary is provided', () => {
    renderWithIntl(
      <SubmitInfoSuccessView
        summary={SUMMARY}
        response="Segue a foto do veículo."
        infoSubmittedAt="2026-06-17T14:30:00.000Z"
        formatScheduledAt={vi.fn((iso: string) => `formatted:${iso}`)}
      />,
    );

    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('Segue a foto do veículo.')).toBeInTheDocument();
    expect(screen.getByText('formatted:2026-06-18T13:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('formatted:2026-06-17T14:30:00.000Z')).toBeInTheDocument();
  });

  it('omits the summary details block when summary is null', () => {
    renderWithIntl(
      <SubmitInfoSuccessView
        summary={null}
        response="texto"
        infoSubmittedAt="2026-06-17T14:30:00.000Z"
        formatScheduledAt={vi.fn((iso: string) => iso)}
      />,
    );

    expect(screen.queryByText('Lavagem Simples')).not.toBeInTheDocument();
  });

  it('links the CTA to the tenant hotsite and shows the create-account link when tenantSlug is known', () => {
    renderWithIntl(
      <SubmitInfoSuccessView
        summary={null}
        response="texto"
        infoSubmittedAt="2026-06-17T14:30:00.000Z"
        formatScheduledAt={vi.fn((iso: string) => iso)}
        tenantSlug="lavacar-beloauto"
      />,
    );

    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute(
      'href',
      '/lavacar-beloauto',
    );
    expect(screen.getByRole('link', { name: /Criar conta/ })).toHaveAttribute(
      'href',
      '/lavacar-beloauto/login',
    );
  });

  it('falls back to "/" and omits the login link when tenantSlug is absent', () => {
    renderWithIntl(
      <SubmitInfoSuccessView
        summary={null}
        response="texto"
        infoSubmittedAt="2026-06-17T14:30:00.000Z"
        formatScheduledAt={vi.fn((iso: string) => iso)}
      />,
    );

    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /Criar conta/ })).not.toBeInTheDocument();
  });
});
