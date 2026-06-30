// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaffServiceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceCard } from './ServiceCard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function makeService(overrides?: Partial<StaffServiceResponse>): StaffServiceResponse {
  return {
    serviceId: 'svc-1',
    name: 'Lavagem Completa',
    description: 'Lavagem externa e interna',
    price: { amount: 180, currency: 'BRL' },
    durationMinutes: 90,
    loyaltyPointsValue: 20,
    requiresPickupAddress: true,
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ServiceCard', () => {
  it('renders the service summary and links to the edit page', () => {
    renderWithIntl(<ServiceCard service={makeService()} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/services/svc-1/edit');
    expect(screen.getByRole('heading', { name: 'Lavagem Completa' })).toBeInTheDocument();
    expect(screen.getByText('1h 30min')).toBeInTheDocument();
    expect(screen.getByText('🚗 Coleta')).toBeInTheDocument();
    expect(screen.getByText('20 pts')).toBeInTheDocument();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders inactive services with the inactive badge and reduced opacity', () => {
    renderWithIntl(<ServiceCard service={makeService({ isActive: false })} />);

    const link = screen.getByRole('link');
    expect(link.className).toContain('opacity-[0.55]');
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });
});
