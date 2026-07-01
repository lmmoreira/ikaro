// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ServiceCreatePage } from './ServiceCreatePage';

const routerPush = vi.fn();
const mockCreateService = vi.fn();
const mockSetServiceStatus = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/lib/hooks/useServices', () => ({
  useCreateService: () => ({
    mutateAsync: mockCreateService,
    isPending: false,
  }),
}));

vi.mock('../topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setServiceStatus: mockSetServiceStatus,
  }),
}));

describe('ServiceCreatePage', () => {
  function getPrimaryCreateButton() {
    return screen.getAllByRole('button', { name: 'Criar serviço' })[0];
  }

  beforeEach(() => {
    routerPush.mockReset();
    mockCreateService.mockReset();
    mockSetServiceStatus.mockReset();
  });

  it('renders the create form with the expected defaults', () => {
    renderWithIntl(<ServiceCreatePage />);

    expect(screen.getByLabelText('Nome do serviço')).toHaveValue('');
    expect(screen.getByLabelText('Descrição')).toHaveValue('');
    expect(screen.getByLabelText('Preço')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Duração')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Pontos de fidelidade')).toHaveValue(0);
    expect(screen.getByRole('switch', { name: /Coleta e entrega/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: /Criar como ativo/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(mockSetServiceStatus).toHaveBeenCalledWith('ACTIVE');
  });

  it('keeps the topbar service status in sync with the active toggle', async () => {
    const user = userEvent.setup();

    renderWithIntl(<ServiceCreatePage />);

    await user.click(screen.getByRole('switch', { name: /Criar como ativo/i }));

    expect(mockSetServiceStatus).toHaveBeenLastCalledWith('INACTIVE');
  });

  it('validates required fields inline', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceCreatePage />);

    await user.click(getPrimaryCreateButton());

    expect(screen.getByText('Informe o nome do serviço.')).toBeInTheDocument();
    expect(screen.getByText('Informe o preço do serviço.')).toBeInTheDocument();
    expect(screen.getByText('Informe a duração do serviço.')).toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  it('submits the service and redirects back to the list with the created query flag', async () => {
    const user = userEvent.setup();
    mockCreateService.mockResolvedValue({ id: 'svc-1' });

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Descrição'), 'Serviço completo');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.clear(screen.getByLabelText('Pontos de fidelidade'));
    await user.type(screen.getByLabelText('Pontos de fidelidade'), '15');
    await user.click(getPrimaryCreateButton());

    expect(mockCreateService).toHaveBeenCalledWith({
      name: 'Lavagem Premium',
      description: 'Serviço completo',
      priceAmount: 180,
      durationMinutes: 60,
      loyaltyPointsValue: 15,
      requiresPickupAddress: false,
      isActive: true,
    });
    expect(routerPush).toHaveBeenCalledWith('/dashboard/services?created=1');
  });

  it('shows the duplicate-name error inline on the name field', async () => {
    const user = userEvent.setup();
    mockCreateService.mockRejectedValue(new ApiError(409, 'Conflict', {}));

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.click(getPrimaryCreateButton());

    expect(
      await screen.findByText('Já existe um serviço com este nome. Escolha outro nome.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do serviço')).toHaveAttribute('aria-invalid', 'true');
  });
});
