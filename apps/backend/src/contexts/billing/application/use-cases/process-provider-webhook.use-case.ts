import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import type { BillingAccount, BillingProvider } from '../../domain/billing-account.aggregate';
import type { Charge } from '../../domain/charge.aggregate';
import { InvalidProviderWebhookError } from '../../domain/errors/billing-provider.errors';
import { resolveMerchantProfileKey } from '../../domain/merchant-profile-key';
import type { NormalizedChargeStatus, NormalizedProviderEvent } from '../../domain/provider-events';
import type { ProviderEvent } from '../../domain/provider-event';
import type { Subscription } from '../../domain/subscription.aggregate';
import { ApplyChargeFactService } from '../services/apply-charge-fact.service';
import { type ChargeEvent, toChargeFact, verifyChargeEvent } from '../helpers/provider-event-fact';
import { ProviderChargeCreationService } from '../services/provider-charge-creation.service';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderRegistryPort,
  type WebhookHeaders,
} from '../ports/billing-provider.port';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from '../ports/billing-provisioning-config.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  IProviderEventRepository,
  PROVIDER_EVENT_REPOSITORY,
} from '../ports/provider-event-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface ProcessProviderWebhookUseCaseInput {
  provider: BillingProvider;
  /** The provider's body as the BFF forwarded it (already authenticated there). */
  rawBody: string;
  headers: WebhookHeaders;
  correlationId: string;
}

/**
 * Every outcome is a `200` to the provider; only a thrown error (the provider re-read failed, the
 * database is down) answers non-2xx so the provider retries.
 */
export type ProcessProviderWebhookUseCaseResult =
  | 'APPLIED'
  | 'NO_CHANGE'
  | 'DUPLICATE'
  | 'RECORDED'
  | 'IGNORED'
  | 'MALFORMED'
  | 'UNKNOWN_TARGET'
  | 'NOT_CONFIRMED'
  | 'ILLEGAL';

interface Target {
  charge: Charge;
  subscription: Subscription;
  account: BillingAccount | null;
}

// The events whose paid / refunded / charged-back claim is verified by a provider re-read before
// it is applied (a leaked webhook token must not be able to forge a payment).
const REREAD_TYPES: ReadonlySet<ChargeEvent['type']> = new Set([
  'PaymentConfirmed',
  'PaymentRefunded',
  'PaymentChargeback',
  'PaymentOverdue',
]);

/**
 * UC-114: the provider's webhook, made the source of truth safely. Parses (local), de-duplicates
 * (a read-only inbox check, so a replay costs no provider call), resolves the tenant from the
 * provider customer, or from the charge's `externalReference` when that customer is not stored yet,
 * re-reads the provider **before** any transaction opens, and hands the verified fact to
 * `ApplyChargeFactService`, which writes it with the inbox row in one transaction. Provider events
 * that need no state change (`PaymentOverdue`, an opened dispute, a cancel, a partial refund) only
 * leave their inbox row.
 */
