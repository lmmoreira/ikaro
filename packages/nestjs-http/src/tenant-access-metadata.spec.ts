import 'reflect-metadata';
import { SetMetadata } from '@nestjs/common';
import {
  NO_FEATURE_GATE_KEY,
  REQUIRES_FEATURE_KEY,
  SUSPENSION_ACCESS_KEY,
  readTenantAccessRequirement,
  type RouteMetadataReader,
} from './tenant-access-metadata';
import { StubExecutionContext } from './stub-execution-context';

// The same two reads Nest's `Reflector` does, over `Reflect` metadata, so the reader is exercised
// against real decorator metadata without depending on `@nestjs/core`.
const reader: RouteMetadataReader = {
  get: <T>(key: string, target: object) => Reflect.getMetadata(key, target) as T | undefined,
  getAllAndOverride: <T>(key: string, targets: object[]) => {
    for (const target of targets) {
      const value = Reflect.getMetadata(key, target) as T | undefined;
      if (value !== undefined) return value;
    }
    return undefined;
  },
};

const contextOf = (
  controller: new () => { handler(): void },
  name: 'handler' | 'other' = 'handler',
) =>
  new StubExecutionContext(
    (controller.prototype as Record<string, (...args: never[]) => unknown>)[name],
    controller,
    {},
  );

describe('readTenantAccessRequirement', () => {
  it('returns an empty requirement for a route that declares nothing', () => {
    class Plain {
      handler(): void {}
    }
    expect(readTenantAccessRequirement(reader, contextOf(Plain))).toEqual({
      feature: undefined,
      noFeatureGate: undefined,
      policy: undefined,
    });
  });

  it('reads the three declarations of a handler', () => {
    class Route {
      @SetMetadata(REQUIRES_FEATURE_KEY, 'LOYALTY')
      @SetMetadata(SUSPENSION_ACCESS_KEY, 'CUSTOMER_HISTORY')
      handler(): void {}
    }
    expect(readTenantAccessRequirement(reader, contextOf(Route))).toEqual({
      feature: 'LOYALTY',
      noFeatureGate: undefined,
      policy: 'CUSTOMER_HISTORY',
    });
  });

  it('lets the handler win over its controller for the suspension policy', () => {
    @SetMetadata(SUSPENSION_ACCESS_KEY, 'DEFAULT_DENY')
    class Route {
      @SetMetadata(SUSPENSION_ACCESS_KEY, 'STAFF_NOTICE')
      handler(): void {}
    }
    expect(readTenantAccessRequirement(reader, contextOf(Route)).policy).toBe('STAFF_NOTICE');
  });

  it('resolves the entitlement declaration at the nearest scope, never key by key', () => {
    @SetMetadata(NO_FEATURE_GATE_KEY, true)
    class ExemptController {
      @SetMetadata(REQUIRES_FEATURE_KEY, 'CHATBOT')
      handler(): void {}

      other(): void {}
    }

    // The handler's @RequiresFeature replaces the controller's whole entitlement declaration…
    expect(readTenantAccessRequirement(reader, contextOf(ExemptController))).toMatchObject({
      feature: 'CHATBOT',
      noFeatureGate: undefined,
    });
    // …and a handler that declares none inherits the controller's.
    expect(
      readTenantAccessRequirement(
        reader,
        new StubExecutionContext(ExemptController.prototype.other, ExemptController, {}),
      ),
    ).toMatchObject({ feature: undefined, noFeatureGate: true });
  });
});
