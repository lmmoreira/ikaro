// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ClosureFormSheet } from './ClosureFormSheet';

function getHiddenTimeSelects(container: HTMLElement): HTMLSelectElement[] {
  return Array.from(
    container.querySelectorAll('select[aria-hidden="true"]'),
  ) as HTMLSelectElement[];
}

const tenantProvider = vi.hoisted(() => ({ useTenant: vi.fn() }));

vi.mock('@/providers/tenant-provider', () => tenantProvider);

const useResourcesMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => useResourcesMock(),
}));

vi.mock('@/features/booking/components/dashboard/bookings/BookingActionSheetShell', () => ({
  BookingActionSheetShell: ({
    children,
    onClose,
    onSubmit,
    cancelLabel,
    submitLabel,
    title,
    description,
    error,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
    cancelLabel: string;
    submitLabel: string;
    title: React.ReactNode;
    description: React.ReactNode;
    error: string | null;
  }) => (
    <form onSubmit={onSubmit}>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={onClose}>
        {cancelLabel}
      </button>
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  tenantProvider.useTenant.mockReturnValue({
    tenantId: 't-1',
    tenantSlug: 'lavacar-bh',
    role: 'STAFF',
  });
  useResourcesMock.mockReturnValue({
    data: { items: [] },
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('ClosureFormSheet', () => {
  it('submits the selected closure values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'closure-1' });
    const onClose = vi.fn();

    const { container } = renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/4 de julho/i);

    await user.selectOptions(screen.getByLabelText('Motivo'), 'MAINTENANCE');
    const [startTimeSelect, endTimeSelect] = getHiddenTimeSelects(container);
    expect(startTimeSelect).toBeDefined();
    expect(endTimeSelect).toBeDefined();
    fireEvent.change(startTimeSelect, { target: { value: '09:00' } });
    fireEvent.change(endTimeSelect, { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Manutenção preventiva' },
    });
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        date: '2026-07-04',
        reason: 'MAINTENANCE',
        startTime: '09:00',
        endTime: '12:00',
        notes: 'Manutenção preventiva',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('shows a validation error for past dates', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-06-30"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(screen.getByText('Escolha hoje ou uma data futura para bloquear.')).toBeInTheDocument();
  });

  it('shows a validation error when only one time is selected', async () => {
    const user = userEvent.setup();

    const { container } = renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    const [startTimeSelect] = getHiddenTimeSelects(container);
    expect(startTimeSelect).toBeDefined();
    fireEvent.change(startTimeSelect, { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(screen.getByText('Informe o horário inicial e final juntos.')).toBeInTheDocument();
  });

  it('shows a validation error when the time range is inverted', () => {
    const { container } = renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    const timeSelects = container.querySelectorAll('select[aria-hidden="true"]');
    expect(timeSelects).toHaveLength(2);

    fireEvent.change(timeSelects[0], { target: { value: '12:00' } });
    fireEvent.change(timeSelects[1], { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(
      screen.getByText('O horário inicial precisa ser anterior ao final.'),
    ).toBeInTheDocument();
  });

  it('resets the date when the sheet is reopened for a different day', () => {
    const { unmount } = renderWithIntl(
      <ClosureFormSheet
        key="closure-a"
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/4 de julho/i);

    unmount();

    renderWithIntl(
      <ClosureFormSheet
        key="closure-b"
        open
        initialDate="2026-07-11"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-2' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/11 de julho/i);
  });

  it('does not render the resource field for a non-MANAGER role', () => {
    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'closure-1' })}
      />,
    );

    expect(screen.queryByTestId('resource-select-field')).not.toBeInTheDocument();
  });

  it('includes resourceId in the submitted body when a MANAGER picks a resource', async () => {
    tenantProvider.useTenant.mockReturnValue({
      tenantId: 't-1',
      tenantSlug: 'lavacar-bh',
      role: 'MANAGER',
    });
    useResourcesMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'res-1',
            type: 'ROOM',
            refId: null,
            name: 'Estúdio 1',
            workingHours: null,
            turnoverMinutes: 0,
            maxCapacity: null,
            isActive: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'closure-1' });

    renderWithIntl(
      <ClosureFormSheet
        open
        initialDate="2026-07-04"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.selectOptions(screen.getByTestId('resource-select-field'), 'res-1');
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-07-04', resourceId: 'res-1' }),
      ),
    );
  });
});
