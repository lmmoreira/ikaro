import { addDaysUTC, daysBetweenUTC } from '../../../shared/utils/calendar-date';
import { RECOVERY_CHARGE_DUE_DAYS } from './billing-constants';
import type { BillingReminderKind } from './commands/billing-reminder-due.command';
import type { ChargeKind } from './charge.types';
import type { SubscriptionStatus, SuspensionReason } from './subscription.types';

// UC-139, the milestone rules of the dunning reminders as data (docs/DOMAIN_EVENTS.md §
// BillingReminderDue). A new kind or offset is a row in a table below: the job and the use case do
// not change. The service is pure: it reads no clock and no database, takes "today" as the
// subscription's own local date, and matches the EXACT offset, so a cron day that did not run loses
// its milestone for good (accepted, UC-139).

/** What a rule needs to know about the subscription. */
export interface ReminderSubscription {
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  exempt: boolean;
  planConfirmed: boolean;
  /** The local `YYYY-MM-DD` the trial ends on; `null` outside a trial. */
  trialEndsOn: string | null;
}

/** What a rule needs to know about an open charge (the caller passes open charges only). */
export interface ReminderCharge {
  id: string;
  kind: ChargeKind;
  /** An open charge is `PENDING` until the status sweep marks it `OVERDUE`. */
  status: 'PENDING' | 'OVERDUE';
  /** `YYYY-MM-DD`, in the subscription's timezone. */
  dueDate: string;
}

export interface ReminderMilestone {
  kind: BillingReminderKind;
  daysOffset: number;
  /** The charge a charge reminder is about; always `null` for a trial reminder. */
  chargeId: string | null;
}

interface TrialRule {
  kind: 'PLAN_CONFIRMATION' | 'TRIAL_ENDING';
  /** Days before the local trial end date. */
  offsets: readonly number[];
  applies: (subscription: ReminderSubscription) => boolean;
}

type ChargeAnchor = 'BEFORE_DUE' | 'AFTER_DUE' | 'AFTER_ISSUE';

interface ChargeRule {
  kind: 'CHARGE_DUE_SOON' | 'CHARGE_OVERDUE' | 'RECOVERY_CHARGE_OPEN';
  anchor: ChargeAnchor;
  offsets: readonly number[];
  /** The offsets from this one on are reminders about a charge past its due date: only for an `OVERDUE` one. */
  overdueFrom?: number;
  applies: (subscription: ReminderSubscription, charge: ReminderCharge) => boolean;
}

const RECOVERY_SUSPENSION_REASONS: ReadonlySet<SuspensionReason> = new Set([
  'NON_PAYMENT',
  'PAYMENT_REVERSED',
]);

const TRIAL_RULES: readonly TrialRule[] = [
  {
    kind: 'PLAN_CONFIRMATION',
    offsets: [10, 7, 4],
    applies: (s) => s.status === 'TRIALING' && !s.planConfirmed,
  },
  { kind: 'TRIAL_ENDING', offsets: [7, 3, 0], applies: (s) => s.status === 'TRIALING' },
];

const CHARGE_RULES: readonly ChargeRule[] = [
  {
    kind: 'CHARGE_DUE_SOON',
    anchor: 'BEFORE_DUE',
    offsets: [3],
    // A trial's only open charge is its first one, which TRIAL_ENDING covers; a recovery charge has
    // RECOVERY_CHARGE_OPEN.
    applies: (s, c) => s.status !== 'TRIALING' && c.kind === 'PERIOD',
  },
  {
    kind: 'CHARGE_OVERDUE',
    anchor: 'AFTER_DUE',
    offsets: [1, 3, 7, 12],
    applies: (s, c) => s.status === 'PAST_DUE' && c.kind === 'PERIOD',
  },
  {
    kind: 'RECOVERY_CHARGE_OPEN',
    anchor: 'AFTER_ISSUE',
    // 3 days after issue, then 1 and 7 days after the due date (issue + RECOVERY_CHARGE_DUE_DAYS):
    // those two only once the sweep has marked the charge OVERDUE (UC-139).
    offsets: [3, 8, 14],
    overdueFrom: 8,
    applies: (s, c) =>
      s.status === 'SUSPENDED' &&
      s.suspensionReason !== null &&
      RECOVERY_SUSPENSION_REASONS.has(s.suspensionReason) &&
      c.kind === 'RECOVERY',
  },
];

