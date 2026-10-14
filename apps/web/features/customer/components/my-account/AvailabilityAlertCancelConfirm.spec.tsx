// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { AvailabilityAlertCancelConfirm } from './AvailabilityAlertCancelConfirm';
import { makeAlert } from './availability-alert.fixture';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
  }),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const cancelMock = vi.fn();
vi.mock('@/features/booking/api/availability-alerts', () => ({
  cancelAvailabilityAlertAsCustomer: (...args: unknown[]) => cancelMock(...args),
}));

const alert = makeAlert({ id: 'abc', preferredResourceName: 'Carla Menezes' });

function renderConfirm(): void {
  render(<AvailabilityAlertCancelConfirm alert={alert} tenantSlug="vitta" />);
}

function confirmButton(): HTMLElement {
  return screen.getAllByTestId('cancel-alert-confirm')[0] as HTMLElement;
}

describe('AvailabilityAlertCancelConfirm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    cancelMock.mockReset();
  });

  it('names the alert it will cancel', () => {
    renderConfirm();

    expect(screen.getByText('Massagem relaxante · Carla Menezes')).toBeInTheDocument();
    expect(screen.queryByTestId('cancel-alert-error')).not.toBeInTheDocument();
  });

  it('cancels the alert and returns to the refreshed list', async () => {
    cancelMock.mockResolvedValue(undefined);
    renderConfirm();

    await userEvent.click(confirmButton());

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vitta/my-account/alerts'));
    expect(cancelMock).toHaveBeenCalledWith('abc');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('goes back to the refreshed list on a 409 — the alert was notified or expired meanwhile', async () => {
    cancelMock.mockRejectedValue(
      new ApiError(409, 'conflict', { code: 'BOOKING_ALERT_NOT_EDITABLE' }),
    );
    renderConfirm();

    await userEvent.click(confirmButton());

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vitta/my-account/alerts'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('cancel-alert-error')).not.toBeInTheDocument();
  });

  it('keeps the alert active and offers a retry when the request fails', async () => {
    cancelMock.mockRejectedValueOnce(new Error('network'));
    renderConfirm();

    await userEvent.click(confirmButton());

    expect(await screen.findByTestId('cancel-alert-error')).toHaveTextContent('cancelErrorTitle');
    expect(pushMock).not.toHaveBeenCalled();
    expect(confirmButton()).toHaveTextContent('retry');
    expect(confirmButton()).toBeEnabled();

    cancelMock.mockResolvedValue(undefined);
    await userEvent.click(confirmButton());

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vitta/my-account/alerts'));
    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('cancel-alert-error')).not.toBeInTheDocument();
  });

  it('"Manter aviso" goes back to the alert without calling the API', async () => {
    renderConfirm();

    await userEvent.click(screen.getAllByRole('button', { name: 'cancelKeep' })[0] as HTMLElement);

    expect(pushMock).toHaveBeenCalledWith('/vitta/my-account/alerts/abc');
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
