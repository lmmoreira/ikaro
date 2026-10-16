// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { clearStaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { NewBookingChooserPage } from './NewBookingChooserPage';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/features/booking/hooks/useCustomerSearch', () => ({
  MIN_CUSTOMER_SEARCH_LENGTH: 5,
  useCustomerSearch: () => ({
    term: '',
    tooShort: false,
    items: [
      {
        customerId: 'cust 1',
        name: 'Ana Costa',
        email: 'ana@x.com',
        phone: '+5531',
        currentPoints: 0,
      },
    ],
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  }),
}));

beforeEach(() => {
  push.mockReset();
  clearStaffGuestContact();
});

describe('NewBookingChooserPage', () => {
  it('carries a registered customer to the steps by id', async () => {
    renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="agendamento" />);

    await userEvent.click(screen.getByTestId('customer-row'));
    await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

    expect(push).toHaveBeenCalledWith('/dashboard/bookings/new/booking?customerId=cust%201');
  });

  it('carries a new contact to the steps without putting it in the URL', async () => {
    renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="agendamento" />);

    await userEvent.click(screen.getAllByTestId('chooser-tab')[1]!);
    fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '31999990000' } });
    fireEvent.change(screen.getByTestId('guest-email'), { target: { value: 'maria@x.com' } });
    await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

    expect(push).toHaveBeenCalledWith('/dashboard/bookings/new/booking');
    expect(JSON.stringify(push.mock.calls)).not.toContain('maria');
  });

  it('goes back to the agenda on cancel', async () => {
    renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="agendamento" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);

    expect(push).toHaveBeenCalledWith('/dashboard/bookings');
  });

  describe('for a recurrence (?tipo=recorrencia, UC-070)', () => {
    it('sends a registered customer to the pattern page, by id', async () => {
      renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="recorrencia" />);

      await userEvent.click(screen.getByTestId('customer-row'));
      await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

      expect(push).toHaveBeenCalledWith('/dashboard/bookings/recurring/new?customerId=cust%201');
    });

    it('disables the new-contact mode: a guest can never have a recurrence', () => {
      renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="recorrencia" />);

      const guestTab = screen
        .getAllByTestId('chooser-tab')
        .find((tab) => tab.getAttribute('data-mode') === 'guest');
      expect(guestTab).toBeDisabled();
    });

    it('still goes back to the agenda on cancel', async () => {
      renderWithIntl(<NewBookingChooserPage phonePrefix="+55" kind="recorrencia" />);

      await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);

      expect(push).toHaveBeenCalledWith('/dashboard/bookings');
    });
  });
});
