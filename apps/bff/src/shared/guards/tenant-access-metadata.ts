import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { SuspensionAccessPolicy, TenantAccessRequirement } from '@ikaro/types';
import { NO_FEATURE_GATE_KEY } from '../decorators/no-feature-gate.decorator';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { SUSPENSION_ACCESS_KEY } from '../decorators/suspension-access.decorator';

/**
 * What a route declares about tenant access: the one place the three decorators are read, so a
 * future gate shares the vocabulary instead of re-reading metadata. The handler's own declaration
 * wins over its controller's.
 */
export function readTenantAccessRequirement(
  reflector: Reflector,
  context: ExecutionContext,
): TenantAccessRequirement {
  const targets = [context.getHandler(), context.getClass()];
  return {
    feature: reflector.getAllAndOverride<string | undefined>(REQUIRES_FEATURE_KEY, targets),
    noFeatureGate: reflector.getAllAndOverride<boolean | undefined>(NO_FEATURE_GATE_KEY, targets),
    policy: reflector.getAllAndOverride<SuspensionAccessPolicy | undefined>(
      SUSPENSION_ACCESS_KEY,
      targets,
    ),
  };
}
