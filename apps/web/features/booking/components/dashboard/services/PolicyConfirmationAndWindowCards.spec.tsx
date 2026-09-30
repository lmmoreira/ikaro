// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  PolicyConfirmationCard,
  PolicyBookingWindowCard,
  PolicyWhoHowCard,
} from './PolicyConfirmationAndWindowCards';

const BASE_POLICY: ServiceBookingPolicyItem = {
  defaultApprovalMode: null,
  manualHoldMinutes: null,
  cancellationWindowHoursOverride: null,
  rescheduleWindowHoursOverride: null,
  minBookingAdvanceHoursOverride: null,
  maxBookingAdvanceDaysOverride: null,
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
    renderWithIntl(<PolicyBookingWindowCard policy={BASE_POLICY} onPatch={vi.fn()} />);

    expect(screen.getByTestId('policy-min-advance')).toBeInTheDocument();
    expect(screen.getByTestId('policy-max-advance')).toBeInTheDocument();
  });

  it('calls onPatch with a parsed number when the min-advance field changes', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(<PolicyBookingWindowCard policy={BASE_POLICY} onPatch={onPatch} />);

    await user.type(screen.getByTestId('policy-min-advance'), '2');
    expect(onPatch).toHaveBeenCalledWith({ minBookingAdvanceHoursOverride: 2 });
  });
});

describe('PolicyWhoHowCard', () => {
  it('toggles recurrenceEligible and availabilityAlertEligible', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(<PolicyWhoHowCard policy={BASE_POLICY} onPatch={onPatch} />);

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    expect(onPatch).toHaveBeenCalledWith({ recurrenceEligible: true });

    await user.click(screen.getByTestId('policy-availability-alert-eligible'));
    expect(onPatch).toHaveBeenCalledWith({ availabilityAlertEligible: true });
  });

  describe('recurringHorizonDays', () => {
    const RECURRING_POLICY = { ...BASE_POLICY, recurrenceEligible: true };

    it('renders the current value, or blank when null', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 60 }}
          onPatch={vi.fn()}
        />,
      );
      expect(screen.getByTestId('policy-recurring-horizon')).toHaveValue(60);

      rerender(<PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />);
      expect(screen.getByTestId('policy-recurring-horizon')).toHaveValue(null);
    });

    it('is disabled while recurrence is off and enabled once it is on', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard policy={BASE_POLICY} onPatch={vi.fn()} />,
      );
      expect(screen.getByTestId('policy-recurring-horizon')).toBeDisabled();

      rerender(<PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />);
      expect(screen.getByTestId('policy-recurring-horizon')).toBeEnabled();
    });

    it('calls onPatch with the parsed number, and with null when cleared', async () => {
      const user = userEvent.setup();
      const onPatch = vi.fn();
      renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 6 }}
          onPatch={onPatch}
        />,
      );

      await user.type(screen.getByTestId('policy-recurring-horizon'), '0');
      expect(onPatch).toHaveBeenCalledWith({ recurringHorizonDays: 60 });

      await user.clear(screen.getByTestId('policy-recurring-horizon'));
      expect(onPatch).toHaveBeenLastCalledWith({ recurringHorizonDays: null });
    });

    it('shows no error for a blank or in-range value', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />,
      );
      expect(screen.queryByTestId('policy-recurring-horizon-error')).not.toBeInTheDocument();

      rerender(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 180 }}
          onPatch={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('policy-recurring-horizon-error')).not.toBeInTheDocument();
    });

    it.each([0, 181, 1.5])('shows the inline range error for %j', (value) => {
      renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: value }}
          onPatch={vi.fn()}
        />,
      );

      expect(screen.getByTestId('policy-recurring-horizon-error')).toHaveTextContent(
        'Informe um número inteiro de 1 a 180 dias.',
      );
      expect(screen.getByTestId('policy-recurring-horizon')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
  });
});
