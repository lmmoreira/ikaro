// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditPage } from './ServiceEditPage';

const routerPush = vi.fn();
const mockUpdateService = vi.fn();
const mockActivateService = vi.fn();
const mockSetServiceStatus = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/lib/hooks/useServices', () => ({
  useUpdateService: () => ({
    mutateAsync: mockUpdateService,
    isPending: false,
  }),
  useActivateService: () => ({
    mutateAsync: mockActivateService,
    isPending: false,
  }),
}));

vi.mock('../topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setServiceStatus: mockSetServiceStatus,
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

describe('ServiceEditPage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    mockUpdateService.mockReset();
    mockActivateService.mockReset();
    mockSetServiceStatus.mockReset();
  });

  it('renders the prefilled form and danger zone for active services', () => {
    renderWithIntl(<ServiceEditPage service={service} />);

    expect(screen.getByLabelText('Nome do serviço')).toHaveValue('Lavagem Completa');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Serviço completo');
    expect(screen.getByLabelText('Preço')).toHaveDisplayValue('180');
    expect(screen.getByLabelText('Duração')).toHaveDisplayValue('60');
    expect(screen.getByLabelText('Pontos de fidelidade')).toHaveValue(20);
    expect(screen.getByText('Só afeta novos agendamentos')).toBeInTheDocument();
    const deactivateLinks = screen.getAllByRole('link', { name: 'Desativar serviço' });
    expect(deactivateLinks).toHaveLength(1);
    expect(deactivateLinks[0]).toHaveAttribute('href', '/dashboard/services/svc-1/deactivate');
    expect(mockSetServiceStatus).toHaveBeenCalledWith('ACTIVE');
  });

  it('hides the danger zone for inactive services', () => {
    renderWithIntl(
      <ServiceEditPage
        service={{
          ...service,
          isActive: false,
        }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Desativar serviço' })).not.toBeInTheDocument();
  });

  it('submits the service update and returns to the list', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockResolvedValue({ id: 'svc-1' });

    renderWithIntl(<ServiceEditPage service={service} />);

    await user.clear(screen.getByLabelText('Nome do serviço'));
    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);

    expect(mockUpdateService).toHaveBeenCalledWith({
      id: 'svc-1',
      body: {
        name: 'Lavagem Premium',
        description: 'Serviço completo',
        priceAmount: 180,
        durationMinutes: 60,
        loyaltyPointsValue: 20,
        requiresPickupAddress: true,
      },
    });
    expect(routerPush).toHaveBeenCalledWith('/dashboard/services');
  });

  it('shows the duplicate-name error inline on the name field', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockRejectedValue(new ApiError(409, 'Conflict', {}));

    renderWithIntl(<ServiceEditPage service={service} />);

    await user.clear(screen.getByLabelText('Nome do serviço'));
    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);

    expect(
      await screen.findByText('Já existe um serviço com este nome. Escolha outro nome.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do serviço')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows an activate action for inactive services and updates the top bar after activation', async () => {
    const user = userEvent.setup();
    mockActivateService.mockResolvedValue({ id: 'svc-1', isActive: true });

    renderWithIntl(
      <ServiceEditPage
        service={{
          ...service,
          isActive: false,
        }}
      />,
    );

    expect(screen.getByText('Serviço inativo')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ativar serviço' })).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Ativar serviço' })[0]);

    expect(mockActivateService).toHaveBeenCalledWith('svc-1');
    expect(mockSetServiceStatus).toHaveBeenCalledWith('ACTIVE');
    expect(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]).toBeInTheDocument();
  });

  it('blocks save when the service is inactive', async () => {
    renderWithIntl(
      <ServiceEditPage
        service={{
          ...service,
          isActive: false,
        }}
      />,
    );

    fireEvent.submit(screen.getByLabelText('Nome do serviço').closest('form')!);

    expect(
      await screen.findByText('Ative este serviço antes de salvar alterações.'),
    ).toBeInTheDocument();
    expect(mockUpdateService).not.toHaveBeenCalled();
  });
});
