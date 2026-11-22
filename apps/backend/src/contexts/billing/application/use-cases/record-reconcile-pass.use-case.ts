import { Inject, Injectable } from '@nestjs/common';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderRegistryPort,
} from '../ports/billing-provider.port';
import {
  IProviderHealthRepository,
  PROVIDER_HEALTH_REPOSITORY,
} from '../ports/provider-health-repository.port';

export interface RecordReconcilePassUseCaseInput {
  merchantProfileKey: string;
  at: Date;
  /** `true` when the run was a complete full pass: it also stamps `last_full_reconcile_at`. */
  fullPass: boolean;
  /** `true` when a provider read for this key already succeeded in the run. */
  providerReadSucceeded: boolean;
}

/**
 * UC-116: the one write that says a provider account was seen healthy. A run with nothing to read
 * for this key (an empty at-risk set) still has to prove the provider answers, so it reads the
 * account's health first: a provider that is down fails here and `last_reconcile_ok_at` is not
 * advanced, which is what lets the freeze (S08) tell "nothing to reconcile" from "cannot reconcile".
 * Then a column-scoped write (it never touches the freeze or the webhook status).
 */
@Injectable()
export class RecordReconcilePassUseCase {
  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(PROVIDER_HEALTH_REPOSITORY) private readonly health: IProviderHealthRepository,
  ) {}

  async execute(input: RecordReconcilePassUseCaseInput): Promise<void> {
    if (!input.providerReadSucceeded) {
      await this.registry
        .resolve(input.merchantProfileKey)
        .readAccountHealth(input.merchantProfileKey);
    }
    await this.health.recordReconcileOk(input.merchantProfileKey, input.at, input.fullPass);
  }
}
