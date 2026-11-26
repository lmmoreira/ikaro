import { BookableUntilGuard } from '../../contexts/booking/application/services/bookable-until.guard';
import { InMemoryBookableUntilLock } from './in-memory-bookable-until-lock';
import { InMemoryTenantAccessPort } from './in-memory-tenant-access.port';

// The guard every Booking use-case spec passes: in-memory lock and access port, no cap by default.
// A spec that is about the cap keeps the parts to seed `access` and read `lock.calls`.
export function createTestBookableUntilGuard(
  access: InMemoryTenantAccessPort = new InMemoryTenantAccessPort(),
  lock: InMemoryBookableUntilLock = new InMemoryBookableUntilLock(),
): {
  guard: BookableUntilGuard;
  access: InMemoryTenantAccessPort;
  lock: InMemoryBookableUntilLock;
} {
  return { guard: new BookableUntilGuard(lock, access), access, lock };
}
