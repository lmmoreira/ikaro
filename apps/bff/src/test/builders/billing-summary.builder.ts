import type { BillingChargeHistoryItemDto, BillingSummaryReadyResponse } from '@ikaro/types';

/** The backend's full summary answer (an active BR tenant with one open charge) for the BFF specs. */
export class BillingSummaryBuilder {
  private summary: BillingSummaryReadyResponse = {
    provisioning: false,
    status: 'ACTIVE',
    exempt: false,
    suspensionReason: null,
    currency: 'BRL',
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    cycle: 'MONTHLY',
    nextCycle: null,
    nextCycleFrom: null,
    trialEndsAt: null,
    nextDueDate: '2026-11-20',
    pastDueSince: null,
    suspendsAt: null,
    cancelAt: null,
    purgeAt: null,
    planConfirmationRequired: false,
    planConfirmationFallbackAt: null,
    canDiscard: false,
    firstChargePaid: true,
    addressRequired: false,
    items: [{ featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 }],
    totalMinor: 4900,
    openCharge: {
      id: '20000000-0000-4000-8000-000000000001',
      kind: 'PERIOD',
      dueDate: '2026-11-20',
      subtotalMinor: 4900,
      taxMinor: 0,
      amountMinor: 4900,
      status: 'PENDING',
      hasPaymentLink: true,
      paymentLinkExpiresAt: '2026-11-18T12:00:00.000Z',
    },
    autoBilling: { mode: 'NONE', status: 'INACTIVE', label: null },
    paymentConfirmationPending: false,
    upcomingPriceChanges: [],
  };

  withStatus(status: BillingSummaryReadyResponse['status']): this {
    this.summary = { ...this.summary, status };
    return this;
  }

  withExempt(exempt: boolean): this {
    this.summary = { ...this.summary, exempt };
    return this;
  }

  withOpenCharge(openCharge: BillingSummaryReadyResponse['openCharge']): this {
    this.summary = { ...this.summary, openCharge };
    return this;
  }

  withItems(items: BillingSummaryReadyResponse['items'], totalMinor: number | null = null): this {
    this.summary = { ...this.summary, items, totalMinor };
    return this;
  }

  build(): BillingSummaryReadyResponse {
    return structuredClone(this.summary);
  }
}

/** One charge of the backend's history page. */
export class BillingChargeHistoryItemBuilder {
  private item: BillingChargeHistoryItemDto = {
    id: '20000000-0000-4000-8000-000000000002',
    kind: 'PERIOD',
    periodStart: '2026-10-20',
    periodEnd: '2026-11-19',
    dueDate: '2026-10-20',
    subtotalMinor: 4900,
    taxMinor: 0,
    amountMinor: 4900,
    currency: 'BRL',
    status: 'PAID',
    method: 'PIX',
    paidAt: '2026-10-19T12:00:00.000Z',
    receiptUrl: 'https://receipts.example/r/1',
    lines: [{ featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 }],
    taxLines: [],
  };

  withReceiptUrl(receiptUrl: string | null): this {
    this.item = { ...this.item, receiptUrl };
    return this;
  }

  build(): BillingChargeHistoryItemDto {
    return structuredClone(this.item);
  }
}
