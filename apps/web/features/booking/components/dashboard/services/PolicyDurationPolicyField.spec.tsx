// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { PolicyDurationPolicyField } from './PolicyDurationPolicyField';

const FIXED_POLICY: ServiceBookingPolicyItem = {
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

describe('PolicyDurationPolicyField', () => {
  it('offers both duration policies for a service without legs', () => {
    renderWithIntl(
      <PolicyDurationPolicyField policy={FIXED_POLICY} hasLegs={false} onPatch={vi.fn()} />,
    );

    expect(screen.getByRole('option', { name: 'Fixa' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Cliente escolhe' })).toBeEnabled();
    expect(screen.queryByText(/serviço com etapas tem duração fixa/)).not.toBeInTheDocument();
  });

  it('does not offer a customer-chosen duration for a service that has legs (its length is fixed by its legs)', () => {
    renderWithIntl(<PolicyDurationPolicyField policy={FIXED_POLICY} hasLegs onPatch={vi.fn()} />);

    expect(screen.getByTestId('policy-duration-policy')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Fixa' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Cliente escolhe' })).toBeDisabled();
    expect(screen.getByText(/serviço com etapas tem duração fixa/)).toBeInTheDocument();
  });

  it('patches the new durationPolicy', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(
      <PolicyDurationPolicyField policy={FIXED_POLICY} hasLegs={false} onPatch={onPatch} />,
    );

    await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'CUSTOMER_SELECTED');

    expect(onPatch).toHaveBeenCalledWith({ durationPolicy: 'CUSTOMER_SELECTED' });
  });

  it('forces pricing back to FIXED when switching back to a fixed duration', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(
      <PolicyDurationPolicyField
        policy={{
          ...FIXED_POLICY,
          durationPolicy: 'CUSTOMER_SELECTED',
          pricingPolicy: 'PER_TIME_INCREMENT',
        }}
        hasLegs={false}
        onPatch={onPatch}
      />,
    );

    await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'FIXED');

    expect(onPatch).toHaveBeenCalledWith({ durationPolicy: 'FIXED', pricingPolicy: 'FIXED' });
  });
});
