// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffServiceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceListPage } from './ServiceListPage';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-label': ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

function makeService(overrides?: Partial<StaffServiceResponse>): StaffServiceResponse {
  return {
    serviceId: 'svc-1',
    name: 'Lavagem Completa',
    description: null,
    price: { amount: 180, currency: 'BRL' },
    durationMinutes: 90,
    loyaltyPointsValue: 20,
    requiresPickupAddress: true,
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ServiceListPage', () => {
  it('renders all services and filters them client-side', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceListPage
        services={[
          makeService({ serviceId: 'svc-1', name: 'Lavagem Completa', isActive: true }),
          makeService({ serviceId: 'svc-2', name: 'Polimento', isActive: false }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Todos (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('link', { name: /Lavagem Completa/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Polimento/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ativos (1)' }));
    expect(screen.getByRole('button', { name: 'Ativos (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.queryByText('Polimento')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inativos (1)' }));
    expect(screen.getByText('Polimento')).toBeInTheDocument();
    expect(screen.queryByText('Lavagem Completa')).not.toBeInTheDocument();
  });

  it('renders empty-state copy for the active filter and the mobile FAB link', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceListPage services={[]} />);

    expect(screen.getByText('Nenhum serviço cadastrado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar serviço' })).toHaveAttribute(
      'href',
      '/dashboard/services/new',
    );

    await user.click(screen.getByRole('button', { name: 'Ativos (0)' }));
    expect(screen.getByText('Nenhum serviço ativo.')).toBeInTheDocument();
  });
});
