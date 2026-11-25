import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  APPLICATION_CONFIG,
  type IApplicationConfig,
} from '../../../../shared/ports/application-config.port';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BillingAccount, BillingProvider } from '../../domain/billing-account.aggregate';
import type { Charge } from '../../domain/charge.aggregate';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { ProviderRequestError } from '../../domain/errors/billing-provider.errors';
import type { Subscription } from '../../domain/subscription.aggregate';
import { providerOfMerchantProfileKey } from '../../domain/merchant-profile-key';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import { BILLING_PLATFORM_PORT, type IBillingPlatformPort } from '../ports/billing-platform.port';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderPort,
  type BillingProviderRegistryPort,
  type CreateProviderChargeInput,
  type CreatedProviderCharge,
} from '../ports/billing-provider.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface CreateProviderChargeCommand {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

/**
 * What became of one creation attempt. `READY` is the only outcome that leaves a payable charge.
 * `CANCELED` created it at the provider and then cancelled it there, because the charge was
 * cancelled (or its tenant exempted) while the call was in flight. `PROVIDER_FAILED` leaves it
 * `PENDING` for the retry query. `NOT_FOUND`, `NOT_PENDING`, `EXEMPT`, `TENANT_INACTIVE`, `HELD`,
 * `PROVIDER_UNSUPPORTED` and `NOT_CLAIMED` make no provider call at all. None of them throws: a
 * provider failure is part of the design, not an error of the run.
 */
export type ProviderChargeCreationResult =
  | 'READY'
  | 'CANCELED'
  | 'NOT_FOUND'
  | 'NOT_PENDING'
  | 'EXEMPT'
  | 'TENANT_INACTIVE'
  | 'HELD'
  | 'PROVIDER_UNSUPPORTED'
  | 'NOT_CLAIMED'
  | 'PROVIDER_FAILED';

/**
 * M26-D3: the one place a `PENDING` charge becomes a payable one at the provider, shared by the
 * issue job (right after its insert transaction), the creation retry and the later stories that
 * insert a charge (the recovery charge, a re-issue). It runs entirely **outside** a transaction
 * except the last short one: claim the creation lease, `ensureCustomer`, save the provider customer
 * in its own statement, `createCharge` with our charge id as the idempotency key, then store
 * `READY` under the charge row lock (B-C1) on a fresh read, because a webhook may have settled the
 * charge in between. `ChargeIssued` is raised by that same save, so it exists only after `READY`.
 */
@Injectable()
export class ProviderChargeCreationService {
  private readonly logger = new AppLogger(ProviderChargeCreationService.name);

  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(BILLING_PLATFORM_PORT) private readonly platform: IBillingPlatformPort,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(command: CreateProviderChargeCommand): Promise<ProviderChargeCreationResult> {
    const { tenantId, chargeId } = command;
    const charge = await this.charges.findById(tenantId, chargeId);
    if (charge === null) return 'NOT_FOUND';
    if (!charge.open || charge.providerCreationStatus === 'READY') return 'NOT_PENDING';
    const subscription = await this.subscriptions.findByTenantId(tenantId);
    if (subscription === null) return 'NOT_FOUND';
    // Free access and a deactivated tenant are never invoiced, whichever path inserted the charge.
    if (subscription.exempt) return 'EXEMPT';
    if (!(await this.tenantIsActive(tenantId))) return 'TENANT_INACTIVE';

    const adapter = this.resolveAdapter(subscription.merchantProfileKey, tenantId);
    if (adapter === null) return 'PROVIDER_UNSUPPORTED';

    const account = await this.accounts.findByTenantId(tenantId);
    if (!account?.hasBillableIdentity()) {
      // A hold, not a failure: no claim, no attempt counted, so it never trips the stuck alert.
      this.logger.log('billing_charge_creation_held', { tenantId, chargeId });
      return 'HELD';
    }

    if (!(await this.charges.claimForProviderCreation(tenantId, chargeId, this.clock.now()))) {
      return 'NOT_CLAIMED';
    }
    return this.createClaimed(command, adapter, charge, account, subscription);
  }

