import { FEATURE_KEYS } from '@ikaro/validation';
import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import type { BillingSummaryReadyResponse } from '@ikaro/types';
import {
  BillingChargeHistoryItemBuilder,
  BillingSummaryBuilder,
} from '../../test/builders/billing-summary.builder';
import {
  failOpenBackendAccess,
  recoverAccessLookup,
  toBillingAccessResponse,
  toBillingChargesResponse,
  toBillingSummaryResponse,
} from './billing.mapper';
import { BackendBillingChargesSchema, BackendBillingSummarySchema } from './billing.schemas';
import type { BackendTenantAccess } from './billing.types';

const ACCESS: BackendTenantAccess = {
  status: 'PAST_DUE',
  operational: true,
  features: [
    { key: 'HOTSITE', tier: 'STANDARD' },
    { key: 'CHATBOT', tier: 'BASIC' },
  ],
};

describe('toBillingAccessResponse', () => {
  it('gives a MANAGER the status, operational flag and features', () => {
    expect(toBillingAccessResponse('MANAGER', ACCESS)).toEqual({
      status: 'PAST_DUE',
      operational: true,
      features: ACCESS.features,
    });
  });

  it('gives STAFF the operational flag and features, never the status', () => {
    const view = toBillingAccessResponse('STAFF', ACCESS);

    expect(view).toEqual({ operational: true, features: ACCESS.features });
    expect(view).not.toHaveProperty('status');
  });

  it('gives a CUSTOMER the operational flag and only the customer-facing features held', () => {
    const access: BackendTenantAccess = {
      ...ACCESS,
      features: [...ACCESS.features, { key: 'LOYALTY', tier: 'STANDARD' }],
    };
    expect(toBillingAccessResponse('CUSTOMER', access)).toEqual({
      operational: true,
      features: ['LOYALTY'],
    });
  });

  it('gives a CUSTOMER no features when the tenant holds none a customer can use', () => {
    expect(toBillingAccessResponse('CUSTOMER', ACCESS)).toEqual({
      operational: true,
      features: [],
    });
  });

  it.each(['MANAGER', 'STAFF', 'CUSTOMER'] as const)(
    'never carries a suspension reason or an internal marker for %s, even when the input does',
    (role) => {
      // What the backend really sends for a suspended tenant, markers and reason included.
      const backendAnswer: BackendTenantAccess & Record<string, unknown> = {
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [],
        provisional: true,
        degraded: true,
      };

      const serialized = JSON.stringify(toBillingAccessResponse(role, backendAnswer));

      expect(serialized).not.toContain('suspensionReason');
      expect(serialized).not.toContain('NON_PAYMENT');
      expect(serialized).not.toContain('provisional');
      expect(serialized).not.toContain('degraded');
    },
  );
});

describe('failOpenBackendAccess', () => {
  it('is operational with every sellable feature, chatbot at BASIC', () => {
    const access = failOpenBackendAccess();

    expect(access).toMatchObject({ status: 'ACTIVE', operational: true });
    expect(access.features.map((feature) => feature.key).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(access.features.find((feature) => feature.key === 'CHATBOT')?.tier).toBe('BASIC');
  });
});

describe('recoverAccessLookup', () => {
  const recordingLogger = () => {
    const messages: string[] = [];
    return { messages, error: (message: string) => void messages.push(message) };
  };

  it('fails open and logs the cause on an outage', () => {
    const logger = recordingLogger();

    const access = recoverAccessLookup(new Error('ECONNRESET'), 't-1', logger);

    expect(access).toEqual(failOpenBackendAccess());
    expect(logger.messages).toHaveLength(1);
    expect(logger.messages[0]).toContain("tenant 't-1'");
    expect(logger.messages[0]).toContain('ECONNRESET');
  });

  it('fails open on a 5xx and logs it', () => {
    const logger = recordingLogger();

    const access = recoverAccessLookup(
      new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE),
      't-1',
      logger,
    );

    expect(access.operational).toBe(true);
    expect(logger.messages).toHaveLength(1);
  });

  it('fails open on a body that does not match the contract, logged as an invalid backend response', () => {
    const logger = recordingLogger();
    const schemaError = z.object({ status: z.string() }).safeParse({}).error as z.ZodError;

    const access = recoverAccessLookup(schemaError, 't-1', logger);

    expect(access.operational).toBe(true);
    expect(logger.messages[0]).toContain('invalid backend response');
  });

  it('rethrows a 4xx and logs nothing: it is a real answer, never fail-open', () => {
    const logger = recordingLogger();
    const notFound = new HttpException('not found', HttpStatus.NOT_FOUND);

    expect(() => recoverAccessLookup(notFound, 't-1', logger)).toThrow(notFound);
    expect(logger.messages).toHaveLength(0);
  });
});

