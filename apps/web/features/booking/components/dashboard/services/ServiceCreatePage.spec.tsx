// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ServiceCreatePage } from './ServiceCreatePage';

const routerPush = vi.fn();
const mockCreateService = vi.fn();
const mockSetServiceStatus = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/booking/services/useServices', () => ({
  useCreateService: () => ({
    mutateAsync: mockCreateService,
    isPending: false,
  }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
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

  it('defaults the booking-model picker to Agendamento (APPOINTMENT)', () => {
    renderWithIntl(<ServiceCreatePage />);

    const appointmentCard = screen.getByTestId('booking-model-appointment');
    expect(appointmentCard.className).toContain('border-blue-500');
  });

  it('submits the service (bookingModel: APPOINTMENT) and redirects to the new edit route', async () => {
    const user = userEvent.setup();
    mockCreateService.mockResolvedValue({ serviceId: 'svc-1' });

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
      bookingModel: 'APPOINTMENT',
    });
    expect(routerPush).toHaveBeenCalledWith('/dashboard/services/svc-1/edit?created=1');
  });

  it('picking Turma (SESSION) hides the pickup toggle and forces it off on submit', async () => {
    const user = userEvent.setup();
    mockCreateService.mockResolvedValue({ serviceId: 'svc-2' });

    renderWithIntl(<ServiceCreatePage />);

    await user.click(screen.getByRole('switch', { name: /Coleta e entrega/i }));
    expect(screen.getByRole('switch', { name: /Coleta e entrega/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(screen.getByTestId('booking-model-session'));
    expect(screen.queryByRole('switch', { name: /Coleta e entrega/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome do serviço'), 'Workshop de Detalhamento');
    await user.type(screen.getByLabelText('Preço'), '90');
    await user.type(screen.getByLabelText('Duração'), '120');
    await user.click(getPrimaryCreateButton());

    expect(mockCreateService).toHaveBeenCalledWith(
      expect.objectContaining({ bookingModel: 'SESSION', requiresPickupAddress: false }),
    );
  });

  it('shows the resolved backend message in the pane, not in the form card', async () => {
    const user = userEvent.setup();
    mockCreateService.mockRejectedValue(
      new ApiError(400, 'Invalid amount', { code: 'MONEY_AMOUNT_INVALID' }),
    );

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.click(getPrimaryCreateButton());

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) expect(alert).toHaveTextContent('O valor informado é inválido.');
    expect(screen.queryByTestId('service-submit-error')).not.toBeInTheDocument();
  });

  it('shows the generic fallback message when the backend returns no code', async () => {
    const user = userEvent.setup();
    mockCreateService.mockRejectedValue(new ApiError(500, 'Internal error'));

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.click(getPrimaryCreateButton());

    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('Algo deu errado. Tente novamente.');
  });

  it('marks and focuses the field the backend points at, and shows its message', async () => {
    const user = userEvent.setup();
    mockCreateService.mockRejectedValue(
      new ApiError(400, 'Invalid name', { code: 'BOOKING_SERVICE_NAME_REQUIRED', field: 'name' }),
    );

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.click(getPrimaryCreateButton());

    const nameInput = screen.getByTestId('service-name-input');
    await waitFor(() => expect(nameInput).toHaveAttribute('aria-invalid', 'true'));
    await waitFor(() => expect(nameInput).toHaveFocus());
    const describedBy = nameInput.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'O nome do serviço é obrigatório.',
    );
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('O nome do serviço é obrigatório.');
  });

  it('falls back to the form-level message alone for a field the form does not have', async () => {
    const user = userEvent.setup();
    mockCreateService.mockRejectedValue(
      new ApiError(400, 'Invalid', { code: 'MONEY_AMOUNT_INVALID', field: 'unknownField' }),
    );

    renderWithIntl(<ServiceCreatePage />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.type(screen.getByLabelText('Preço'), '180');
    await user.type(screen.getByLabelText('Duração'), '60');
    await user.click(getPrimaryCreateButton());

    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('O valor informado é inválido.');
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('marks every invalid field, focuses the first and summarises in the pane on a client check', async () => {
    const user = userEvent.setup();

    renderWithIntl(<ServiceCreatePage />);

    await user.click(getPrimaryCreateButton());

    expect(mockCreateService).not.toHaveBeenCalled();
    expect(screen.getByTestId('service-name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('service-price-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('service-duration-input')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByTestId('service-name-input')).toHaveFocus());
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Revise os campos destacados para salvar.',
    );
  });

  it('clears the message and the field marks on the next edit', async () => {
    const user = userEvent.setup();

    renderWithIntl(<ServiceCreatePage />);

    await user.click(getPrimaryCreateButton());
    expect(screen.getByTestId('service-name-input')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText('Nome do serviço'), 'A');

    expect(screen.getByTestId('service-name-input')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
