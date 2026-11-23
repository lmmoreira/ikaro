import { Command } from '../../../../shared/domain/command';

export type BillingReminderKind =
  | 'PLAN_CONFIRMATION'
  | 'TRIAL_ENDING'
  | 'CHARGE_DUE_SOON'
  | 'CHARGE_OVERDUE'
  | 'RECOVERY_CHARGE_OPEN';

interface BillingReminderDueData extends Record<string, unknown> {
  subscriptionId: string;
  kind: BillingReminderKind;
  daysOffset: number;
  chargeId: string | null;
  paymentUrl: string | null;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
  // The reminder's dates and amount (M26-S09). Notification has no Billing read port, so the copy
  // takes them from here. Local `YYYY-MM-DD` in the subscription's timezone; `null` when the kind
  // has none (`docs/DOMAIN_EVENTS.md` says which kind fills which, under § BillingReminderDue). Payload
  // only: none of them is part of the dedup key.
  dueDate: string | null;
  trialEndsOn: string | null;
  suspendsOn: string | null;
  amountMinor: number | null;
  currency: string | null;
}

// A Command, not a fact: an instruction to send one dunning email, derived by the daily reminders
// job, which a retried or overlapping tick can re-derive for the same milestone. The dedup key is
// the business key (subscription, kind, daysOffset, scope): the scope is the charge id of a charge
// reminder, and for a trial reminder, which names no charge, the local date the trial ends on. That
// date is stable across a retried run (the first invoice appearing in between does not change it)
// and differs for a second trial on the same subscription (exempt, then cleared), so a restarted
// trial is not silenced by the first one's keys. `recipientEmail`, `paymentUrl` and the other date
// and amount fields are deliberately not part of it, so a changed billing email cannot mint a
// second reminder.
// Its topic is created by its consumer's `subscribe()` (M26-S12); it has no audit-log line.
export class BillingReminderDue extends Command<BillingReminderDueData> {
  readonly eventVersion = 1;
  readonly data: BillingReminderDueData;

  constructor(tenantId: string, correlationId: string, data: BillingReminderDueData) {
    super(
      tenantId,
      correlationId,
      `BillingReminderDue:${tenantId}:${data.subscriptionId}:${data.kind}:${data.daysOffset}:${data.chargeId ?? data.trialEndsOn ?? 'none'}`,
    );
    this.data = data;
  }
}
