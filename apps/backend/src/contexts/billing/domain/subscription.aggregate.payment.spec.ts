import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { SubscriptionBuilder } from '../../../test/builders/billing';
import type { SuspensionReason } from './subscription.types';

// Subscription timezone is America/Sao_Paulo (UTC-3, no DST): 2026-03-10T15:00Z is 12:00 local.
const NOW = new Date('2026-03-10T15:00:00Z');
const CORRELATION = 'corr-payment';
const EMAIL = 'billing@example.test';
const date = (value: string): CalendarDate => CalendarDate.create(value);
const at = (iso: string): Date => new Date(iso);

// The tenant-local last millisecond of a day in São Paulo: 23:59:59.999 local = 02:59:59.999Z next day.
const endOfLocalDay = (day: string): Date => {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() + 3 * 60 * 60 * 1000 - 1);
};
const startOfLocalDay = (day: string): Date => new Date(`${day}T03:00:00Z`);

const PAYMENT_SUSPENSIONS: SuspensionReason[] = ['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED'];

describe('Subscription — payment facts (UC-114)', () => {
  describe('markPeriodPaid', () => {
    it('TRIALING: records hasEverPaid and nothing else (the sweep writes the period at trial end)', () => {
      const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();

      const changed = subscription.markPeriodPaid(
        date('2026-03-24'),
        date('2026-04-23'),
        NOW,
        CORRELATION,
        EMAIL,
      );

      expect(changed).toBe(true);
      expect(subscription.status).toBe('TRIALING');
      expect(subscription.hasEverPaid).toBe(true);
      expect(subscription.currentPeriodStart).toBeNull();
      expect(subscription.currentPeriodEnd).toBeNull();
      expect(subscription.domainEvents).toEqual([]);
    });

    it('ACTIVE: moves the end to the charge end and the start to the charge start when it began today or earlier', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(startOfLocalDay('2026-02-10'), endOfLocalDay('2026-03-09'))
        .withNextDueDate('2026-04-10')
        .build();
      const anchorBefore = subscription.anchorDay;

      subscription.markPeriodPaid(date('2026-03-10'), date('2026-04-09'), NOW, CORRELATION, EMAIL);

      expect(subscription.currentPeriodStart).toEqual(startOfLocalDay('2026-03-10'));
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
      expect(subscription.hasEverPaid).toBe(true);
      expect(subscription.anchorDay).toBe(anchorBefore);
      expect(subscription.nextDueDate?.value).toBe('2026-04-10');
    });

    it('ACTIVE: an invoice issued early (starting in the future) does not change the current start', () => {
      const start = startOfLocalDay('2026-02-10');
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(start, endOfLocalDay('2026-03-14'))
        .build();

      subscription.markPeriodPaid(date('2026-03-15'), date('2026-04-14'), NOW, CORRELATION, EMAIL);

      expect(subscription.currentPeriodStart).toEqual(start);
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-14'));
    });

    it('ACTIVE: a charge that ends before the current end never shortens it', () => {
      const end = endOfLocalDay('2026-05-09');
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(startOfLocalDay('2026-04-10'), end)
        .build();

      subscription.markPeriodPaid(date('2026-03-10'), date('2026-04-09'), NOW, CORRELATION, EMAIL);

      expect(subscription.currentPeriodEnd).toEqual(end);
    });

    it('PAST_DUE: becomes ACTIVE, clears the overdue and grace marks and keeps the charge own period', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withCurrentPeriod(startOfLocalDay('2026-02-10'), endOfLocalDay('2026-03-09'))
        .withPastDueSince(at('2026-03-10T03:00:00Z'))
        .withGraceUntil(at('2026-03-30T03:00:00Z'))
        .build();

      subscription.markPeriodPaid(date('2026-03-10'), date('2026-04-09'), NOW, CORRELATION, EMAIL);

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.graceUntil).toBeNull();
      expect(subscription.currentPeriodStart).toEqual(startOfLocalDay('2026-03-10'));
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
      expect(subscription.domainEvents).toEqual([]);
    });

    it.each(PAYMENT_SUSPENSIONS)(
      'SUSPENDED (%s): the stale charge is the payment, so the tenant is reactivated and SubscriptionReactivated carries the recipient',
      (reason) => {
        const suspendedAt = at('2026-03-01T03:00:00Z');
        const subscription = new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension(reason, suspendedAt)
          .withPurgeWarnings(at('2026-03-02T03:00:00Z'), null)
          .withCurrentPeriod(startOfLocalDay('2026-01-10'), endOfLocalDay('2026-02-09'))
          .build();

        subscription.markPeriodPaid(
          date('2026-03-10'),
          date('2026-04-09'),
          NOW,
          CORRELATION,
          EMAIL,
        );

        expect(subscription.status).toBe('ACTIVE');
        expect(subscription.suspensionReason).toBeNull();
        expect(subscription.suspendedAt).toBeNull();
        expect(subscription.purgeWarning30SentAt).toBeNull();
        expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
        expect(subscription.domainEvents).toHaveLength(1);
        expect(subscription.domainEvents[0]).toMatchObject({
          eventName: 'SubscriptionReactivated',
          correlationId: CORRELATION,
          data: {
            reactivatedAt: NOW.toISOString(),
            suspendedAt: suspendedAt.toISOString(),
            recipientEmail: EMAIL,
            exempt: false,
          },
        });
      },
    );

    it('an OPERATOR suspension is never lifted by a payment', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('OPERATOR', at('2026-03-01T03:00:00Z'))
        .build();

      subscription.markPeriodPaid(date('2026-03-10'), date('2026-04-09'), NOW, CORRELATION, EMAIL);

      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('OPERATOR');
      expect(subscription.hasEverPaid).toBe(true);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('an exempt subscription is never changed by a payment', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      subscription.markPeriodPaid(date('2026-03-10'), date('2026-04-09'), NOW, CORRELATION, EMAIL);

      expect(subscription.currentPeriodEnd).toBeNull();
      expect(subscription.status).toBe('ACTIVE');
    });
  });

  describe('reactivateOnPayment', () => {
    it.each(PAYMENT_SUSPENSIONS)(
      'SUSPENDED (%s): ACTIVE, a fresh month from the payment moment, the anchor and the next due date',
      (reason) => {
        const suspendedAt = at('2026-03-01T03:00:00Z');
        const paidAt = at('2026-03-10T15:00:00Z');
        const subscription = new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension(reason, suspendedAt)
          .withPurgeWarnings(at('2026-03-02T03:00:00Z'), at('2026-03-05T03:00:00Z'))
          .build();

        const changed = subscription.reactivateOnPayment(paidAt, NOW, CORRELATION, EMAIL);

        expect(changed).toBe(true);
        expect(subscription.status).toBe('ACTIVE');
        expect(subscription.suspensionReason).toBeNull();
        expect(subscription.suspendedAt).toBeNull();
        expect(subscription.purgeWarning30SentAt).toBeNull();
        expect(subscription.purgeWarning7SentAt).toBeNull();
        expect(subscription.cancelAt).toBeNull();
        expect(subscription.currentPeriodStart).toEqual(paidAt);
        expect(subscription.anchorDay).toBe(10);
        expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
        expect(subscription.nextDueDate?.value).toBe('2026-04-10');
        expect(subscription.hasEverPaid).toBe(true);
        expect(subscription.domainEvents[0]).toMatchObject({
          eventName: 'SubscriptionReactivated',
          data: { suspendedAt: suspendedAt.toISOString(), recipientEmail: EMAIL },
        });
      },
    );

    it("uses the payment's tenant-local day, clamped to 28", () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', at('2026-01-01T03:00:00Z'))
        .build();
      // 2026-02-01T02:00Z is still 2026-01-31 23:00 in São Paulo.
      const paidAt = at('2026-02-01T02:00:00Z');

      subscription.reactivateOnPayment(paidAt, paidAt, CORRELATION, null);

      expect(subscription.anchorDay).toBe(28);
      expect(subscription.nextDueDate?.value).toBe('2026-02-28');
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-02-27'));
    });

    it('an OPERATOR suspension is never lifted by a payment', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('OPERATOR', at('2026-03-01T03:00:00Z'))
        .build();

      const changed = subscription.reactivateOnPayment(NOW, NOW, CORRELATION, EMAIL);

      expect(changed).toBe(true); // only hasEverPaid moved
      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('OPERATOR');
      expect(subscription.domainEvents).toEqual([]);
    });

    it('a subscription that is not suspended keeps its state and raises nothing', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withHasEverPaid(true)
        .withCurrentPeriod(startOfLocalDay('2026-03-01'), endOfLocalDay('2026-03-31'))
        .build();

      const changed = subscription.reactivateOnPayment(NOW, NOW, CORRELATION, EMAIL);

      expect(changed).toBe(false);
      expect(subscription.currentPeriodStart).toEqual(startOfLocalDay('2026-03-01'));
      expect(subscription.domainEvents).toEqual([]);
    });
  });

  describe('reversePayment', () => {
    const activeWithCurrentPeriod = (): SubscriptionBuilder =>
      new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withHasEverPaid(true)
        .withCurrentPeriod(startOfLocalDay('2026-03-10'), endOfLocalDay('2026-04-09'));
    const periodCharge = (start: string, end: string) => ({
      kind: 'PERIOD' as const,
      periodStart: date(start),
      periodEnd: date(end),
      paidAt: at('2026-03-10T15:00:00Z'),
    });

    it.each(['ACTIVE', 'PAST_DUE'] as const)(
      'suspends a %s tenant with PAYMENT_REVERSED when the charge covered today',
      (status) => {
        const subscription = activeWithCurrentPeriod().withStatus(status).build();

        const changed = subscription.reversePayment(
          periodCharge('2026-03-10', '2026-04-09'),
          NOW,
          CORRELATION,
          EMAIL,
        );

        expect(changed).toBe(true);
        expect(subscription.status).toBe('SUSPENDED');
        expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
        expect(subscription.suspendedAt).toEqual(NOW);
        expect(subscription.domainEvents[0]).toMatchObject({
          eventName: 'SubscriptionSuspended',
          data: {
            reason: 'PAYMENT_REVERSED',
            suspendedAt: NOW.toISOString(),
            purgeAt: new Date(NOW.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            recipientEmail: EMAIL,
          },
        });
      },
    );

    it('a refund of an OLDER period changes no access', () => {
      const subscription = activeWithCurrentPeriod().build();

      const changed = subscription.reversePayment(
        periodCharge('2026-02-10', '2026-03-09'),
        NOW,
        CORRELATION,
        EMAIL,
      );

      expect(changed).toBe(false);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.domainEvents).toEqual([]);
    });

    it('a refund of a FUTURE period (invoice issued early) changes no access', () => {
      const subscription = activeWithCurrentPeriod().build();

      expect(
        subscription.reversePayment(
          periodCharge('2026-04-10', '2026-05-09'),
          NOW,
          CORRELATION,
          EMAIL,
        ),
      ).toBe(false);
      expect(subscription.status).toBe('ACTIVE');
    });

    it('a RECOVERY charge settles the current period only when it is the payment that started it', () => {
      const paidAt = at('2026-03-10T15:00:00Z');
      const settled = { kind: 'RECOVERY' as const, periodStart: null, periodEnd: null, paidAt };
      const current = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(paidAt, endOfLocalDay('2026-04-09'))
        .build();
      const older = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(at('2026-03-10T16:00:00Z'), endOfLocalDay('2026-04-09'))
        .build();

      expect(current.reversePayment(settled, NOW, CORRELATION, EMAIL)).toBe(true);
      expect(older.reversePayment(settled, NOW, CORRELATION, EMAIL)).toBe(false);
    });

    it('a TRIALING tenant is never suspended by a refund: nothing settled is being reversed', () => {
      const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();

      const changed = subscription.reversePayment(
        periodCharge('2026-03-10', '2026-04-09'),
        NOW,
        CORRELATION,
        EMAIL,
      );

      expect(changed).toBe(false);
      expect(subscription.status).toBe('TRIALING');
    });

    it.each([
      ['an already suspended tenant', 'SUSPENDED', 'NON_PAYMENT'],
      ['an operator suspension', 'SUSPENDED', 'OPERATOR'],
    ] as const)('%s keeps its reason', (_label, status, reason) => {
      const subscription = activeWithCurrentPeriod()
        .withStatus(status)
        .withSuspension(reason, at('2026-03-01T03:00:00Z'))
        .build();

      const changed = subscription.reversePayment(
        periodCharge('2026-03-10', '2026-04-09'),
        NOW,
        CORRELATION,
        EMAIL,
      );

      expect(changed).toBe(false);
      expect(subscription.suspensionReason).toBe(reason);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('an exempt tenant is never suspended', () => {
      const subscription = activeWithCurrentPeriod().withExempt(true).build();

      expect(
        subscription.reversePayment(
          periodCharge('2026-03-10', '2026-04-09'),
          NOW,
          CORRELATION,
          EMAIL,
        ),
      ).toBe(false);
    });
  });
});
