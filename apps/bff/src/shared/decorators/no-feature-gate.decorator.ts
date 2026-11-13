import { SetMetadata } from '@nestjs/common';
import { NO_FEATURE_GATE_KEY } from '@ikaro/nestjs-http';

/**
 * Marks a route no sellable feature owns (health, auth, the access read itself). It skips the
 * **entitlement** check only: the suspension policy still applies, so pair it with
 * `@SuspensionAccess(...)` where a suspended tenant must stay reachable.
 */
export const NoFeatureGate = () => SetMetadata(NO_FEATURE_GATE_KEY, true);
