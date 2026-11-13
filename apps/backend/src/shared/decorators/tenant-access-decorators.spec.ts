import { Reflector } from '@nestjs/core';
import { readTenantAccessRequirement } from '../guards/tenant-access-metadata';
import { NO_FEATURE_GATE_KEY, NoFeatureGate } from './no-feature-gate.decorator';
import { REQUIRES_FEATURE_KEY, RequiresFeature } from './requires-feature.decorator';
import { SUSPENSION_ACCESS_KEY, SuspensionAccess } from './suspension-access.decorator';

describe('tenant access decorators', () => {
  const reflector = new Reflector();

  it('store their declaration as route metadata', () => {
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

  it('read back as one requirement, the handler winning over its controller', () => {
    @RequiresFeature('BOOKING')
    @SuspensionAccess('DEFAULT_DENY')
    class Controller {
      @SuspensionAccess('STAFF_NOTICE')
      status(): void {}
    }
    const context = {
      getHandler: () => Controller.prototype.status,
      getClass: () => Controller,
    } as never;
    expect(readTenantAccessRequirement(reflector, context)).toEqual({
      feature: 'BOOKING',
      noFeatureGate: undefined,
      policy: 'STAFF_NOTICE',
    });
  });
});
