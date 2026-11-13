import { Reflector } from '@nestjs/core';
import { StubExecutionContext } from '../../test/stub-execution-context';
import { readTenantAccessRequirement } from '../guards/tenant-access-metadata';
import { NO_FEATURE_GATE_KEY, NoFeatureGate } from './no-feature-gate.decorator';
import { REQUIRES_FEATURE_KEY, RequiresFeature } from './requires-feature.decorator';
import { SUSPENSION_ACCESS_KEY, SuspensionAccess } from './suspension-access.decorator';

describe('tenant access decorators (BFF)', () => {
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
    const context = new StubExecutionContext(Controller.prototype.status, Controller, {
      headers: {},
    });
    expect(readTenantAccessRequirement(reflector, context)).toEqual({
      feature: 'BOOKING',
      noFeatureGate: undefined,
      policy: 'STAFF_NOTICE',
    });
  });

  it('resolves the entitlement declaration at the nearest scope, never key by key', () => {
    @NoFeatureGate()
    class ExemptController {
      @RequiresFeature('CHATBOT')
      gated(): void {}

      open(): void {}
    }
    const gated = new StubExecutionContext(ExemptController.prototype.gated, ExemptController, {
      headers: {},
    });
    const open = new StubExecutionContext(ExemptController.prototype.open, ExemptController, {
      headers: {},
    });

    // The handler's @RequiresFeature replaces the controller's whole entitlement declaration…
    expect(readTenantAccessRequirement(reflector, gated)).toMatchObject({
      feature: 'CHATBOT',
      noFeatureGate: undefined,
    });
    // …and a handler that declares none inherits the controller's.
    expect(readTenantAccessRequirement(reflector, open)).toMatchObject({
      feature: undefined,
      noFeatureGate: true,
    });
  });
});
