import type { ServiceBookingPolicyItem } from '@ikaro/types';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';

// Shared by the Políticas de reserva cards.

export interface PolicyCardProps {
  readonly policy: ServiceBookingPolicyItem;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
}

// What a card needs from the panel's useFormFeedback to mark an input as invalid: the ref and
// aria wiring, the message, and the id the message is referenced by.
export type PolicyFieldBindings = Pick<
  ReturnType<typeof useFormFeedback>,
  'fieldProps' | 'fieldErrors' | 'fieldErrorId'
>;

export interface PolicyFieldCardProps extends PolicyCardProps {
  readonly fields: PolicyFieldBindings;
}

export function toNumberInput(value: number | null): string {
  return value === null ? '' : String(value);
}

export function parseNullableNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