  // The lease is ours: the provider calls, then the READY write. A provider failure leaves the charge
  // PENDING (the claim already counted the attempt) for the retry once the lease is free.
  private async createClaimed(
    command: CreateProviderChargeCommand,
    adapter: BillingProviderPort,
    charge: Charge,
    account: BillingAccount,
    subscription: Subscription,
  ): Promise<ProviderChargeCreationResult> {
    let toCancel: string | null;
    try {
      const provider = providerOfMerchantProfileKey(subscription.merchantProfileKey);
      const created = await this.createAtProvider(adapter, charge, account, subscription);
      toCancel = await this.storeReady(command, account, subscription.exempt, provider, created);
    } catch (err) {
      // A provider that is down is expected (warn); anything else (a provider charge id that
      // differs for one reference, a broken invariant, a bound customer mismatch) is a bug to read.
      const message = 'billing_charge_creation_failed: left for the retry';
      const context = {
        tenantId: command.tenantId,
        chargeId: command.chargeId,
        error: err instanceof Error ? err.message : String(err),
      };
      if (err instanceof ProviderRequestError) this.logger.warn(message, context);
      else this.logger.error(message, err instanceof Error ? err.stack : undefined, context);
      return 'PROVIDER_FAILED';
    }
    if (toCancel === null) return 'READY';
    await this.cancelAtProvider(adapter, command, toCancel);
    return 'CANCELED';
  }

