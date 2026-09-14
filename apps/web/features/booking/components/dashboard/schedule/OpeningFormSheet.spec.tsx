// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { OpeningFormSheet } from './OpeningFormSheet';

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

describe('OpeningFormSheet', () => {
  it('submits the selected special opening values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'opening-1' });
    const onClose = vi.fn();

    const { container } = renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/5 de julho/i);

    const [startTimeSelect, endTimeSelect] = getHiddenTimeSelects(container);
    expect(startTimeSelect).toBeDefined();
    expect(endTimeSelect).toBeDefined();
    fireEvent.change(startTimeSelect, { target: { value: '09:00' } });
    fireEvent.change(endTimeSelect, { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Horário especial' },
    });
    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        date: '2026-07-05',
        startTime: '09:00',
        endTime: '14:00',
        notes: 'Horário especial',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('shows a validation error when the opening times are incomplete', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-1' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    expect(screen.getByText('Informe o horário inicial e final.')).toBeInTheDocument();
  });

  it('resets the date when the sheet is reopened for a different day', () => {
    const { unmount } = renderWithIntl(
      <OpeningFormSheet
        key="opening-a"
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/5 de julho/i);

    unmount();

    renderWithIntl(
      <OpeningFormSheet
        key="opening-b"
        open
        initialDate="2026-07-12"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-2' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent(/12 de julho/i);
  });

  it('does not render the resource field for a non-MANAGER role', () => {
    renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ id: 'opening-1' })}
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
    const onSubmit = vi.fn().mockResolvedValue({ id: 'opening-1' });

    const { container } = renderWithIntl(
      <OpeningFormSheet
        open
        initialDate="2026-07-05"
        todayKey="2026-07-01"
        timezone="America/Sao_Paulo"
        slotGranularityMinutes={30}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.selectOptions(screen.getByTestId('resource-select-field'), 'res-1');
    const [startTimeSelect, endTimeSelect] = getHiddenTimeSelects(container);
    fireEvent.change(startTimeSelect, { target: { value: '09:00' } });
    fireEvent.change(endTimeSelect, { target: { value: '14:00' } });
    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-07-05', resourceId: 'res-1' }),
      ),
    );
  });
});
