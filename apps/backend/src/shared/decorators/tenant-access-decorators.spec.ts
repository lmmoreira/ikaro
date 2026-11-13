import { Reflector } from '@nestjs/core';
import {
  NO_FEATURE_GATE_KEY,
  REQUIRES_FEATURE_KEY,
  SUSPENSION_ACCESS_KEY,
} from '@ikaro/nestjs-http';
import { NoFeatureGate } from './no-feature-gate.decorator';
import { RequiresFeature } from './requires-feature.decorator';
import { SuspensionAccess } from './suspension-access.decorator';

describe('tenant access decorators', () => {
  const reflector = new Reflector();

  it('store their declaration under the shared route metadata keys', () => {
    class Controller {
      @RequiresFeature('LOYALTY')
      @SuspensionAccess('CUSTOMER_HISTORY')
      history(): void {}

      @NoFeatureGate()
      health(): void {}
    }
    const history = Controller.prototype.history;
    expect(reflector.get(REQUIRES_FEATURE_KEY, history)).toBe('LOYALTY');
    expect(reflector.get(SUSPENSION_ACCESS_KEY, history)).toBe('CUSTOMER_HISTORY');
    expect(reflector.get(NO_FEATURE_GATE_KEY, Controller.prototype.health)).toBe(true);
  });
});
