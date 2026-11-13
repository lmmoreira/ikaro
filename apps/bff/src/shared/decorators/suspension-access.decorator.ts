import { SetMetadata } from '@nestjs/common';
import { SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';

/**
 * Declares who may reach a route while the tenant is `SUSPENDED` (UC-125). The policy set and the
 * roles each one admits live in `SUSPENSION_POLICIES` (`@ikaro/types`); a route without this
 * decorator is `DEFAULT_DENY`. The role is read from the JWT.
 */
export const SuspensionAccess = (policy: SuspensionAccessPolicy) =>
  SetMetadata(SUSPENSION_ACCESS_KEY, policy);
