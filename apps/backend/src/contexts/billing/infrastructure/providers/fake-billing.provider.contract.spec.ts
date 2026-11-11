import { runBillingProviderContract } from '../../../../test/contracts/billing-provider.contract';
import {
  FAKE_CONTRACT_CAPABILITIES,
  fakeBillingHarness,
} from '../../../../test/contracts/fake-billing-provider.harness';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { FakeBillingProvider } from './fake-billing.provider';

runBillingProviderContract(
  'FakeBillingProvider',
  () => {
    const clock = new FixedClock(new Date('2026-11-11T12:00:00.000Z'));
    return fakeBillingHarness(new FakeBillingProvider(clock), clock);
  },
  FAKE_CONTRACT_CAPABILITIES,
);
