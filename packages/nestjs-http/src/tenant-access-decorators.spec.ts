import 'reflect-metadata';
import { NoFeatureGate, RequiresFeature, SuspensionAccess } from './tenant-access-decorators';
import {
  NO_FEATURE_GATE_KEY,
  REQUIRES_FEATURE_KEY,
  SUSPENSION_ACCESS_KEY,
} from './tenant-access-metadata';

describe('tenant access decorators', () => {
  class Controller {
    @RequiresFeature('LOYALTY')
    @SuspensionAccess('CUSTOMER_HISTORY')
    history(): void {}

    @NoFeatureGate()
    health(): void {}
  }

  it('store the feature and the suspension policy under the shared route metadata keys', () => {
    const history = Controller.prototype.history;

    expect(Reflect.getMetadata(REQUIRES_FEATURE_KEY, history)).toBe('LOYALTY');
    expect(Reflect.getMetadata(SUSPENSION_ACCESS_KEY, history)).toBe('CUSTOMER_HISTORY');
  });

  it('marks a route that no feature owns', () => {
    expect(Reflect.getMetadata(NO_FEATURE_GATE_KEY, Controller.prototype.health)).toBe(true);
  });
});
