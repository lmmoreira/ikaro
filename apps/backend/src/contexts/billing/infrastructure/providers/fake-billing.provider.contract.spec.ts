import { runBillingProviderContract } from '../../../../test/contracts/billing-provider.contract';
import {
  FAKE_CONTRACT_CAPABILITIES,
  fakeBillingHarness,
} from '../../../../test/contracts/fake-billing-provider.harness';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { FakeBillingProvider } from './fake-billing.provider';

describe('FakeBillingProvider against the contract suite', () => {
  // A sandbox runner switches capabilities off where its provider cannot produce a scenario; the
  // fake is the one runner that can produce all of them, so it must never be narrowed.
  it('runs every capability the contract suite knows', () => {
    expect(Object.values(FAKE_CONTRACT_CAPABILITIES).every(Boolean)).toBe(true);
  });

  runBillingProviderContract(
    'FakeBillingProvider',
    () => {
      const clock = new FixedClock(new Date('2026-11-11T12:00:00.000Z'));
      return fakeBillingHarness(new FakeBillingProvider(clock), clock);
    },
    FAKE_CONTRACT_CAPABILITIES,
  );
});
