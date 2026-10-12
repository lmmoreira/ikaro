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
  props: Omit<
    Parameters<typeof ServiceBookingPolicyPanel>[0],
    'onActionChange' | 'hasLegs' | 'resourceRequirements' | 'requiresPickupAddress'
  > &
    Partial<
      Pick<
        Parameters<typeof ServiceBookingPolicyPanel>[0],
        'hasLegs' | 'resourceRequirements' | 'requiresPickupAddress'
      >
    >,
) {
  const [action, setAction] = useState<ServiceTabAction | null>(null);
  return (
    <>
      <ServiceBookingPolicyPanel
        hasLegs={false}
        resourceRequirements={[]}
        requiresPickupAddress={false}
        {...props}
        onActionChange={setAction}
      />
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
  effectiveMinBookingAdvanceHours: 0,
  effectiveMaxBookingAdvanceDays: 90,
  recurrenceEligible: false,
  recurringHorizonDays: null,
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

  it('submits all 17 UpdateServiceBookingPolicySchema fields on save', async () => {
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

  it('saves the recurring-schedule maximum term the manager typed', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <PolicyPanelWithAction
        serviceId="svc-1"
        initialPolicy={{ ...BASE_POLICY, recurrenceEligible: true }}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId('policy-recurring-horizon'), '45');
    await user.click(screen.getByTestId('policy-save'));

    expect(mutateAsync.mock.calls[0]![0].body).toMatchObject({ recurringHorizonDays: 45 });
  });

  it('blocks the save and shows the inline error for an out-of-range maximum term, then recovers', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <PolicyPanelWithAction
        serviceId="svc-1"
        initialPolicy={{ ...BASE_POLICY, recurrenceEligible: true }}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId('policy-recurring-horizon'), '181');
    expect(screen.getByTestId('policy-recurring-horizon-error')).toBeInTheDocument();
    expect(screen.getByTestId('policy-save')).toBeDisabled();

    await user.clear(screen.getByTestId('policy-recurring-horizon'));
    await user.type(screen.getByTestId('policy-recurring-horizon'), '180');
    expect(screen.queryByTestId('policy-recurring-horizon-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('policy-save')).toBeEnabled();
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
  // TD49-S03 / UC-055 step 3: an advisory hint, computed from the saved service, never blocking.
  describe('the recurrence hint', () => {
    it('is absent for a service that can recur (no requirement)', () => {
      renderWithIntl(
        <PolicyPanelWithAction
          serviceId="svc-1"
          initialPolicy={BASE_POLICY}
          onDirtyChange={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('policy-recurrence-hint')).toBeNull();
    });

    // TD49 Story 2: a bundle can recur, so a second resource is no longer a reason.
    it('is absent for a staff + room bundle that can recur', () => {
      renderWithIntl(
        <PolicyPanelWithAction
          serviceId="svc-1"
          initialPolicy={{ ...BASE_POLICY, recurrenceEligible: true }}
          resourceRequirements={[
            {
              type: 'STAFF',
              selectionMode: 'AUTO_ANY',
              resourcePoolIds: null,
              requiredQuantity: 1,
            },
            { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
          ]}
          onDirtyChange={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('policy-recurrence-hint')).toBeNull();
    });

    it('still names a requirement of quantity two inside a bundle and keeps saving enabled', () => {
      renderWithIntl(
        <PolicyPanelWithAction
          serviceId="svc-1"
          initialPolicy={{ ...BASE_POLICY, recurrenceEligible: true }}
          resourceRequirements={[
            {
              type: 'STAFF',
              selectionMode: 'AUTO_ANY',
              resourcePoolIds: null,
              requiredQuantity: 1,
            },
            { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 2 },
          ]}
          onDirtyChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId('policy-recurrence-hint').textContent).toContain(
        'mais de uma unidade',
      );
      expect(screen.getByTestId('policy-save').hasAttribute('disabled')).toBe(false);
    });

    it.each([
      ['legs', { hasLegs: true }, 'ele tem etapas'],
      ['a pickup address', { requiresPickupAddress: true }, 'endereço de coleta'],
    ])('names %s', (_label, props, expected) => {
      renderWithIntl(
        <PolicyPanelWithAction
          serviceId="svc-1"
          initialPolicy={BASE_POLICY}
          onDirtyChange={vi.fn()}
          {...props}
        />,
      );

      expect(screen.getByTestId('policy-recurrence-hint').textContent).toContain(expected);
    });

    it('appears once the customer-chosen duration is selected in the same tab', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <PolicyPanelWithAction
          serviceId="svc-1"
          initialPolicy={BASE_POLICY}
          onDirtyChange={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('policy-recurrence-hint')).toBeNull();

      await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'CUSTOMER_SELECTED');

      expect(screen.getByTestId('policy-recurrence-hint').textContent).toContain(
        'o cliente escolhe a duração',
      );
    });
  });
});
