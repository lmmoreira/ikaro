import { Inject, Injectable } from '@nestjs/common';
import type { AppEnv } from '../../../../shared/database/resolve-app-env';
import type {
  BillingProviderPort,
  BillingProviderRegistryPort,
} from '../../application/ports/billing-provider.port';
import { ProviderNotSupportedError } from '../../domain/errors/billing-provider.errors';
import { MERCHANT_PROFILE_KEYS } from '../../domain/merchant-profile-key';
import { FakeBillingProvider } from './fake-billing.provider';
import { assertMerchantProfileKeyAllowed } from './provider-config.guard';

export const BILLING_APP_ENV = Symbol('BillingAppEnv');

/**
 * Resolves the adapter of a subscription's `merchantProfileKey`. Today only the fake serves
 * `BRL_FAKE`; the Asaas keys arrive with M26 and the Stripe keys, `USD_FAKE` included, with M28.
 * Every other key has no adapter and is refused, never silently served by the fake.
 *
 * Every adapter is registered in every environment, so the app always boots. The environment rule
 * is enforced when a key is looked up, never when the registry is built.
 */
@Injectable()
export class BillingProviderRegistry implements BillingProviderRegistryPort {
  private readonly adapters: ReadonlyMap<string, BillingProviderPort>;

  constructor(
    @Inject(BILLING_APP_ENV) private readonly appEnv: AppEnv,
    fake: FakeBillingProvider,
  ) {
    this.adapters = new Map<string, BillingProviderPort>([[MERCHANT_PROFILE_KEYS.BRL_FAKE, fake]]);
  }

  resolve(merchantProfileKey: string): BillingProviderPort {
    assertMerchantProfileKeyAllowed(this.appEnv, merchantProfileKey);
    const adapter = this.adapters.get(merchantProfileKey);
    if (!adapter) throw new ProviderNotSupportedError(`merchant profile key ${merchantProfileKey}`);
    return adapter;
  }
}
