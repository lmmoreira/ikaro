import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { Charge } from '../../domain/charge.aggregate';
import {
  FakeScenarioNotApplicableError,
  ProviderRequestError,
  type ProviderRequestFailure,
} from '../../domain/errors/billing-provider.errors';
import {
  SimulationNotApplicableError,
  type SimulationRefusal,
} from '../../domain/errors/billing-domain.error';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { providerOfMerchantProfileKey } from '../../domain/merchant-profile-key';
import type {
  SimulateDelivery,
  SimulateEvent,
  SimulateFailure,
} from '../dtos/simulate-provider-event.dto';
import {
  BILLING_FAKE_PROVIDER_CONTROL,
  type IBillingFakeProviderControl,
  type SimulatedDeliveryOptions,
} from '../ports/billing-fake-provider-control.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ProviderWebhookProcessor,
  type ProviderWebhookResult,
} from '../services/provider-webhook-processor.service';

/** How long a `DELAYED` delivery waits inside the request: a sequence, never a background timer. */
export const DELAYED_DELIVERY_MS = 250;

/** One page of the tenant's history, newest due date first, while looking for its latest paid charge. */
const PAID_LOOKUP_PAGE_SIZE = 50;

const DELIVERY_OPTIONS: Readonly<Record<SimulateDelivery, SimulatedDeliveryOptions>> = {
  NORMAL: {},
  DUPLICATE: { duplicate: true },
  DELAYED: { delayMs: DELAYED_DELIVERY_MS },
  OUT_OF_ORDER: { reverse: true },
};

const FAILURE_REASON: Readonly<Record<SimulateFailure, ProviderRequestFailure>> = {
  PROVIDER_5XX: 'UNAVAILABLE',
  LINK_EXPIRED: 'LINK_EXPIRED',
  INVALID_LOCATION: 'INVALID_LOCATION',
};

/** What an event needs of the charge it is played against (the DB charge and the fake agree). */
type ChargeNeed = 'OPEN' | 'PENDING' | 'PAID';

const NEED_BY_EVENT: Readonly<Record<SimulateEvent, ChargeNeed>> = {
  PAID_PIX: 'OPEN',
  PAID_BOLETO: 'OPEN',
  PAID_CARD: 'OPEN',
  OVERDUE: 'PENDING',
  REFUND_FULL: 'PAID',
  REFUND_PARTIAL: 'PAID',
  CHARGEBACK_OPENED: 'PAID',
  CHARGEBACK_LOST: 'PAID',
};

export interface SimulateProviderEventUseCaseInput {
  /** Exactly one of `tenantId` / `chargeId` (the request schema holds it). */
  tenantId?: string;
  chargeId?: string;
  event: SimulateEvent;
  delivery: SimulateDelivery;
  failure?: SimulateFailure;
  correlationId: string;
}

/** What the webhook use case answered for one delivery, or that its provider re-read failed. */
export type SimulatedDeliveryOutcome = ProviderWebhookResult | 'PROVIDER_ERROR';

export interface SimulateProviderEventUseCaseResult {
  tenantId: string;
  chargeId: string;
  providerChargeId: string;
  event: SimulateEvent;
  delivery: SimulateDelivery;
  outcomes: SimulatedDeliveryOutcome[];
}

/**
 * UC-138 (dev only, `DevBillingModule`): fires one provider event at the fake and hands every
 * payload to the real `ProviderWebhookProcessor` (the webhook route's own service) in-process. Nothing here is a test-only path
 * inside a use case: the event is normalised, de-duplicated, re-read and applied exactly as a
 * provider's webhook would be. The BFF token check and the exact-`200` contract belong to the
 * webhook route and are covered by its own tests.
 *
 * It never writes: the only state it changes is the fake's in-memory charge, and the webhook use
 * case writes everything else. A request that does not apply answers `409` before anything is queued.
 */
