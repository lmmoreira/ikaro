// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { renderWithIntl, NO_FIELD_BINDINGS } from '@/test-utils';
import {
  PolicyConfirmationCard,
  PolicyBookingWindowCard,
} from './PolicyConfirmationAndWindowCards';

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

describe('PolicyConfirmationCard', () => {
  it('shows the hold-minutes field only when MANUAL_APPROVAL is selected', () => {
    const { rerender } = renderWithIntl(
      <PolicyConfirmationCard policy={BASE_POLICY} onPatch={vi.fn()} />,
    );
    expect(screen.queryByTestId('policy-hold-minutes')).not.toBeInTheDocument();

    rerender(
      <PolicyConfirmationCard
        policy={{ ...BASE_POLICY, defaultApprovalMode: 'MANUAL_APPROVAL' }}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId('policy-hold-minutes')).toBeInTheDocument();
  });

  it('calls onPatch when switching approval mode', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(<PolicyConfirmationCard policy={BASE_POLICY} onPatch={onPatch} />);

    await user.click(screen.getByTestId('policy-approval-manual'));
    expect(onPatch).toHaveBeenCalledWith({ defaultApprovalMode: 'MANUAL_APPROVAL' });
  });
});

describe('PolicyBookingWindowCard', () => {
  it('renders the min-advance and max-advance fields', () => {
    renderWithIntl(
      <PolicyBookingWindowCard policy={BASE_POLICY} fields={NO_FIELD_BINDINGS} onPatch={vi.fn()} />,
    );

    expect(screen.getByTestId('policy-min-advance')).toBeInTheDocument();
    expect(screen.getByTestId('policy-max-advance')).toBeInTheDocument();
  });

  it('calls onPatch with a parsed number when the min-advance field changes', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(
      <PolicyBookingWindowCard policy={BASE_POLICY} fields={NO_FIELD_BINDINGS} onPatch={onPatch} />,
    );

    await user.type(screen.getByTestId('policy-min-advance'), '2');
    expect(onPatch).toHaveBeenCalledWith({ minBookingAdvanceHoursOverride: 2 });
  });
});
