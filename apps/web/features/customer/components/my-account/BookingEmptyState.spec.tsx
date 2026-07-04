// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingEmptyState } from './BookingEmptyState';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Nenhum agendamento ainda',
      body: 'Faça seu primeiro agendamento e acompanhe o histórico do seu carro aqui.',
      cta: 'Fazer agendamento',
    };
    return translations[key] ?? key;
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('BookingEmptyState', () => {
  it('renders the UC-006 A1 empty message and body copy', () => {
    render(<BookingEmptyState tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Nenhum agendamento ainda')).toBeInTheDocument();
    expect(
      screen.getByText('Faça seu primeiro agendamento e acompanhe o histórico do seu carro aqui.'),
    ).toBeInTheDocument();
  });

  it('links the CTA to the tenant booking flow', () => {
    render(<BookingEmptyState tenantSlug="lavacar-bh" />);

    expect(screen.getByRole('link', { name: 'Fazer agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
  });
});