@Injectable()
export class SimulateProviderEventUseCase {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(BILLING_FAKE_PROVIDER_CONTROL) private readonly fake: IBillingFakeProviderControl,
    private readonly processWebhook: ProviderWebhookProcessor,
  ) {}

  /**
   * @throws SimulationNotApplicableError when nothing matches or the event does not apply (nothing is
   * delivered). A provider failure during a delivery is reported in `outcomes`, not thrown.
   */
  async execute(
    input: SimulateProviderEventUseCaseInput,
  ): Promise<SimulateProviderEventUseCaseResult> {
    const charge = await this.resolveCharge(input);
    const providerChargeId = this.assertApplicable(charge, input.event);
    // Webhooks already queued (a `PAYMENT_CREATED` from an earlier charge creation) go out first and
    // unmodified, as a real provider would have delivered them: the delivery options apply from the
    // event this request queues. The queueing comes before anything is handed out, so a request the
    // fake refuses delivers nothing at all.
    const staleCount = this.fake.pendingCount();
    this.queue(providerChargeId, input.event);
    // Armed after the queueing: a charge the fake refuses leaves no failure armed behind it.
    if (input.failure) this.fake.failNextCall(FAILURE_REASON[input.failure]);
    const deliveries = this.fake.drainDeliveries(DELIVERY_OPTIONS[input.delivery], staleCount);
    const outcomes = await this.deliver(charge, deliveries, input.correlationId);
    return {
      tenantId: charge.tenantId,
      chargeId: charge.id,
      providerChargeId,
      event: input.event,
      delivery: input.delivery,
      outcomes,
    };
  }

  private async resolveCharge(input: SimulateProviderEventUseCaseInput): Promise<Charge> {
    if (input.chargeId !== undefined) {
      const charge = await this.charges.findByIdForJob(input.chargeId);
      if (charge === null) throw refusal('CHARGE_NOT_FOUND', 'No charge has that id');
      return charge;
    }
    return this.chargeOfTenant(input.tenantId as string, NEED_BY_EVENT[input.event]);
  }

  // The tenant form: the tenant's single open charge for a payment or an overdue, its most recent
  // paid charge for a refund or a chargeback. Always scoped to the given tenant.
  private async chargeOfTenant(tenantId: string, need: ChargeNeed): Promise<Charge> {
    if (need === 'PAID') {
      const paid = await this.latestPaidCharge(tenantId, 0);
      if (!paid) throw refusal('NO_MATCHING_CHARGE', 'The tenant has no paid charge');
      return paid;
    }
    const open = await this.charges.findOpenByTenant(tenantId);
    if (open.length === 0) throw refusal('NO_MATCHING_CHARGE', 'The tenant has no open charge');
    if (open.length > 1) {
      throw refusal('AMBIGUOUS_CHARGE', 'The tenant has several open charges: pass chargeId');
    }
    return open[0];
  }

  // The history is newest first, so the first paid charge found is the latest one; it pages on until
  // one is found or the history ends, never giving up at the first page.
  private async latestPaidCharge(tenantId: string, offset: number): Promise<Charge | null> {
    const { items, total } = await this.charges.listByTenantPage(tenantId, {
      limit: PAID_LOOKUP_PAGE_SIZE,
      offset,
    });
    const paid = items.find((charge) => charge.status === 'PAID');
    if (paid) return paid;
    const next = offset + PAID_LOOKUP_PAGE_SIZE;
    return next >= total ? null : this.latestPaidCharge(tenantId, next);
  }

  /** Returns the provider charge id once every precondition holds. */
  private assertApplicable(charge: Charge, event: SimulateEvent): string {
    if (!charge.merchantProfileKey.endsWith('_FAKE')) {
      throw refusal('NOT_FAKE_PROFILE', 'simulate works only for a *_FAKE merchant profile');
    }
    if (!statusFits(charge, NEED_BY_EVENT[event])) {
      throw refusal('CHARGE_STATE', `${event} does not apply to a charge that is ${charge.status}`);
    }
    const providerChargeId = charge.providerChargeId;
    if (providerChargeId === null) {
      throw refusal('NO_PROVIDER_CHARGE', 'The charge has not been created at the provider yet');
    }
    if (!this.fake.hasCharge(providerChargeId)) {
      throw refusal(
        'UNKNOWN_TO_FAKE',
        'The fake does not know this charge: it keeps charges in memory, so a restarted or second instance cannot simulate it (single-instance rule)',
      );
    }
    return providerChargeId;
  }

  private queue(providerChargeId: string, event: SimulateEvent): void {
    try {
      switch (event) {
        case 'PAID_PIX':
          return this.fake.simulatePayment(providerChargeId, 'PIX');
        case 'PAID_BOLETO':
          return this.fake.simulatePayment(providerChargeId, 'BOLETO');
        case 'PAID_CARD':
          return this.fake.simulatePayment(providerChargeId, 'CARD');
        case 'OVERDUE':
          return this.fake.simulateOverdue(providerChargeId);
        case 'REFUND_FULL':
          return this.fake.simulateRefund(providerChargeId, 'FULL');
        case 'REFUND_PARTIAL':
          return this.fake.simulateRefund(providerChargeId, 'PARTIAL');
        case 'CHARGEBACK_OPENED':
          return this.fake.simulateDisputeOpened(providerChargeId);
        case 'CHARGEBACK_LOST':
          return this.fake.simulateChargeback(providerChargeId);
      }
    } catch (err) {
      // The database and the fake can disagree (the fake paid it, the webhook was never applied):
      // the fake's own refusal is the same "does not apply", with nothing queued.
      if (err instanceof FakeScenarioNotApplicableError) {
        throw refusal('CHARGE_STATE', err.message);
      }
      throw err;
    }
  }

  private deliver(
    charge: Charge,
    deliveries: ReturnType<IBillingFakeProviderControl['drainDeliveries']>,
    correlationId: string,
  ): Promise<SimulatedDeliveryOutcome[]> {
    const provider = providerOfMerchantProfileKey(charge.merchantProfileKey);
    return mapSequentially(deliveries, async (delivery) => {
      if (delivery.delayMs > 0) await sleep(delivery.delayMs);
      try {
        return await this.processWebhook.execute({
          provider,
          rawBody: delivery.body,
          headers: delivery.headers,
          correlationId,
        });
      } catch (err) {
        // The provider re-read failed (`failure`): the real webhook would answer non-2xx and the
        // provider would retry. Here the event stays unapplied for the reconcile job to recover.
        if (!(err instanceof ProviderRequestError)) throw err;
        return 'PROVIDER_ERROR';
      }
    });
  }
}

function statusFits(charge: Charge, need: ChargeNeed): boolean {
  if (need === 'OPEN') return charge.open;
  if (need === 'PENDING') return charge.status === 'PENDING';
  return charge.status === 'PAID';
}

function refusal(reason: SimulationRefusal, message: string): SimulationNotApplicableError {
  return new SimulationNotApplicableError(reason, message);
}
