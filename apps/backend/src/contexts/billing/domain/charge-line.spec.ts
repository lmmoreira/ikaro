import { ChargeLineBuilder } from '../../../test/builders/billing';
import { ChargeLine } from './charge-line';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { MinorAmount } from './value-objects/minor-amount.vo';

describe('ChargeLine', () => {
  it('carries the feature, the tier and the price it was billed at', () => {
    const line = new ChargeLineBuilder()
      .withFeatureKey('CHATBOT')
      .withTier('PLUS')
      .withUnitPriceMinor(7900)
      .build();

    expect(line.featureKey).toBe('CHATBOT');
    expect(line.tier).toBe('PLUS');
    expect(line.unitPrice.amountMinor).toBe(7900);
    expect(line.unitPriceMinor).toBe(7900);
  });

  it('is immutable: no field can be reassigned after construction', () => {
    const line = new ChargeLineBuilder().build();

    expect(Object.isFrozen(line)).toBe(true);
    expect(() => {
      (line as unknown as { tier: string }).tier = 'PLUS';
    }).toThrow(TypeError);
  });

  it('rejects a tier the feature does not sell', () => {
    expect(() =>
      new ChargeLineBuilder().withFeatureKey('HOTSITE').withTier('PLUS').build(),
    ).toThrow(ChargeInvariantError);
  });

  it('reconstitute skips validation: a stored row is trusted', () => {
    const line = ChargeLine.reconstitute({
      featureKey: 'HOTSITE',
      tier: 'PLUS',
      unitPrice: MinorAmount.reconstitute(1, 'BRL'),
    });

    expect(line.tier).toBe('PLUS');
  });
});
