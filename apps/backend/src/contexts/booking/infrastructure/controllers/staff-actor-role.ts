import type { ActorRole } from '@ikaro/types/protocol/actor';

// A request on a staff-only route is authenticated as STAFF or MANAGER; RequestContext types its
// role as the wider ActorRole (it also covers CUSTOMER), so the use case input needs this narrowing.
export function staffActorRole(role: ActorRole | undefined): 'STAFF' | 'MANAGER' {
  return role === 'MANAGER' ? 'MANAGER' : 'STAFF';
}