describe('toBillingSummaryResponse', () => {
  const parse = (raw: unknown) => BackendBillingSummarySchema.parse(raw);

  it('passes the enums, flags and dates through and builds no display string', () => {
    const backend = new BillingSummaryBuilder().withStatus('PAST_DUE').withExempt(false).build();

    const response = toBillingSummaryResponse(parse(backend));

    expect(response).toEqual(backend);
    expect(response).toMatchObject({
      provisioning: false,
      status: 'PAST_DUE',
      exempt: false,
      timezone: 'America/Sao_Paulo',
      nextCycle: null,
      nextCycleFrom: null,
      canDiscard: false,
    });
  });

  it('carries the exempt flag with no open charge and no items', () => {
    const backend = new BillingSummaryBuilder()
      .withExempt(true)
      .withOpenCharge(null)
      .withItems([], 0)
      .build();

    expect(toBillingSummaryResponse(parse(backend))).toMatchObject({
      exempt: true,
      openCharge: null,
      items: [],
      totalMinor: 0,
    });
  });

  it('maps each announced price change field by field', () => {
    const backend = new BillingSummaryBuilder().build();
    backend.upcomingPriceChanges = [
      {
        featureKey: 'HOTSITE',
        tier: 'STANDARD',
        currentAmountMinor: 4900,
        newAmountMinor: 5900,
        effectiveFrom: '2027-02-01',
      },
    ];

    const response = toBillingSummaryResponse(parse(backend));

    expect(response).toMatchObject({
      upcomingPriceChanges: [
        {
          featureKey: 'HOTSITE',
          tier: 'STANDARD',
          currentAmountMinor: 4900,
          newAmountMinor: 5900,
          effectiveFrom: '2027-02-01',
        },
      ],
    });
  });

  it('answers only the provisioning flag for a tenant with no subscription', () => {
    expect(toBillingSummaryResponse(parse({ provisioning: true, status: 'ACTIVE' }))).toEqual({
      provisioning: true,
    });
  });

  it('never lets a payment URL or an unknown field through, even if the backend sends one', () => {
    const backend = new BillingSummaryBuilder().build();
    const leaky = {
      ...backend,
      secret: 'x',
      openCharge: {
        ...backend.openCharge,
        paymentUrl: 'https://pay.example/leak',
        paymentUrlExpiresAt: '2026-11-18T12:00:00.000Z',
      },
    };

    const response = toBillingSummaryResponse(parse(leaky));

    expect(JSON.stringify(response)).not.toContain('https://pay.example/leak');
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(Object.keys((response as BillingSummaryReadyResponse).openCharge ?? {}).sort()).toEqual(
      [
        'amountMinor',
        'dueDate',
        'hasPaymentLink',
        'id',
        'kind',
        'paymentLinkExpiresAt',
        'status',
        'subtotalMinor',
        'taxMinor',
      ].sort(),
    );
  });

  it('keeps a missing price as null instead of inventing one', () => {
    const backend = new BillingSummaryBuilder()
      .withItems([{ featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: null }], null)
      .build();

    expect(toBillingSummaryResponse(parse(backend))).toMatchObject({
      items: [{ unitPriceMinor: null }],
      totalMinor: null,
    });
  });

  it('rejects a backend answer that breaks the contract', () => {
    expect(() => parse({ ...new BillingSummaryBuilder().build(), status: 'WHATEVER' })).toThrow();
  });
});

describe('toBillingChargesResponse', () => {
  const parse = (raw: unknown) => BackendBillingChargesSchema.parse(raw);
  const page = (items: unknown[]) => ({
    items,
    pagination: { limit: 25, offset: 0, total: items.length, hasMore: false },
  });

  it('maps a paid charge with its lines and an https receipt link', () => {
    const item = new BillingChargeHistoryItemBuilder().build();

    expect(toBillingChargesResponse(parse(page([item])))).toEqual(page([item]));
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['http://receipts.example/r/1'],
    ['/relative/receipt'],
    ['not a url'],
  ])('rejects the receipt link %s', (receiptUrl) => {
    const item = new BillingChargeHistoryItemBuilder().withReceiptUrl(receiptUrl).build();

    expect(() => parse(page([item]))).toThrow();
  });

  it('keeps a null receipt link and an empty tax-line list', () => {
    const item = new BillingChargeHistoryItemBuilder().withReceiptUrl(null).build();

    const [mapped] = toBillingChargesResponse(parse(page([item]))).items;

    expect(mapped.receiptUrl).toBeNull();
    expect(mapped.taxLines).toEqual([]);
  });
});
