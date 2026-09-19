// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditPage } from './ServiceEditPage';

const routerPush = vi.fn();
const mockUpdateService = vi.fn();
const mockActivateService = vi.fn();
const mockSetServiceStatus = vi.fn();
const mockSetOnBackOverride = vi.fn();

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: mockRouterReplace }),
}));

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateService: () => ({
    mutateAsync: mockUpdateService,
    isPending: false,
  }),
  useActivateService: () => ({
    mutateAsync: mockActivateService,
    isPending: false,
  }),
  useUpdateServiceResourceRequirements: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceLegs: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceBookingPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishServiceIntakeSchema: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => ({ data: { items: [] } }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setServiceStatus: mockSetServiceStatus,
    setOnBackOverride: mockSetOnBackOverride,
  }),
}));

const intakeSchema: ServiceIntakeSchemaResponse = { active: null, history: [] };

const service: StaffServiceResponse = {
  serviceId: 'svc-1',
  name: 'Lavagem Completa',
  description: 'Serviço completo',
  price: { amount: 180, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 20,
  requiresPickupAddress: true,
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: null,
  legs: null,
  classResourceSlots: null,
  bookingPolicy: {
    defaultApprovalMode: null,
    manualHoldMinutes: null,
    cancellationWindowHoursOverride: null,
    rescheduleWindowHoursOverride: null,
    minBookingAdvanceHoursOverride: null,
    maxBookingAdvanceDaysOverride: null,
    recurrenceEligible: false,
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
};

// service-edit-tab / service-edit-tab-dirty-dot stay static (E2E-3) — disambiguated by the
// sibling data-tab attribute instead of a template-literal testid.
function getTabButton(container: HTMLElement, tab: string): HTMLElement {
  const el = container.querySelector(`[data-testid="service-edit-tab"][data-tab="${tab}"]`);
  if (!el) throw new Error(`No tab button found for tab=${tab}`);
  return el as HTMLElement;
}

function getTabDirtyDot(container: HTMLElement, tab: string): HTMLElement | null {
  return container.querySelector(`[data-testid="service-edit-tab-dirty-dot"][data-tab="${tab}"]`);
}

describe('ServiceEditPage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    mockRouterReplace.mockReset();
    mockUpdateService.mockReset();
    mockActivateService.mockReset();
    mockSetServiceStatus.mockReset();
    mockSetOnBackOverride.mockReset();
  });

  it('renders the prefilled form and danger zone for active services', () => {
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

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
        intakeSchema={intakeSchema}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Desativar serviço' })).not.toBeInTheDocument();
  });

  it('submits the service update and stays on the edit page (no redirect to the list)', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockResolvedValue({ id: 'svc-1' });

    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

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
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome do serviço')).toBeInTheDocument();
  });

  it('shows the deactivated-service message when the backend rejects the update by code', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockRejectedValue(
      new ApiError(409, 'Cannot update a deactivated service', {
        code: 'BOOKING_SERVICE_DEACTIVATED',
      }),
    );

    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.clear(screen.getByLabelText('Nome do serviço'));
    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);

    expect(
      await screen.findByText('Este serviço está desativado e não pode ser atualizado.'),
    ).toBeInTheDocument();
  });

  it('shows the generic fallback message when the backend returns no code', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockRejectedValue(new ApiError(500, 'Internal error'));

    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.clear(screen.getByLabelText('Nome do serviço'));
    await user.type(screen.getByLabelText('Nome do serviço'), 'Lavagem Premium');
    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);

    expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeInTheDocument();
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
        intakeSchema={intakeSchema}
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
        intakeSchema={intakeSchema}
      />,
    );

    fireEvent.submit(screen.getByLabelText('Nome do serviço').closest('form')!);

    expect(
      await screen.findByText('Ative este serviço antes de salvar alterações.'),
    ).toBeInTheDocument();
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it('renders all 4 tabs, with Detalhes active by default', () => {
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    expect(getTabButton(container, 'detalhes')).toHaveAttribute('aria-selected', 'true');
    expect(getTabButton(container, 'recursos')).toHaveAttribute('aria-selected', 'false');
    expect(getTabButton(container, 'politicas')).toBeInTheDocument();
    expect(getTabButton(container, 'formulario')).toBeInTheDocument();
  });

  it('switches tabs and renders the Recursos panel', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    await user.click(getTabButton(container, 'recursos'));
    expect(getTabButton(container, 'recursos')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('resource-mode-flat')).toBeInTheDocument();
  });

  it('keeps an unsaved Recursos draft when switching away and back (panels stay mounted)', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    await user.click(getTabButton(container, 'recursos'));
    const bufferInput = screen.getByTestId('resource-buffer-input');
    await user.clear(bufferInput);
    await user.type(bufferInput, '45');

    await user.click(getTabButton(container, 'detalhes'));
    await user.click(getTabButton(container, 'recursos'));

    expect(screen.getByTestId('resource-buffer-input')).toHaveValue(45);
  });

  it('hides the sticky primary Save/Activate action on non-Detalhes tabs', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    await user.click(getTabButton(container, 'recursos'));
    expect(screen.queryByTestId('service-desktop-save-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('service-cancel-desktop-link')).toBeInTheDocument();
  });

  it('marks the Detalhes tab dirty when a field changes, and clears it on save', async () => {
    const user = userEvent.setup();
    mockUpdateService.mockResolvedValue({ id: 'svc-1' });
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    expect(getTabDirtyDot(container, 'detalhes')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);
    expect(getTabDirtyDot(container, 'detalhes')).not.toBeInTheDocument();
  });

  it('keeps Detalhes dirty when a newer edit lands while an earlier save is still pending', async () => {
    const user = userEvent.setup();
    let resolveSave: (value: { id: string }) => void = () => {};
    mockUpdateService.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { container } = renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} />,
    );

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    await user.click(screen.getAllByRole('button', { name: 'Salvar alterações' })[0]);

    // A second edit lands while the first save is still in flight.
    await user.type(screen.getByLabelText('Nome do serviço'), 'Y');

    resolveSave({ id: 'svc-1' });
    await screen.findAllByRole('button', { name: 'Salvar alterações' });

    expect(getTabDirtyDot(container, 'detalhes')).toBeInTheDocument();
  });

  it('registers an onBackOverride callback with the topbar status context', () => {
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);
    expect(mockSetOnBackOverride).toHaveBeenCalledWith(expect.any(Function));
  });

  it('opens the discard dialog instead of navigating when the cancel link is clicked while dirty', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    await user.click(screen.getByTestId('service-cancel-desktop-link'));

    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('"Continuar editando" closes the discard dialog and keeps the edit', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    await user.click(screen.getByTestId('service-cancel-desktop-link'));
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome do serviço')).toHaveValue(`${service.name}X`);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('"Descartar alterações" navigates back to the services list', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    await user.click(screen.getByTestId('service-cancel-desktop-link'));
    await user.click(screen.getByTestId('service-discard-confirm'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/services');
  });

  it('opens the discard dialog from the topbar back override while dirty, and navigates directly when clean', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);
    // The component registers `() => () => {…}` (a state-updater wrapper) — call the wrapper once
    // to get the literal back handler the topbar would invoke.
    const readBack = (): (() => void) => {
      const wrapper = mockSetOnBackOverride.mock.calls
        .map(([fn]) => fn)
        .filter((fn): fn is () => () => void => typeof fn === 'function')
        .at(-1)!;
      return wrapper();
    };

    act(() => readBack()());
    expect(routerPush).toHaveBeenCalledWith('/dashboard/services');
    routerPush.mockClear();

    await user.type(screen.getByLabelText('Nome do serviço'), 'X');
    act(() => readBack()());

    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('does not open the dialog when navigating away with nothing dirty', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    await user.click(screen.getByTestId('service-cancel-desktop-link'));

    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
  });

  it('shows the created-success banner on the Detalhes tab when showCreatedBanner is true', () => {
    renderWithIntl(
      <ServiceEditPage service={service} intakeSchema={intakeSchema} showCreatedBanner />,
    );

    expect(screen.getByTestId('service-created-banner')).toBeInTheDocument();
  });

  it('does not show the created-success banner without the query flag', () => {
    renderWithIntl(<ServiceEditPage service={service} intakeSchema={intakeSchema} />);

    expect(screen.queryByTestId('service-created-banner')).not.toBeInTheDocument();
  });

  it('exposes all 4 tabs even when the service is inactive', () => {
    const { container } = renderWithIntl(
      <ServiceEditPage service={{ ...service, isActive: false }} intakeSchema={intakeSchema} />,
    );

    expect(getTabButton(container, 'detalhes')).toBeInTheDocument();
    expect(getTabButton(container, 'recursos')).toBeInTheDocument();
    expect(getTabButton(container, 'politicas')).toBeInTheDocument();
    expect(getTabButton(container, 'formulario')).toBeInTheDocument();
  });
});
