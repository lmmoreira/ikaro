import type { ProviderRequestFailure } from '../../domain/errors/billing-provider.errors';
import type { PaymentMethod } from '../../domain/provider-events';

export const BILLING_FAKE_PROVIDER_CONTROL = Symbol('IBillingFakeProviderControl');

/** One webhook the fake would POST to the app, as it hands it out. */
export interface SimulatedDelivery {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  /** How long a real transport waits before delivering it. */
  readonly delayMs: number;
}

/** How a batch of queued deliveries misbehaves, as a real at-least-once webhook can. */
export interface SimulatedDeliveryOptions {
  readonly duplicate?: boolean;
  readonly reverse?: boolean;
  readonly delayMs?: number;
}

/**
 * The fake provider's scenario controls, which the `BillingProviderPort` deliberately does not
 * have. Bound only in `local` and `staging` (`DevBillingModule.register`): nothing in production
 * can resolve this token, so the dev `simulate` use case cannot exist there either. Every control
 * throws `FakeScenarioNotApplicableError` when the charge's state does not allow it.
 */
export interface IBillingFakeProviderControl {
  /** Whether this process created the charge; a restarted or second instance did not. */
  hasCharge(providerChargeId: string): boolean;
  simulatePayment(providerChargeId: string, method: PaymentMethod): void;
  simulateOverdue(providerChargeId: string): void;
  simulateRefund(providerChargeId: string, kind: 'FULL' | 'PARTIAL'): void;
  simulateDisputeOpened(providerChargeId: string): void;
  simulateChargeback(providerChargeId: string): void;
  /** The next network call fails once, with the named failure. */
  failNextCall(reason: ProviderRequestFailure): void;
  drainDeliveries(options?: SimulatedDeliveryOptions): SimulatedDelivery[];
}
