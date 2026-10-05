import { ActorRole } from '@ikaro/types';

export function actorHeaders(
  tenantId: string,
  actorId: string,
  role: ActorRole = 'MANAGER',
  correlationId = '01980000-0000-7000-8000-0000000000c0',
): Record<string, string> {
  return {
    'x-tenant-id': tenantId,
    'x-actor-id': actorId,
    'x-actor-type': role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
    'x-actor-role': role,
    'x-correlation-id': correlationId,
  };
}
