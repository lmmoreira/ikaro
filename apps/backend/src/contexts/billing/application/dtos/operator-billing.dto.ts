import { z } from 'zod';

// The operator routes (M25-S15b, UC-111 / UC-137). `operator` is the person's name, sent by
// `scripts/billing-operator.sh` and stored as `operator_audit.actor` (the shared platform key cannot
// tell operators apart, so the audit records the claimed name, not a verified identity). Its bound
// is the `actor` column size; `reason` is bounded well under the audit payload's 4 KB cap.
export const OPERATOR_NAME_MAX_LENGTH = 100;
export const OPERATOR_REASON_MAX_LENGTH = 500;

const operatorFields = {
  operator: z.string().trim().min(1).max(OPERATOR_NAME_MAX_LENGTH),
  reason: z.string().trim().min(1).max(OPERATOR_REASON_MAX_LENGTH),
};

export const OperatorActionSchema = z.object(operatorFields);
export type OperatorActionDto = z.infer<typeof OperatorActionSchema>;

export const ExtendGraceSchema = z.object({
  ...operatorFields,
  graceUntil: z.iso.datetime(),
});
export type ExtendGraceDto = z.infer<typeof ExtendGraceSchema>;

export const SetExemptSchema = z.object({
  ...operatorFields,
  exempt: z.boolean(),
});
export type SetExemptDto = z.infer<typeof SetExemptSchema>;

export const SUBSCRIPTION_STATUS_VALUES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;

// Pattern A offset pagination, the same bounds as the other lists (docs/API_CONTRACTS.md § Base
// Standards): limit 1-100 (default 25), offset >= 0 (default 0); `status` omitted = every status.
export const ListTenantBillingStatusSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUS_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTenantBillingStatusDto = z.infer<typeof ListTenantBillingStatusSchema>;
