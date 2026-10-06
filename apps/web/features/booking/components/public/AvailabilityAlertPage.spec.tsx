// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { useHotsiteCustomerSession } from '@/features/booking/hooks/useHotsiteCustomerSession';
import { AvailabilityAlertPage } from './AvailabilityAlertPage';

vi.mock('@/features/booking/hooks/useHotsiteCustomerSession', () => ({
  useHotsiteCustomerSession: vi.fn(),
}));
vi.mock('@/features/booking/api/availability-alerts', () => ({ createAvailabilityAlert: vi.fn() }));
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions: vi.fn() }));

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const RETURN_TO = `/acme/booking/availability-alert?serviceId=${SERVICE_ID}&durationMinutes=60`;

const profile: CustomerProfileResponse = {
  customerId: 'customer-1',
  email: 'joao@email.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

function renderPage(service: React.ComponentProps<typeof AvailabilityAlertPage>['service']) {
  return renderWithIntl(
    <AvailabilityAlertPage
      slug="acme"
      service={service}
      preferredResourceId={null}
      durationMinutes={60}
      returnTo={RETURN_TO}
    />,
  );
}

const eligible = { id: SERVICE_ID, name: 'Lavagem Simples', durationMinutes: 30, hasLegs: false };

describe('AvailabilityAlertPage', () => {
  beforeEach(() => {
    vi.mocked(useHotsiteCustomerSession).mockReset();
  });

  it('shows a loading state while the session is being read', () => {
    vi.mocked(useHotsiteCustomerSession).mockReturnValue({ status: 'loading' });
    renderPage(eligible);

    expect(screen.getByTestId('availability-alert-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('availability-alert-form')).not.toBeInTheDocument();
  });

  it('shows the login card to a guest, returning to this same URL after login', () => {
    vi.mocked(useHotsiteCustomerSession).mockReturnValue({ status: 'guest' });
    renderPage(eligible);

    expect(screen.getByTestId('availability-alert-login-gate')).toBeInTheDocument();
    expect(screen.getByTestId('availability-alert-login-cta')).toHaveAttribute(
      'href',
      `/acme/login?returnTo=${encodeURIComponent(RETURN_TO)}`,
    );
    expect(screen.queryByTestId('availability-alert-form')).not.toBeInTheDocument();
  });

  it('shows the form to a logged-in customer, with their e-mail in the notice', () => {
    vi.mocked(useHotsiteCustomerSession).mockReturnValue({ status: 'customer', profile });
    renderPage(eligible);

    expect(screen.getByTestId('availability-alert-form')).toBeInTheDocument();
    expect(screen.getByText(/Avisaremos joao@email\.com\./)).toBeInTheDocument();
  });

  it('shows the not-eligible state to a customer when the link names no eligible service', () => {
    vi.mocked(useHotsiteCustomerSession).mockReturnValue({ status: 'customer', profile });
    renderPage(null);

    expect(screen.getByTestId('availability-alert-ineligible')).toBeInTheDocument();
    expect(screen.queryByTestId('availability-alert-form')).not.toBeInTheDocument();
  });

  it('asks a guest to log in before anything else, even for a bad link', () => {
    vi.mocked(useHotsiteCustomerSession).mockReturnValue({ status: 'guest' });
    renderPage(null);

    expect(screen.getByTestId('availability-alert-login-gate')).toBeInTheDocument();
  });
});
