import { Money } from '../../../shared/value-objects/money';
import { ClassResourceSlot } from './class-resource-slot';
import { ActiveResourceIdsByType, ServiceBookingModel } from './resource-requirement-availability';
import { ResourceRequirement } from './resource-requirement';
import { ServiceLeg } from './service-leg';

// Split out of service.aggregate.ts to stay under docs/CODE_STANDARDS.md's file-length limit —
// pure type/interface declarations, no logic, so the split carries no behavioral risk.
// ServiceBookingModel itself is re-exported here (canonical definition lives in
// resource-requirement-availability.ts) so existing call sites can keep importing it from either
// this file or service.aggregate.ts.
export type { ServiceBookingModel };

export interface ServiceProps {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirement[];
  bufferAfterMinutes: number | null;
  legs: ServiceLeg[] | null;
  classResourceSlots: ClassResourceSlot[] | null;
}

export interface CreateServiceProps {
  tenantId: string;
  name: string;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;
  description?: string;
  bookingModel?: ServiceBookingModel;
  // Tenant's current settings.serviceBufferMinutes, snapshotted by the caller at creation time
  // (UC-053 step 1). Ignored for a SESSION service.
  tenantServiceBufferMinutes?: number | null;
  classResourceSlots?: ClassResourceSlot[];
  // Resolved by the caller (IResourceRepository.findByTenant) — required whenever
  // classResourceSlots is non-empty; ignored otherwise. See setResourceRequirements()/setLegs()'s
  // identical parameter for why this lives outside the aggregate.
  activeResourceIdsByType?: ActiveResourceIdsByType;
}
