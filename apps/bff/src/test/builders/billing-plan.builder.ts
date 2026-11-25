import type { BillingPlanPreviewResponse, BillingPlanReadyResponse } from '@ikaro/types';

/** The backend's full plan answer (an active BR tenant on HOTSITE and BOOKING) for the BFF specs. */
export class BillingPlanBuilder {
  private plan: BillingPlanReadyResponse = {
    provisioning: false,
    countryCode: 'BR',
    currency: 'BRL',
    readOnly: null,
    trial: { active: false, planConfirmed: false },
    features: [
      {
        featureKey: 'HOTSITE',
        requires: [],
        tiers: [{ tier: 'STANDARD', unitPriceMinor: 4900, available: true }],
      },
      {
        featureKey: 'BOOKING',
        requires: ['HOTSITE'],
        tiers: [
          {
            tier: 'STANDARD',
            unitPriceMinor: 3900,
            available: true,
            upcoming: { amountMinor: 4900, effectiveFrom: '2026-12-01' },
          },
        ],
      },
      {
        featureKey: 'CHATBOT',
        requires: ['HOTSITE'],
        tiers: [
          { tier: 'BASIC', unitPriceMinor: 1900, available: true },
          { tier: 'PLUS', unitPriceMinor: null, available: false },
        ],
      },
    ],
    current: [
      { featureKey: 'HOTSITE', tier: 'STANDARD', endsAt: null },
      { featureKey: 'BOOKING', tier: 'STANDARD', endsAt: '2026-11-20' },
    ],
    scheduled: [{ featureKey: 'BOOKING', tier: null, startsAt: '2026-11-20' }],
    totalMinor: 4900,
  };

  withReadOnly(reason: NonNullable<BillingPlanReadyResponse['readOnly']>['reason'] | null): this {
    this.plan = { ...this.plan, readOnly: reason === null ? null : { reason } };
    return this;
  }

  withScheduled(scheduled: BillingPlanReadyResponse['scheduled']): this {
    this.plan = { ...this.plan, scheduled };
    return this;
  }

  withTotalMinor(totalMinor: number | null): this {
    this.plan = { ...this.plan, totalMinor };
    return this;
  }

  build(): BillingPlanReadyResponse {
    return this.plan;
  }
}

/** The backend's preview answer: BOOKING removed from the next period, total 4900. */
export class BillingPlanPreviewBuilder {
  private preview: BillingPlanPreviewResponse = {
    changes: [
      {
        featureKey: 'BOOKING',
        kind: 'REMOVE',
        fromTier: 'STANDARD',
        toTier: null,
        effectiveFrom: '2026-11-20',
      },
    ],
    newTotalMinor: 4900,
    effectiveFrom: '2026-11-20',
    deferredBecauseNextInvoicePaid: false,
  };

  withDeferred(deferred: boolean): this {
    this.preview = { ...this.preview, deferredBecauseNextInvoicePaid: deferred };
    return this;
  }

  withNoDate(): this {
    this.preview = {
      ...this.preview,
      effectiveFrom: null,
      changes: this.preview.changes.map((change) => ({ ...change, effectiveFrom: null })),
    };
    return this;
  }

  build(): BillingPlanPreviewResponse {
    return this.preview;
  }
}
