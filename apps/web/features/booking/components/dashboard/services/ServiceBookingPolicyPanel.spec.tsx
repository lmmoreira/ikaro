// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { ServiceBookingPolicyPanel } from './ServiceBookingPolicyPanel';

const mutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateServiceBookingPolicy: () => ({ mutateAsync, isPending: false }),
}));

const BASE_POLICY: ServiceBookingPolicyItem = {
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
};

beforeEach(() => mutateAsync.mockClear());

describe('ServiceBookingPolicyPanel', () => {
  it('hides duration/pricing detail fields when policy is FIXED', () => {
    renderWithIntl(
      <ServiceBookingPolicyPanel
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('policy-duration-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('policy-pricing-detail')).not.toBeInTheDocument();
  });

  it('shows duration detail fields when duration policy is CUSTOMER_SELECTED', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceBookingPolicyPanel
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'CUSTOMER_SELECTED');
    expect(screen.getByTestId('policy-duration-detail')).toBeInTheDocument();
  });

  it('submits all 16 UpdateServiceBookingPolicySchema fields on save', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceBookingPolicyPanel
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('policy-save'));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'svc-1',
      body: BASE_POLICY,
    });
    const body = mutateAsync.mock.calls[0]![0].body;
    expect(Object.keys(body).sort()).toEqual(Object.keys(BASE_POLICY).sort());
  });

  it('surfaces a 422 variable-duration-without-pricing error inline', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(
      new ApiError(422, 'Requires pricing', {
        code: 'BOOKING_SERVICE_DURATION_POLICY_REQUIRES_PRICING',
      }),
    );
    renderWithIntl(
      <ServiceBookingPolicyPanel
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('policy-save'));
    expect(await screen.findByTestId('policy-error')).toHaveTextContent(
      'variável também deve declarar uma política de precificação',
    );
  });

  it('calls onDirtyChange(true) when a field changes', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderWithIntl(
      <ServiceBookingPolicyPanel
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });
});
