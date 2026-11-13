import type { ExecutionContext } from '@nestjs/common';
import type { SuspensionAccessPolicy, TenantAccessRequirement } from '@ikaro/types';

/**
 * The route metadata keys of the three tenant-access decorators (UC-125). The decorators live in
 * each app (`@RequiresFeature`, `@SuspensionAccess`, `@NoFeatureGate`, the way `@Public()` does);
 * the keys and the reader live here once, so both apps and every future gate read one vocabulary.
 */
export const REQUIRES_FEATURE_KEY = 'tenantAccess:requiresFeature';
export const SUSPENSION_ACCESS_KEY = 'tenantAccess:suspensionAccess';
export const NO_FEATURE_GATE_KEY = 'tenantAccess:noFeatureGate';

type MetadataTarget = (...args: never[]) => unknown;

/** What the reader needs from Nest's `Reflector` (which satisfies it structurally). */
export interface RouteMetadataReader {
  get<T>(key: string, target: MetadataTarget | object): T | undefined;
  getAllAndOverride<T>(key: string, targets: (MetadataTarget | object)[]): T | undefined;
}

/**
 * What a route declares about tenant access: the one place the three decorators are read.
 *
 * `@RequiresFeature` and `@NoFeatureGate` together are the route's one *entitlement* declaration:
 * they resolve at the nearest scope declaring either, so a handler's declaration overrides its
 * controller's whole entitlement declaration. Read key by key, a controller-level `@NoFeatureGate()`
 * would silently cancel a handler's own `@RequiresFeature(...)`. The suspension policy is a separate
 * declaration and inherits on its own.
 */
export function readTenantAccessRequirement(
  reflector: RouteMetadataReader,
  context: ExecutionContext,
): TenantAccessRequirement {
  const handler = context.getHandler();
  const controller = context.getClass();
  const handlerDeclaresEntitlement =
    reflector.get<string>(REQUIRES_FEATURE_KEY, handler) !== undefined ||
    reflector.get<boolean>(NO_FEATURE_GATE_KEY, handler) !== undefined;
  const entitlementScope = handlerDeclaresEntitlement ? handler : controller;

  return {
    feature: reflector.get<string>(REQUIRES_FEATURE_KEY, entitlementScope),
    noFeatureGate: reflector.get<boolean>(NO_FEATURE_GATE_KEY, entitlementScope),
    policy: reflector.getAllAndOverride<SuspensionAccessPolicy>(SUSPENSION_ACCESS_KEY, [
      handler,
      controller,
    ]),
  };
}
