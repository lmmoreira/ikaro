import { ActorRole } from '@ikaro/types';

export function actorHeaders(
  tenantId: string,
  actorId: string,
  role: ActorRole = 'MANAGER',
  correlationId = 'test-correlation-id',
): Record<string, string> {
  return {
    'x-tenant-id': tenantId,
    'x-actor-id': actorId,
    'x-actor-type': role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
    'x-actor-role': role,
    'x-correlation-id': correlationId,
  };
}
