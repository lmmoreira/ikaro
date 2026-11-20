import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BillingAccount, BillingProvider } from '../../domain/billing-account.aggregate';
import type { Charge } from '../../domain/charge.aggregate';
import { ProviderNotSupportedError } from '../../domain/errors/billing-provider.errors';
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
} from '../ports/billing-provider.port';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from '../ports/billing-provisioning-config.port';
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
 * What became of one creation attempt. Only `READY` and `ALREADY_READY` leave a payable charge;
 * every other outcome leaves the charge `PENDING` for the retry query (or, for `NOT_PENDING` and
 * `NOT_CLAIMED`, belongs to someone else), and none of them throws: a provider failure is part of
 * the design, not an error of the run.
 */
export type ProviderChargeCreationResult =
  | 'READY'
  | 'ALREADY_READY'
  | 'NOT_FOUND'
  | 'NOT_PENDING'
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
    @Inject(BILLING_PROVISIONING_CONFIG) private readonly config: BillingProvisioningConfig,
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

    const adapter = this.resolveAdapter(subscription.merchantProfileKey, tenantId);
    if (adapter === null) return 'PROVIDER_UNSUPPORTED';

    const account = await this.accounts.findByTenantId(tenantId);
    if (account === null || !account.hasBillableIdentity()) {
      // A hold, not a failure: no claim, no attempt counted, so it never trips the stuck alert.
      this.logger.log('billing_charge_creation_held', { tenantId, chargeId });
      return 'HELD';
    }

    if (!(await this.charges.claimForProviderCreation(tenantId, chargeId, this.clock.now()))) {
      return 'NOT_CLAIMED';
    }
    try {
      const provider = providerOfMerchantProfileKey(subscription.merchantProfileKey);
      const providerCustomerId = await this.ensureCustomer(
        adapter,
        account,
        provider,
        subscription.exempt,
      );
      const created = await adapter.createCharge(
        this.providerInput(charge, account, providerCustomerId),
      );
      await this.storeReady(command, account, subscription.exempt, provider, created);
      return 'READY';
    } catch (err) {
      // The charge stays PENDING and the claim already counted the attempt: the retry query
      // tries again once the lease is free.
      this.logger.warn('billing_charge_creation_failed: left for the retry', {
        tenantId,
        chargeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'PROVIDER_FAILED';
    }
  }

  /** Whether the subscription's merchant profile has an adapter yet; the issue job asks before it inserts anything. */
  supportsProfile(merchantProfileKey: string, tenantId: string): boolean {
    return this.resolveAdapter(merchantProfileKey, tenantId) !== null;
  }

  // A key with no adapter yet (a US subscription before M28, a sandbox key before M26-S37) is a
  // skip, never a crash: the charge stays as it is and the job moves on.
  private resolveAdapter(merchantProfileKey: string, tenantId: string): BillingProviderPort | null {
    try {
      return this.registry.resolve(merchantProfileKey);
    } catch (err) {
      if (!(err instanceof ProviderNotSupportedError)) throw err;
      this.logger.log('billing_provider_not_supported: skipped', { tenantId, merchantProfileKey });
      return null;
    }
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
    await this.accounts.assignProviderCustomer(account.tenantId, provider, providerCustomerId);
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
      taxBehavior: 'INCLUSIVE',
      customerLocation: {
        countryCode: account.countryCode.value,
        postalCode: account.address?.zipCode,
        state: account.address?.state,
      },
      description: `Ikaro ${charge.periodStart?.value ?? charge.dueDate.value}`,
      externalReference: charge.id,
      // S28 reads the charge id from the marker and asks for exactly that charge's payment return.
      returnUrl: `${this.config.frontendUrl}/dashboard/billing?payment=return&charge=${charge.id}`,
    };
  }

  // The post-provider-call write: its own short transaction, on a fresh read under B-C1.
  private async storeReady(
    command: CreateProviderChargeCommand,
    account: BillingAccount,
    exempt: boolean,
    provider: BillingProvider,
    created: { providerChargeId: string; paymentUrl: string; expiresAt: Date },
  ): Promise<void> {
    const recipientEmail = resolveBillingRecipientEmail(exempt, account);
    await this.txManager.run(async () => {
      const locked = await this.charges.findByIdForUpdate(command.tenantId, command.chargeId);
      if (locked === null) return;
      locked.markCreationReady(
        provider,
        created.providerChargeId,
        created.paymentUrl,
        created.expiresAt,
        { correlationId: command.correlationId, recipientEmail },
      );
      await this.charges.save(locked);
    });
  }
}
