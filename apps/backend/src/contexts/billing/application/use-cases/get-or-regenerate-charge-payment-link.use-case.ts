import { Inject, Injectable } from '@nestjs/common';
import type { BillingPaymentLinkResponse } from '@ikaro/types';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { Charge } from '../../domain/charge.aggregate';
import type { ChargeStatus } from '../../domain/charge.types';
import {
  BillingAddressRequiredError,
  BillingProviderUnavailableError,
  ChargeNotFoundError,
  ChargeNotPayableError,
} from '../../domain/errors/billing-domain.error';
import {
  ProviderNotSupportedError,
  ProviderRequestError,
} from '../../domain/errors/billing-provider.errors';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderPort,
  type BillingProviderRegistryPort,
  type ProviderPaymentLink,
} from '../ports/billing-provider.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';

export interface GetOrRegenerateChargePaymentLinkUseCaseInput {
  tenantId: string;
  chargeId: string;
}

export type GetOrRegenerateChargePaymentLinkUseCaseResult = BillingPaymentLinkResponse;

const PAID_RESPONSE: BillingPaymentLinkResponse = {
  status: 'PAID',
  paymentUrl: null,
  expiresAt: null,
};

// A paid charge has no link to give, whatever it stores (A4); any other carries the URL it was given.
function toResponse(
  status: ChargeStatus,
  paymentUrl: string,
  expiresAt: Date | null,
): BillingPaymentLinkResponse {
  if (status === 'PAID') return PAID_RESPONSE;
  return { status, paymentUrl, expiresAt: expiresAt?.toISOString() ?? null };
}

/**
 * UC-119: the hosted payment URL of one of the tenant's charges. An already-paid charge answers the
 * paid state (A4) and one that can no longer be paid is `ChargeNotPayableError` (A5). A stored link
 * with no expiry or an expiry still ahead is returned as it is, with no provider call; an expired
 * one is regenerated (A1). A charge the provider does not hold yet has no link to regenerate: an
 * incomplete billing identity (the held recovery charge) is `BillingAddressRequiredError`, anything
 * else `BillingProviderUnavailableError`, and neither makes a provider call.
 *
 * M26-D3: the provider is called with no transaction and no lock held. The write that follows is one
 * short transaction under the charge row lock (B-C1, no B-R1: it changes charge columns and reads
 * nothing from the subscription) on a fresh read, because a webhook can have settled the charge in
 * between. The link is stored whatever the charge has become, and the payability rule is applied
 * again to that fresh read.
 */
@Injectable()
export class GetOrRegenerateChargePaymentLinkUseCase {
  private readonly logger = new AppLogger(GetOrRegenerateChargePaymentLinkUseCase.name);

  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: GetOrRegenerateChargePaymentLinkUseCaseInput,
  ): Promise<GetOrRegenerateChargePaymentLinkUseCaseResult> {
    const charge = await this.charges.findById(input.tenantId, input.chargeId);
    if (charge === null) throw new ChargeNotFoundError(input.chargeId);
    this.assertPayable(charge);
    if (charge.payability === 'PAID') return PAID_RESPONSE;
    const usable = this.usableLink(charge);
    if (usable !== null) return usable;

    const providerChargeId = charge.providerChargeId ?? (await this.noProviderCharge(charge));
    const adapter = this.resolveAdapter(charge);
    const link = await this.regenerate(adapter, providerChargeId, charge);
    return this.store(input, link);
  }

  private assertPayable(charge: Charge): void {
    if (charge.payability === 'NOT_PAYABLE') {
      throw new ChargeNotPayableError(charge.id, charge.status);
    }
  }

  // The same rule the summary's `hasPaymentLink` applies: no expiry means the provider gave none.
  private usableLink(charge: Charge): BillingPaymentLinkResponse | null {
    const { paymentUrl, paymentUrlExpiresAt } = charge;
    if (paymentUrl === null) return null;
    if (
      paymentUrlExpiresAt !== null &&
      paymentUrlExpiresAt.getTime() <= this.clock.now().getTime()
    ) {
      return null;
    }
    return toResponse(charge.status, paymentUrl, paymentUrlExpiresAt);
  }

  // A charge with no provider id has nothing to regenerate. The identity decides which refusal:
  // a held recovery charge waits for the manager (the page sends them to "Dados de cobrança"), any
  // other one waits for the creation retry. Neither calls the provider.
  private async noProviderCharge(charge: Charge): Promise<never> {
    const account = await this.accounts.findByTenantId(charge.tenantId);
    if (!account?.hasBillableIdentity()) throw new BillingAddressRequiredError();
    throw new BillingProviderUnavailableError(
      'the charge has not been created at the provider yet',
    );
  }

  // A key with no adapter yet (a sandbox or live key before its adapter ships) answers the manager,
  // never a 500 and never a silent skip (TD51 Story 9). A key not allowed in this environment is a
  // deployment defect and stays loud.
  private resolveAdapter(charge: Charge): BillingProviderPort {
    try {
      return this.registry.resolve(charge.merchantProfileKey);
    } catch (err) {
      if (!(err instanceof ProviderNotSupportedError)) throw err;
      this.logger.warn('billing_payment_link_provider_unsupported', {
        tenantId: charge.tenantId,
        chargeId: charge.id,
        merchantProfileKey: charge.merchantProfileKey,
      });
      throw new BillingProviderUnavailableError('no adapter serves this merchant profile');
    }
  }

  private async regenerate(
    adapter: BillingProviderPort,
    providerChargeId: string,
    charge: Charge,
  ): Promise<ProviderPaymentLink> {
    try {
      return await adapter.regeneratePaymentLink(providerChargeId);
    } catch (err) {
      if (!(err instanceof ProviderRequestError)) throw err;
      this.logger.warn('billing_payment_link_regeneration_failed', {
        tenantId: charge.tenantId,
        chargeId: charge.id,
        reason: err.reason,
      });
      throw new BillingProviderUnavailableError(err.reason);
    }
  }

  // The link is kept whatever the charge has become, then the payability rule is applied again.
  private async store(
    input: GetOrRegenerateChargePaymentLinkUseCaseInput,
    link: ProviderPaymentLink,
  ): Promise<BillingPaymentLinkResponse> {
    const fresh = await this.txManager.run(async () => {
      const locked = await this.charges.findByIdForUpdate(input.tenantId, input.chargeId);
      if (locked === null) return null;
      locked.renewPaymentLink(link.paymentUrl, link.expiresAt);
      await this.charges.save(locked);
      return locked;
    });
    if (fresh === null) throw new ChargeNotFoundError(input.chargeId);
    this.assertPayable(fresh);
    return toResponse(fresh.status, link.paymentUrl, link.expiresAt);
  }
}
