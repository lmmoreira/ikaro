import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { ChargeBuilder, ChargeLineBuilder } from '../../../test/builders/billing';
import { Charge, type ChargeStatus } from './charge.aggregate';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { IllegalChargeTransitionError } from './errors/illegal-charge-transition.error';
import { MinorAmount } from './value-objects/minor-amount.vo';

const ALL_STATUSES: ChargeStatus[] = [
  'PENDING',
  'OVERDUE',
  'PAID',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
  'FAILED',
];
const PAID_AT = new Date('2026-03-01T12:00:00Z');
const NOW = new Date('2026-03-02T12:00:00Z');

const chargeIn = (status: ChargeStatus): Charge => new ChargeBuilder().withStatus(status).build();
const brl = (amountMinor: number): MinorAmount => MinorAmount.create(amountMinor, 'BRL');

describe('Charge', () => {
  describe('create', () => {
    const base = {
      tenantId: 't-1',
      subscriptionId: 's-1',
      merchantProfileKey: 'BRL_FAKE',
      kind: 'PERIOD' as const,
      periodStart: CalendarDate.create('2026-04-01'),
      periodEnd: CalendarDate.create('2026-04-30'),
      dueDate: CalendarDate.create('2026-03-22'),
      currency: 'BRL',
    };
    const twoLines = [
      new ChargeLineBuilder().withFeatureKey('HOTSITE').withUnitPriceMinor(4900).build(),
      new ChargeLineBuilder().withFeatureKey('BOOKING').withUnitPriceMinor(10900).build(),
    ];

    it('starts PENDING, with the subtotal as the sum of the lines and an equal amount', () => {
      const charge = Charge.create({ ...base, lines: twoLines });

      expect(charge.status).toBe('PENDING');
      expect(charge.subtotal.amountMinor).toBe(15800);
      expect(charge.amount.amountMinor).toBe(15800);
      expect(charge.amount.currency).toBe('BRL');
      expect(charge.refunded.amountMinor).toBe(0);
      expect(charge.providerCreationStatus).toBe('PENDING');
      expect(charge.providerCreationAttempts).toBe(0);
      expect(charge.providerCancelPending).toBe(false);
      expect(charge.version).toBeUndefined();
      expect(charge.merchantProfileKey).toBe('BRL_FAKE');
    });

    it.each([
      ['no line', { lines: [] }, 'at least one line'],
      [
        'a line in another currency',
        { lines: [new ChargeLineBuilder().withCurrency('USD').build()] },
        'priced in BRL',
      ],
      ['a PERIOD charge without period dates', { lines: twoLines, periodStart: null }, 'PERIOD'],
      [
        'a RECOVERY charge with period dates',
        { lines: twoLines, kind: 'RECOVERY' as const },
        'no period dates',
      ],
    ])('rejects %s', (_name, override, message) => {
      expect(() => Charge.create({ ...base, ...override })).toThrow(ChargeInvariantError);
      expect(() => Charge.create({ ...base, ...override })).toThrow(message);
    });

    it('freezes the lines: they cannot be changed after construction', () => {
      const charge = Charge.create({ ...base, lines: twoLines });

      expect(Object.isFrozen(charge.lines)).toBe(true);
      expect(() => (charge.lines as unknown[]).push({})).toThrow(TypeError);
    });
  });

  describe('markPaid', () => {
    it('raises one ChargePaid carrying the amount, method, receipt and recipient', () => {
      const charge = chargeIn('PENDING');

      charge.markPaid(
        'PIX',
        PAID_AT,
        'https://receipt.example/1',
        'corr-paid',
        'billing@example.test',
      );

      const events = charge.clearDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'ChargePaid',
        tenantId: charge.tenantId,
        correlationId: 'corr-paid',
        data: {
          chargeId: charge.id,
          amountMinor: charge.amount.amountMinor,
          currency: charge.amount.currency,
          method: 'PIX',
          paidAt: PAID_AT.toISOString(),
          receiptUrl: 'https://receipt.example/1',
          recipientEmail: 'billing@example.test',
        },
      });
    });

    it('raises no second ChargePaid for a repeated paid fact', () => {
      const charge = chargeIn('PENDING');
      charge.markPaid('PIX', PAID_AT, null, 'corr-1', null);
      charge.clearDomainEvents();

      charge.markPaid('PIX', PAID_AT, null, 'corr-2', null);

      expect(charge.clearDomainEvents()).toEqual([]);
    });

    it.each(['PENDING', 'OVERDUE', 'CANCELED'] as ChargeStatus[])(
      'a provider paid fact turns a %s charge PAID and stores the method, instant and receipt',
      (status) => {
        const charge = chargeIn(status);

        charge.markPaid('PIX', PAID_AT, 'https://receipt.example/1', 'corr-1', null);

        expect(charge.status).toBe('PAID');
        expect(charge.method).toBe('PIX');
        expect(charge.paidAt).toBe(PAID_AT);
        expect(charge.receiptUrl).toBe('https://receipt.example/1');
      },
    );

    it('stores a null receipt when the provider gave none', () => {
      const charge = chargeIn('PENDING');

      charge.markPaid('BOLETO', PAID_AT, null, 'corr-1', null);

      expect(charge.receiptUrl).toBeNull();
    });

    it('is idempotent: a second paid fact on a PAID charge changes nothing', () => {
      const charge = chargeIn('PENDING');
      charge.markPaid('PIX', PAID_AT, 'https://receipt.example/1', 'corr-1', null);

      charge.markPaid('CARD', new Date('2026-04-01T00:00:00Z'), null, 'corr-1', null);

      expect(charge.method).toBe('PIX');
      expect(charge.paidAt).toBe(PAID_AT);
      expect(charge.receiptUrl).toBe('https://receipt.example/1');
    });

    it.each(['REFUNDED', 'CHARGEBACK', 'FAILED'] as ChargeStatus[])(
      'is illegal on a %s charge',
      (status) => {
        expect(() => chargeIn(status).markPaid('PIX', PAID_AT, null, 'corr-1', null)).toThrow(
          IllegalChargeTransitionError,
        );
      },
    );

    it('clears the provider cancel flag: a paid charge needs no provider cancel any more', () => {
      const charge = new ChargeBuilder().withStatus('CANCELED').withProviderCancelPending().build();

      charge.markPaid('PIX', PAID_AT, null, 'corr-1', null);

      expect(charge.providerCancelPending).toBe(false);
    });
  });

  describe('markOverdue', () => {
    it.each([
      ['PENDING', 'OVERDUE'],
      ['OVERDUE', 'OVERDUE'],
    ] as [ChargeStatus, ChargeStatus][])('%s -> %s', (from, to) => {
      const charge = chargeIn(from);
      charge.markOverdue();
      expect(charge.status).toBe(to);
    });

    it.each(['PAID', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'FAILED'] as ChargeStatus[])(
      'is illegal on a %s charge',
      (status) => {
        expect(() => chargeIn(status).markOverdue()).toThrow(IllegalChargeTransitionError);
      },
    );
  });

  describe('cancel', () => {
    it.each(['PENDING', 'OVERDUE', 'CANCELED'] as ChargeStatus[])('%s -> CANCELED', (from) => {
      const charge = chargeIn(from);
      charge.cancel();
      expect(charge.status).toBe('CANCELED');
    });

    it.each(['PAID', 'REFUNDED', 'CHARGEBACK', 'FAILED'] as ChargeStatus[])(
      'is illegal on a %s charge',
      (status) => {
        expect(() => chargeIn(status).cancel()).toThrow(IllegalChargeTransitionError);
      },
    );
  });

  describe('markRefunded', () => {
    it('the full amount turns a PAID charge REFUNDED', () => {
      const charge = chargeIn('PAID');

      charge.markRefunded(brl(4900));

      expect(charge.status).toBe('REFUNDED');
      expect(charge.refunded.amountMinor).toBe(4900);
    });

    it('a partial refund only raises the refunded total and leaves the charge PAID', () => {
      const charge = chargeIn('PAID');

      charge.markRefunded(brl(1000));

      expect(charge.status).toBe('PAID');
      expect(charge.refunded.amountMinor).toBe(1000);
    });

    it('an older or repeated total changes nothing (the total is absolute)', () => {
      const charge = new ChargeBuilder().withStatus('PAID').withRefundedMinor(2000).build();

      charge.markRefunded(brl(1000));
      charge.markRefunded(brl(2000));

      expect(charge.refunded.amountMinor).toBe(2000);
    });

    it('rejects a refund above the charge amount', () => {
      expect(() => chargeIn('PAID').markRefunded(brl(5000))).toThrow(IllegalChargeTransitionError);
    });

    it('rejects a refund in another currency', () => {
      expect(() => chargeIn('PAID').markRefunded(MinorAmount.create(100, 'USD'))).toThrow(
        ChargeInvariantError,
      );
    });

    it('is a no-op on a charge already REFUNDED', () => {
      const charge = chargeIn('REFUNDED');
      charge.markRefunded(brl(4900));
      expect(charge.status).toBe('REFUNDED');
    });

    it.each(['PENDING', 'OVERDUE', 'CANCELED', 'CHARGEBACK', 'FAILED'] as ChargeStatus[])(
      'is illegal on a %s charge',
      (status) => {
        expect(() => chargeIn(status).markRefunded(brl(100))).toThrow(IllegalChargeTransitionError);
      },
    );
  });

  describe('markChargeback', () => {
    it.each([
      ['PAID', 'CHARGEBACK'],
      ['CHARGEBACK', 'CHARGEBACK'],
    ] as [ChargeStatus, ChargeStatus][])('%s -> %s', (from, to) => {
      const charge = chargeIn(from);
      charge.markChargeback();
      expect(charge.status).toBe(to);
    });

    it.each(['PENDING', 'OVERDUE', 'CANCELED', 'REFUNDED', 'FAILED'] as ChargeStatus[])(
      'is illegal on a %s charge',
      (status) => {
        expect(() => chargeIn(status).markChargeback()).toThrow(IllegalChargeTransitionError);
      },
    );
  });

  describe('status table invariants', () => {
    const methods: Record<string, (charge: Charge) => void> = {
      markPaid: (c) => c.markPaid('PIX', PAID_AT, null, 'corr-1', null),
      markOverdue: (c) => c.markOverdue(),
      cancel: (c) => c.cancel(),
      markRefunded: (c) => c.markRefunded(brl(4900)),
      markChargeback: (c) => c.markChargeback(),
      markProviderCancelPending: (c) => c.markProviderCancelPending(),
      markCreationFailed: (c) => c.markCreationFailed(),
      recordPaymentReturn: (c) => c.recordPaymentReturn(NOW),
    };

    it('FAILED is unreachable: no method of any non-FAILED charge ever ends in it', () => {
      for (const from of ALL_STATUSES.filter((status) => status !== 'FAILED')) {
        for (const apply of Object.values(methods)) {
          const charge = chargeIn(from);
          try {
            apply(charge);
          } catch {
            // an illegal transition is the other legal outcome
          }
          expect(charge.status).not.toBe('FAILED');
        }
      }
    });

    it('a PAID charge can only become REFUNDED or CHARGEBACK', () => {
      for (const [name, apply] of Object.entries(methods)) {
        const charge = chargeIn('PAID');
        try {
          apply(charge);
        } catch {
          // illegal: stays PAID
        }
        const allowed = name === 'markRefunded' || name === 'markChargeback';
        expect(['PAID', ...(allowed ? ['REFUNDED', 'CHARGEBACK'] : [])]).toContain(charge.status);
      }
    });
  });
});