/** The offset that carries the suspension date: the last overdue reminder (UC-139). */
export const SUSPENSION_DATE_OFFSET = 12;

/** The days from the subscription's local today to the anchor date of a charge, as a rule counts them. */
function chargeOffset(anchor: ChargeAnchor, localToday: string, dueDate: string): number {
  if (anchor === 'BEFORE_DUE') return daysBetweenUTC(localToday, dueDate);
  if (anchor === 'AFTER_DUE') return daysBetweenUTC(dueDate, localToday);
  return daysBetweenUTC(addDaysUTC(dueDate, -RECOVERY_CHARGE_DUE_DAYS), localToday);
}

/**
 * The milestones due today for one subscription: an exempt one has none. `localToday` is today in
 * the subscription's own timezone.
 */
export function remindersDueToday(input: {
  localToday: string;
  subscription: ReminderSubscription;
  charges: readonly ReminderCharge[];
}): ReminderMilestone[] {
  const { localToday, subscription, charges } = input;
  if (subscription.exempt) return [];

  const milestones: ReminderMilestone[] = [];
  if (subscription.trialEndsOn !== null) {
    const daysToEnd = daysBetweenUTC(localToday, subscription.trialEndsOn);
    for (const rule of TRIAL_RULES) {
      if (rule.applies(subscription) && rule.offsets.includes(daysToEnd)) {
        milestones.push({ kind: rule.kind, daysOffset: daysToEnd, chargeId: null });
      }
    }
  }
  for (const charge of charges) {
    for (const rule of CHARGE_RULES) {
      const offset = chargeOffset(rule.anchor, localToday, charge.dueDate);
      const pastDueUnmarked =
        rule.overdueFrom !== undefined && offset >= rule.overdueFrom && charge.status !== 'OVERDUE';
      if (rule.applies(subscription, charge) && rule.offsets.includes(offset) && !pastDueUnmarked) {
        milestones.push({ kind: rule.kind, daysOffset: offset, chargeId: charge.id });
      }
    }
  }
  return milestones;
}

// ── The selection windows, derived from the rules above ────────────────────────────────────────
// Each selection is wider than the rules need by one day, because the date is re-checked in each
// subscription's own zone (a local "today" can be a UTC day ahead or behind).

/** How many days ahead of today a trial can end and still have a reminder due. */
export const TRIAL_WINDOW_AHEAD_DAYS = Math.max(...TRIAL_RULES.flatMap((r) => r.offsets)) + 1;

/** The last day (offset 0) falls up to a day after the trial's local midnight; one day more for the zone. */
export const TRIAL_WINDOW_BEHIND_DAYS = 2;

function dueMinusToday(rule: ChargeRule, offset: number): number {
  if (rule.anchor === 'BEFORE_DUE') return offset;
  if (rule.anchor === 'AFTER_DUE') return -offset;
  return RECOVERY_CHARGE_DUE_DAYS - offset;
}

const DUE_MINUS_TODAY = CHARGE_RULES.flatMap((rule) =>
  rule.offsets.map((offset) => dueMinusToday(rule, offset)),
);

/** The latest due date, in days after today, that still has a charge reminder due. */
export const CHARGE_WINDOW_AHEAD_DAYS = Math.max(...DUE_MINUS_TODAY) + 1;

/** The earliest due date, in days before today, that still has a charge reminder due. */
export const CHARGE_WINDOW_BEHIND_DAYS = -Math.min(...DUE_MINUS_TODAY) + 1;
