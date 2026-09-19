import {
  IServiceRepository,
  ServiceFilters,
} from '../../../contexts/booking/application/ports/service-repository.port';
import { Service, ServiceBookingModel } from '../../../contexts/booking/domain/service.aggregate';
import {
  IResourceRepository,
  ListResourcesFilter,
} from '../../../contexts/booking/application/ports/resource-repository.port';
import { Resource } from '../../../contexts/booking/domain/resource.aggregate';
import { ResourceRequirement } from '../../../contexts/booking/domain/resource-requirement';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';
import { ResourceBuilder } from '../../builders/booking/resource.builder';
import { ServiceBuilder } from '../../builders/booking/service.builder';
import { InMemoryServiceRepository } from './in-memory-service.repository';
import { InMemoryResourceRepository } from './in-memory-resource.repository';

// Test-infrastructure-only pair (M22-S03) — approve/reschedule/reject/cancel now resolve a
// booking's own service(s)/resource(s) to know what to occupy/release, entirely new plumbing
// pre-existing specs never needed to seed. Every one of those specs builds its Booking fixture
// via BookingBuilder, whose default line serviceId is a fresh random uuidv7 the test never
// explicitly seeds a matching Service for. Rather than hand-editing every existing test to seed a
// Service+Resource pair for a serviceId it doesn't otherwise care about, this pair transparently
// synthesizes a degenerate (LOCATION/NONE) Service/Resource on first lookup — scoped to this
// test-infra file only; the real InMemoryServiceRepository/InMemoryResourceRepository classes
// (used by many unrelated specs) are untouched.
export class AutoLocationResourceRepository implements IResourceRepository {
  private readonly inner = new InMemoryResourceRepository();
  private readonly locationByTenant = new Map<string, Resource>();

  async findByTenant(tenantId: string, filter: ListResourcesFilter): Promise<Resource[]> {
    const existing = await this.inner.findByTenant(tenantId, filter);
    if (existing.length > 0) return existing;
    if (filter.type === ResourceType.LOCATION && filter.isActive !== false) {
      return [this.ensureLocation(tenantId)];
    }
    return existing;
  }

  async findById(id: string, tenantId: string): Promise<Resource | null> {
    const existing = await this.inner.findById(id, tenantId);
    if (existing) return existing;
    const location = this.locationByTenant.get(tenantId);
    return location?.id === id ? location : null;
  }

  async findByRefId(refId: string, tenantId: string): Promise<Resource | null> {
    return this.inner.findByRefId(refId, tenantId);
  }

  async save(resource: Resource): Promise<void> {
    await this.inner.save(resource);
  }

  ensureLocation(tenantId: string): Resource {
    const existing = this.locationByTenant.get(tenantId);
    if (existing) return existing;
    const resource = new ResourceBuilder()
      .withTenantId(tenantId)
      .withType(ResourceType.LOCATION)
      .build();
    this.locationByTenant.set(tenantId, resource);
    return resource;
  }
}

export class AutoDegenerateServiceRepository implements IServiceRepository {
  private readonly inner = new InMemoryServiceRepository();

  constructor(private readonly resourceRepo: AutoLocationResourceRepository) {}

  async findById(id: string, tenantId: string): Promise<Service | null> {
    const existing = await this.inner.findById(id, tenantId);
    return existing ?? this.autoCreate(id, tenantId);
  }

  async existsById(id: string, tenantId: string): Promise<boolean> {
    return (await this.findById(id, tenantId)) !== null;
  }

  async findByIdForUpdate(id: string, tenantId: string): Promise<Service | null> {
    return this.findById(id, tenantId);
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    const found = await this.inner.findByIds(ids, tenantId);
    const foundIds = new Set(found.map((s) => s.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    const created = await Promise.all(missing.map((id) => this.autoCreate(id, tenantId)));
    return [...found, ...created];
  }

  async lockBookingModels(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, ServiceBookingModel>> {
    await this.findByIds(ids, tenantId);
    return this.inner.lockBookingModels(ids, tenantId);
  }

  async findAllByTenant(tenantId: string, filters?: ServiceFilters): Promise<Service[]> {
    return this.inner.findAllByTenant(tenantId, filters);
  }

  async save(service: Service): Promise<void> {
    await this.inner.save(service);
  }

  private async autoCreate(id: string, tenantId: string): Promise<Service> {
    const resource = this.resourceRepo.ensureLocation(tenantId);
    const service = new ServiceBuilder()
      .withId(id)
      .withTenantId(tenantId)
      // Zero buffer — ServiceBuilder's own default (60) would otherwise get baked into every
      // auto-created service's resource_occupancy endsAt (UC-059), breaking pre-existing specs
      // that seed "adjacent" conflicts assuming no buffer at all.
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.LOCATION,
          selectionMode: 'NONE',
          resourcePoolIds: [resource.id],
          requiredQuantity: 1,
        }),
      ])
      .build();
    await this.inner.save(service);
    return service;
  }
}

export interface AutoBookingResourceFixtures {
  serviceRepo: AutoDegenerateServiceRepository;
  resourceRepo: AutoLocationResourceRepository;
}

export function createAutoBookingResourceFixtures(): AutoBookingResourceFixtures {
  const resourceRepo = new AutoLocationResourceRepository();
  const serviceRepo = new AutoDegenerateServiceRepository(resourceRepo);
  return { serviceRepo, resourceRepo };
}
