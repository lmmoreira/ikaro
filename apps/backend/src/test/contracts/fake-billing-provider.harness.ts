import { FakeBillingProvider } from '../../contexts/billing/infrastructure/providers/fake-billing.provider';
import { MERCHANT_PROFILE_KEYS } from '../../contexts/billing/domain/merchant-profile-key';
import type { IClock } from '../../shared/ports/clock.port';
import type {
  BillingProviderContractHarness,
  ContractCapabilities,
} from './billing-provider.contract';

export const FAKE_CONTRACT_CAPABILITIES: ContractCapabilities = {
  methodSequences: true,
  overdue: true,
  refund: true,
  chargeback: true,
  deliveryControl: true,
  queuePause: true,
  autoBilling: true,
};

const UNKNOWN_EVENT_BODY = JSON.stringify({
  id: 'evt_00000000000000000000000000000000&1',
  event: 'PAYMENT_CHECKOUT_VIEWED',
  dateCreated: '2026-11-09 09:26:37',
  payment: { id: 'pay_x', value: 49 },
});

/** Wires a `FakeBillingProvider` (built by the caller, directly or through DI) into the contract suite. */
export function fakeBillingHarness(
  fake: FakeBillingProvider,
  clock: IClock,
): BillingProviderContractHarness {
  return {
    provider: fake,
    merchantProfileKey: MERCHANT_PROFILE_KEYS.BRL_FAKE,
    now: () => clock.now(),
    scenarios: {
      pay: async (id, method) => fake.simulatePayment(id, method),
      settleCard: async (id) => fake.simulateCardSettlement(id),
      overdue: async (id) => fake.simulateOverdue(id),
      refund: async (id, kind) => fake.simulateRefund(id, kind),
      chargeback: async (id) => fake.simulateChargeback(id),
      failNextCall: (reason) => fake.failNextCall(reason),
      pauseWebhookQueue: () => fake.pauseWebhookQueue(),
      drain: async (misbehaviour) => fake.drainDeliveries(misbehaviour),
      unknownEventBody: () => UNKNOWN_EVENT_BODY,
    },
  };
}
