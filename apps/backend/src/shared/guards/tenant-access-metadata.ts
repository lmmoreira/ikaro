import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { SuspensionAccessPolicy, TenantAccessRequirement } from '@ikaro/types';
import { NO_FEATURE_GATE_KEY } from '../decorators/no-feature-gate.decorator';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { SUSPENSION_ACCESS_KEY } from '../decorators/suspension-access.decorator';

/**
 * What a route declares about tenant access: the one place the three decorators are read, so a
 * future gate (events, crons, notifications) shares the vocabulary instead of re-reading metadata.
 *
 * `@RequiresFeature` and `@NoFeatureGate` together are the route's one *entitlement* declaration:
 * they resolve at the nearest scope declaring either, so a handler's declaration overrides its
 * controller's whole entitlement declaration. Read key by key, a controller-level `@NoFeatureGate()`
 * would silently cancel a handler's own `@RequiresFeature(...)`. The suspension policy is a separate
 * declaration and inherits on its own.
 */
export function readTenantAccessRequirement(
  reflector: Reflector,
  context: ExecutionContext,
): TenantAccessRequirement {
  const handler = context.getHandler();
  const controller = context.getClass();
  const handlerDeclaresEntitlement =
    reflector.get<string | undefined>(REQUIRES_FEATURE_KEY, handler) !== undefined ||
    reflector.get<boolean | undefined>(NO_FEATURE_GATE_KEY, handler) !== undefined;
  const entitlementScope = handlerDeclaresEntitlement ? handler : controller;

  return {
    feature: reflector.get<string | undefined>(REQUIRES_FEATURE_KEY, entitlementScope),
    noFeatureGate: reflector.get<boolean | undefined>(NO_FEATURE_GATE_KEY, entitlementScope),
    policy: reflector.getAllAndOverride<SuspensionAccessPolicy | undefined>(SUSPENSION_ACCESS_KEY, [
      handler,
      controller,
    ]),
  };
}