@Injectable()
export class ProcessProviderWebhookUseCase {
  private readonly logger = new AppLogger(ProcessProviderWebhookUseCase.name);

  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(BILLING_PROVISIONING_CONFIG) private readonly config: BillingProvisioningConfig,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly providerEvents: IProviderEventRepository,
    private readonly applyFact: ApplyChargeFactService,
    @Inject(ProviderChargeCreationService)
    private readonly creation: Pick<ProviderChargeCreationService, 'execute'>,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: ProcessProviderWebhookUseCaseInput,
  ): Promise<ProcessProviderWebhookUseCaseResult> {
    const event = this.parse(input);
    if (event === null) return 'MALFORMED';
    if (event.type === 'Ignored' || event.type.startsWith('AutoBilling')) {
      this.logger.log('billing_webhook_ignored', { eventType: event.type });
      return 'IGNORED';
    }
    const chargeEvent = event as ChargeEvent;
    if (await this.providerEvents.exists(input.provider, chargeEvent.providerEventId)) {
      return 'DUPLICATE';
    }
    const target = await this.resolveTarget(input.provider, chargeEvent);
    if (target === null) return 'UNKNOWN_TARGET';
    return this.process(input, chargeEvent, target);
  }

  // `parseWebhook` is local: the registry entry of the deployment's own BRL profile can parse it.
  private parse(input: ProcessProviderWebhookUseCaseInput): NormalizedProviderEvent | null {
    const adapter = this.registry.resolve(resolveMerchantProfileKey(this.config.appEnv, 'BR'));
    try {
      return adapter.parseWebhook(input.rawBody, input.headers);
    } catch (err) {
      if (!(err instanceof InvalidProviderWebhookError)) throw err;
      // The token already passed, so a retry of the same body can never succeed: answer `200`
      // (a non-2xx counts toward the provider's failure pause) and leave the reconcile to recover.
      this.logger.error('billing_webhook_malformed', undefined, { reason: err.message });
      return null;
    }
  }

  private async resolveTarget(
    provider: BillingProvider,
    event: ChargeEvent,
  ): Promise<Target | null> {
    const account = event.providerCustomerId
      ? await this.accounts.findByProviderCustomerIdForJob(provider, event.providerCustomerId)
      : null;
    const charge = await this.findCharge(provider, event, account?.tenantId ?? null);
    if (charge === null) {
      this.logger.log('billing_webhook_unknown_target', { eventType: event.type });
      return null;
    }
    const subscription = await this.subscriptions.findByTenantId(charge.tenantId);
    if (subscription === null) return null;
    return {
      charge,
      subscription,
      account: account ?? (await this.accounts.findByTenantId(charge.tenantId)),
    };
  }

  // By the provider's charge id once the tenant is known; otherwise (or when that charge is not
  // stored yet) by our own charge id, which the provider echoes as `externalReference`. A charge of
  // another tenant than the customer's, or one the provider knows under another id, is never used.
  private async findCharge(
    provider: BillingProvider,
    event: ChargeEvent,
    tenantId: string | null,
  ): Promise<Charge | null> {
    let charge =
      tenantId === null
        ? null
        : await this.charges.findByProviderChargeId(tenantId, provider, event.providerChargeId);
    if (charge === null && event.chargeReference !== null) {
      charge = await this.charges.findByIdForJob(event.chargeReference);
    }
    if (charge === null) return null;
    const sameTenant = tenantId === null || charge.tenantId === tenantId;
    const sameCharge =
      (charge.providerChargeId === null || charge.providerChargeId === event.providerChargeId) &&
      (charge.provider === null || charge.provider === provider);
    if (sameTenant && sameCharge) return charge;
    this.logger.warn('billing_webhook_charge_mismatch', { eventType: event.type });
    return null;
  }

  private async process(
    input: ProcessProviderWebhookUseCaseInput,
    event: ChargeEvent,
    target: Target,
  ): Promise<ProcessProviderWebhookUseCaseResult> {
    let status: NormalizedChargeStatus | null = null;
    if (REREAD_TYPES.has(event.type)) {
      // Provider I/O: before any transaction opens (the `transactional-io` rule).
      const adapter = this.registry.resolve(target.subscription.merchantProfileKey);
      status = await adapter.fetchChargeStatus(event.providerChargeId);
      const refusal = verifyChargeEvent(event, status, target.charge);
      if (refusal !== null) {
        this.logger.warn('billing_webhook_not_confirmed', { eventType: event.type, refusal });
        return 'NOT_CONFIRMED';
      }
    }
    const fact = toChargeFact(event, status);
    const inbox = this.inboxRow(input.provider, event, target.charge.tenantId);
    if (fact === null) return this.record(event, inbox);
    const report = await this.applyFact.executeWithReport({
      tenantId: target.charge.tenantId,
      chargeId: target.charge.id,
      fact,
      recipientEmail: resolveBillingRecipientEmail(target.subscription.exempt, target.account),
      correlationId: input.correlationId,
      inbox,
    });
    if (report.recoveryChargeId !== null) {
      await this.createRecoveryAtProvider(
        target.charge.tenantId,
        report.recoveryChargeId,
        input.correlationId,
      );
    }
    return report.result === 'CHARGE_NOT_FOUND' ? 'UNKNOWN_TARGET' : report.result;
  }

  // After commit, outside any transaction: a reversal suspended the tenant and inserted its recovery
  // charge `PENDING`; this makes it payable now, so the manager lands on a payment link. It never
  // fails the webhook (the fact is already applied and acknowledged): a charge left `PENDING` is
  // picked up by S05's creation retry.
  private async createRecoveryAtProvider(
    tenantId: string,
    chargeId: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.creation.execute({ tenantId, chargeId, correlationId });
    } catch (err) {
      this.logger.error(
        'billing_recovery_creation_failed: left for the retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId, chargeId },
      );
    }
  }

  // An event that changes no state still leaves its inbox row (the dedupe), and an opened dispute
  // is only logged: S36 turns the field into a metric and an alert.
  private async record(
    event: ChargeEvent,
    inbox: ProviderEvent,
  ): Promise<ProcessProviderWebhookUseCaseResult> {
    if (!(await this.providerEvents.insertIfAbsent(inbox))) return 'DUPLICATE';
    if (event.type === 'PaymentDisputeOpened') {
      this.logger.warn('billing_dispute_opened', {
        billing_dispute_opened: true,
        tenantId: inbox.tenantId,
        providerChargeId: event.providerChargeId,
      });
    }
    return 'RECORDED';
  }

  private inboxRow(provider: BillingProvider, event: ChargeEvent, tenantId: string): ProviderEvent {
    const now = this.clock.now();
    return {
      provider,
      eventId: event.providerEventId,
      tenantId,
      eventType: event.type,
      receivedAt: now,
      processedAt: now,
    };
  }
}
