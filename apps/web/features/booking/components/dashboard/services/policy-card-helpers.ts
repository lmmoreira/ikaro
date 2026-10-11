import type { ServiceBookingPolicyItem } from '@ikaro/types';

// Shared by the Políticas de reserva cards.

export interface PolicyCardProps {
  readonly policy: ServiceBookingPolicyItem;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
}

export function toNumberInput(value: number | null): string {
  return value === null ? '' : String(value);
}

export function parseNullableNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
