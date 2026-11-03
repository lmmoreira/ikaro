// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffServiceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceListPage } from './ServiceListPage';

const routerRefresh = vi.fn();

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
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
    bookingModel: 'APPOINTMENT',
    resourceRequirements: [],
    bufferAfterMinutes: null,
    tenantDefaultBufferMinutes: 60,
    legs: null,
    classResourceSlots: null,
    publicPagePublished: false,
    publicSlug: null,
    publicProfile: null,
    bookingPolicy: {
      defaultApprovalMode: null,
      manualHoldMinutes: null,
      cancellationWindowHoursOverride: null,
      rescheduleWindowHoursOverride: null,
      minBookingAdvanceHoursOverride: null,
      maxBookingAdvanceDaysOverride: null,
      effectiveMinBookingAdvanceHours: 0,
      effectiveMaxBookingAdvanceDays: 90,
      recurrenceEligible: false,
      recurringHorizonDays: null,
      availabilityAlertEligible: false,
      durationPolicy: 'FIXED',
      durationMinMinutes: null,
      durationMaxMinutes: null,
      durationIncrementMinutes: null,
      pricingPolicy: 'FIXED',
      pricingIncrementMinutes: null,
      pricePerIncrementAmount: null,
      minimumChargeAmount: null,
    },
    ...overrides,
  };
}

describe('ServiceListPage', () => {
  beforeEach(() => {
    routerRefresh.mockReset();
  });

  it('shows no created banner: nothing sends the list the created flag', () => {
    renderWithIntl(<ServiceListPage services={[]} />);

    expect(screen.queryByText('Serviço criado!')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the filter chips inside the list card', () => {
    renderWithIntl(<ServiceListPage services={[makeService()]} />);

    const card = screen
      .getByRole('button', { name: /^Todos/ })
      .closest('[class*="overflow-hidden"]');
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByRole('button', { name: /^Ativos/ }));
    expect(card).toContainElement(screen.getByText('Lavagem Completa'));
  });

  it('shows the load failure with a retry instead of the empty message when loadFailed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceListPage services={[]} loadFailed />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os serviços');
    expect(alert).toHaveTextContent('Verifique sua conexão e tente novamente.');
    expect(screen.queryByText(/Nenhum serviço/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Todos/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

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