  // The charge was cancelled while the provider call was in flight (a tenant exempted, a plan
  // change): the provider holds a payable charge nobody wants, so it is cancelled there now. The
  // `providerCancelPending` flag stays set when this fails, for the reconcile job to retry; a charge
  // the provider reports as already paid is the payment itself, and the webhook settles it.
  private async cancelAtProvider(
    adapter: BillingProviderPort,
    command: CreateProviderChargeCommand,
    providerChargeId: string,
  ): Promise<void> {
    try {
      await adapter.cancelCharge(providerChargeId);
    } catch (err) {
      this.logger.warn('billing_provider_cancel_failed: left flagged for the retry', {
        tenantId: command.tenantId,
        chargeId: command.chargeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await this.txManager.run(async () => {
      const locked = await this.charges.findByIdForUpdate(command.tenantId, command.chargeId);
      if (locked === null) return;
      locked.clearProviderCancelPending();
      await this.charges.save(locked);
    });
  }

  // The customer first (saved before the charge, so a fast webhook can resolve the tenant), then the
  // charge, whose id is the provider's idempotency key.
  private async createAtProvider(
    adapter: BillingProviderPort,
    charge: Charge,
    account: BillingAccount,
    subscription: Subscription,
  ): Promise<CreatedProviderCharge> {
    const provider = providerOfMerchantProfileKey(subscription.merchantProfileKey);
    const providerCustomerId = await this.ensureCustomer(
      adapter,
      account,
      provider,
      subscription.exempt,
    );
    return adapter.createCharge(this.providerInput(charge, account, providerCustomerId));
  }

  /** A deactivated tenant is never invoiced (UC-113 A11); one Platform no longer knows is treated the same. */
  async tenantIsActive(tenantId: string): Promise<boolean> {
    try {
      return (await this.platform.getTenantInfo(tenantId)).isActive;
    } catch (err) {
      if (err instanceof BillingTenantNotFoundError) return false;
      throw err;
    }
  }

  /** Whether the subscription's merchant profile has an adapter yet; the issue job asks before it inserts anything. */
  supportsProfile(merchantProfileKey: string, tenantId: string): boolean {
    return this.resolveAdapter(merchantProfileKey, tenantId) !== null;
  }

  // A key with no adapter yet (a US subscription before M28, a sandbox key before M26-S37) is a
  // skip, never a crash: the charge stays as it is and the job moves on.
  private resolveAdapter(merchantProfileKey: string, tenantId: string): BillingProviderPort | null {
    const adapter = this.registry.tryResolve(merchantProfileKey);
    if (adapter === null) {
      this.logger.warn('billing_provider_not_supported: skipped', { tenantId, merchantProfileKey });
    }
    return adapter;
  }

  private async ensureCustomer(
    adapter: BillingProviderPort,
    account: BillingAccount,
    provider: BillingProvider,
    exempt: boolean,
  ): Promise<string> {
    const name = account.legalName ?? (await this.platform.getTenantInfo(account.tenantId)).slug;
    const { providerCustomerId } = await adapter.ensureCustomer(account.tenantId, {
      name,
      email: resolveBillingRecipientEmail(exempt, account),
      taxId: account.taxId?.value ?? null,
      countryCode: account.countryCode.value,
    });
    // Committed before `createCharge`, so a fast webhook can resolve the tenant from the customer.
    // Its own statement: it must not overwrite an identity the manager saves meanwhile (S16).
    const stored = await this.accounts.assignProviderCustomer(
      account.tenantId,
      provider,
      providerCustomerId,
    );
    // The account already holds another customer (a provider switch, a non-idempotent adapter): a
    // charge created against this one could not be traced back to the tenant by its webhooks.
    if (!stored) throw new Error('The billing account is bound to another provider customer');
    return providerCustomerId;
  }

  private providerInput(
    charge: Charge,
    account: BillingAccount,
    providerCustomerId: string,
  ): CreateProviderChargeInput {
    return {
      merchantProfileKey: charge.merchantProfileKey,
      providerCustomerId,
      dueDate: charge.dueDate.value,
      lines: charge.lines.map((line) => ({
        description: `${line.featureKey} ${line.tier}`,
        amountMinor: line.unitPriceMinor,
      })),
      currency: charge.amount.currency,
      // The country's rule, the same fact the public price list reports (UC-117, UC-128).
      taxBehavior: account.countryCode.spec.taxBehavior,
      customerLocation: {
        countryCode: account.countryCode.value,
        postalCode: account.address?.zipCode,
        state: account.address?.state,
      },
      description: `Ikaro ${charge.periodStart?.value ?? charge.dueDate.value}`,
      externalReference: charge.id,
      // S28 reads the charge id from the marker and asks for exactly that charge's payment return.
      returnUrl: `${this.config.getOrThrow('FRONTEND_URL')}/dashboard/billing?payment=return&charge=${charge.id}`,
    };
  }

  // The post-provider-call write: its own short transaction, on a fresh read under B-C1. Answers the
  // provider charge to cancel when the charge ended up cancelled, `null` otherwise.
  private async storeReady(
    command: CreateProviderChargeCommand,
    account: BillingAccount,
    exempt: boolean,
    provider: BillingProvider,
    created: { providerChargeId: string; paymentUrl: string; expiresAt: Date },
  ): Promise<string | null> {
    const recipientEmail = resolveBillingRecipientEmail(exempt, account);
    return this.txManager.run(async () => {
      // B-R1 then B-C1 (docs/LOCK_CATALOG.md): exemption is decided under the subscription lock, not
      // from the snapshot read before the provider call.
      const current = await this.subscriptions.findByTenantIdForUpdate(command.tenantId);
      const locked = await this.charges.findByIdForUpdate(command.tenantId, command.chargeId);
      if (locked === null) return null;
      // Exempted while the provider call was in flight (UC-113 A1): cancelled here, so it
      // announces nothing.
      if (current?.exempt && locked.open) locked.cancel();
      locked.markCreationReady(
        provider,
        created.providerChargeId,
        created.paymentUrl,
        created.expiresAt,
        { correlationId: command.correlationId, recipientEmail },
      );
      if (locked.status !== 'CANCELED') {
        await this.charges.save(locked);
        return null;
      }
      locked.markProviderCancelPending();
      await this.charges.save(locked);
      return created.providerChargeId;
    });
  }
}
