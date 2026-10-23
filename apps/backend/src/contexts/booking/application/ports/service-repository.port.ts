import { Service, ServiceBookingModel } from '../../domain/service.aggregate';

export const SERVICE_REPOSITORY = Symbol('IServiceRepository');

export type ServiceStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ANY';

export interface ServiceFilters {
  ids?: string[];
  status?: ServiceStatusFilter;
  search?: string;
}

export interface IServiceRepository {
  findById(id: string, tenantId: string): Promise<Service | null>;
  // Tenant-scoped existence check without hydrating the aggregate (no tenant-settings read, no
  // child-table reads) — for callers that only need "does this service exist" (e.g. the intake-
  // schema read, which sits beside GET /services/:id on the edit-page load).
  existsById(id: string, tenantId: string): Promise<boolean>;
  findByIds(ids: string[], tenantId: string): Promise<Service[]>;
  // TD56-S03 — the service whose generated public slug is `slug` within the tenant (any status,
  // published or not): the slug-clash check at first publish and the public by-slug read both use it
  // and apply their own published/active rules. Never cached — a single indexed lookup.
  findByPublicSlug(slug: string, tenantId: string): Promise<Service | null>;
  findAllByTenant(tenantId: string, filters?: ServiceFilters): Promise<Service[]>;
  // Real Postgres row lock (must be called inside an active transaction) — serializes against
  // any other caller of findByIdForUpdate() on the same row, closing read-then-write races that
  // a plain findById() can't (both a concurrent Service configuration write, and a concurrent
  // booking-creation write that also locks the referenced Service row — see
  // booking-request.helpers.ts's persistRequestedBooking()).
  findByIdForUpdate(id: string, tenantId: string): Promise<Service | null>;
  // Locks every given Service row in one round trip and returns just its current bookingModel —
  // a lighter-weight alternative to N sequential findByIdForUpdate() calls (each of which
  // hydrates the full aggregate, including child rows this check never needs) when a multi-
  // service booking must lock and re-check every referenced Service at once. See
  // booking-request.helpers.ts's persistRequestedBooking().
  lockBookingModels(ids: string[], tenantId: string): Promise<Map<string, ServiceBookingModel>>;
  save(service: Service): Promise<void>;
}
