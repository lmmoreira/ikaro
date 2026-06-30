// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ServiceDeactivatePage } from './ServiceDeactivatePage';

const routerPush = vi.fn();
const mockDeactivateService = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/lib/hooks/useServices', () => ({
  useDeactivateService: () => ({
    mutateAsync: mockDeactivateService,
    isPending: false,
  }),
}));

const service = {
  serviceId: 'svc-1',
  name: 'Lavagem Completa',
  description: 'Serviço completo',
  price: { amount: 180, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 20,
  requiresPickupAddress: true,
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
} as const;

describe('ServiceDeactivatePage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    mockDeactivateService.mockReset();
  });

  it('renders the confirmation content and cancel link', () => {
    renderWithIntl(<ServiceDeactivatePage service={service} />);

    expect(screen.getByText('Desativar serviço?')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    const meta = screen.getByText(
      (_, element) =>
        element?.tagName === 'P' &&
        element.classList.contains('mt-1') &&
        Boolean(element.textContent?.includes('1h')),
    );
    expect(meta).toHaveTextContent('1h');
    expect(meta).toHaveTextContent('20 pts');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/dashboard/services/svc-1/edit',
    );
  });

  it('submits the deactivation and redirects back to the list', async () => {
    const user = userEvent.setup();
    mockDeactivateService.mockResolvedValue(undefined);

    renderWithIntl(<ServiceDeactivatePage service={service} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar desativação' }));

    expect(mockDeactivateService).toHaveBeenCalledWith('svc-1');
    expect(routerPush).toHaveBeenCalledWith('/dashboard/services');
  });

  it('shows the failure message inline when deactivation fails', async () => {
    const user = userEvent.setup();
    mockDeactivateService.mockRejectedValue(new ApiError(500, 'server-error', {}));

    renderWithIntl(<ServiceDeactivatePage service={service} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar desativação' }));

    expect(
      await screen.findByText('Erro ao desativar serviço. Tente novamente.'),
    ).toBeInTheDocument();
  });
});
