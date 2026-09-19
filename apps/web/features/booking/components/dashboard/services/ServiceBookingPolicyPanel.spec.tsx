// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { useState } from 'react';
import type { ServiceTabAction } from './service-tab-action';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { ServiceBookingPolicyPanel } from './ServiceBookingPolicyPanel';

// The panel no longer draws its own Save/Publish button — it registers the action with
// ServiceEditPage's sticky action panel. This harness plays that role so the panel's own
// behavior (validation, in-flight state, dirty tracking) stays testable in isolation.
function PolicyPanelWithAction(
  props: Omit<Parameters<typeof ServiceBookingPolicyPanel>[0], 'onActionChange'>,
) {
  const [action, setAction] = useState<ServiceTabAction | null>(null);
  return (
    <>
      <ServiceBookingPolicyPanel {...props} onActionChange={setAction} />
      <button
        type="button"
        data-testid="policy-save"
        disabled={action === null || action.disabled || action.pending}
        onClick={action?.onSubmit}
      >
        {action?.label}
      </button>
    </>
  );
}

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
      <PolicyPanelWithAction
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
      <PolicyPanelWithAction
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
      <PolicyPanelWithAction
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
      <PolicyPanelWithAction
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
      <PolicyPanelWithAction
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it('clears a prior submit error as soon as the policy is edited again', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(
      new ApiError(422, 'Requires pricing', {
        code: 'BOOKING_SERVICE_DURATION_POLICY_REQUIRES_PRICING',
      }),
    );
    renderWithIntl(
      <PolicyPanelWithAction
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('policy-save'));
    expect(await screen.findByTestId('policy-error')).toBeInTheDocument();

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    expect(screen.queryByTestId('policy-error')).not.toBeInTheDocument();
  });

  it('keeps dirty when a newer edit lands while an earlier save is still pending', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    let resolveSave: (value: unknown) => void = () => {};
    mutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderWithIntl(
      <PolicyPanelWithAction
        serviceId="svc-1"
        initialPolicy={BASE_POLICY}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    await user.click(screen.getByTestId('policy-save'));

    // A second edit lands while the first save is still in flight.
    await user.click(screen.getByTestId('policy-availability-alert-eligible'));

    resolveSave({});
    await screen.findByTestId('policy-save');

    expect(onDirtyChange).not.toHaveBeenLastCalledWith(false);
  });
});
