import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

export const SIMULATE_EVENTS = [
  'PAID_PIX',
  'PAID_BOLETO',
  'PAID_CARD',
  'OVERDUE',
  'REFUND_FULL',
  'REFUND_PARTIAL',
  'CHARGEBACK_OPENED',
  'CHARGEBACK_LOST',
] as const;
export type SimulateEvent = (typeof SIMULATE_EVENTS)[number];

export const SIMULATE_DELIVERIES = ['NORMAL', 'DUPLICATE', 'DELAYED', 'OUT_OF_ORDER'] as const;
export type SimulateDelivery = (typeof SIMULATE_DELIVERIES)[number];

export const SIMULATE_FAILURES = ['PROVIDER_5XX', 'LINK_EXPIRED', 'INVALID_LOCATION'] as const;
export type SimulateFailure = (typeof SIMULATE_FAILURES)[number];

// Exactly one of `tenantId` / `chargeId`: the tenant form picks the charge by the event, the charge
// form names it. `.strict()` so a misspelt key is a `400`, never silently ignored.
export const SimulateProviderEventSchema = z
  .object({
    tenantId: z.uuid().optional(),
    chargeId: z.uuid().optional(),
    event: z.enum(SIMULATE_EVENTS),
    delivery: z.enum(SIMULATE_DELIVERIES).default('NORMAL'),
    failure: z.enum(SIMULATE_FAILURES).optional(),
  })
  .strict()
  .refine((value) => (value.tenantId === undefined) !== (value.chargeId === undefined), {
    path: ['tenantId'],
    params: { code: GenericErrorCode.VALUE_INVALID },
    message: 'exactly one of tenantId and chargeId is required',
  });

export type SimulateProviderEventDto = z.infer<typeof SimulateProviderEventSchema>;
