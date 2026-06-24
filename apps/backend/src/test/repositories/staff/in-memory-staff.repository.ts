import {
  FindAllByTenantResult,
  IStaffRepository,
} from '../../../contexts/staff/application/ports/staff-repository.port';
import { Staff } from '../../../contexts/staff/domain/staff.aggregate';

export class InMemoryStaffRepository implements IStaffRepository {
  private readonly store = new Map<string, Staff>();

  async findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Staff | null> {
    for (const staff of this.store.values()) {
      if (staff.tenantId === tenantId && staff.googleOAuthId === googleOAuthId) {
        return staff;
      }
    }
    return null;
  }

  async findAllByGoogleOAuthId(googleOAuthId: string): Promise<Staff[]> {
    return Array.from(this.store.values()).filter((s) => s.googleOAuthId === googleOAuthId);
  }

  async findByTenantAndEmail(tenantId: string, email: string): Promise<Staff | null> {
    for (const staff of this.store.values()) {
      if (staff.tenantId === tenantId && staff.email.address === email) {
        return staff;
      }
    }
    return null;
  }

  async findById(id: string, tenantId: string): Promise<Staff | null> {
    const staff = this.store.get(id);
    if (staff?.tenantId !== tenantId) return null;
    return staff;
  }

  async findAllByTenant(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<FindAllByTenantResult> {
    const all = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    const total = all.length;
    const items = all.slice(offset, offset + limit);
    return { items, total };
  }

  async countActiveManagersByTenant(tenantId: string): Promise<number> {
    return Array.from(this.store.values()).filter(
      (s) => s.tenantId === tenantId && s.role === 'MANAGER' && s.isActive,
    ).length;
  }

  async save(staff: Staff): Promise<void> {
    this.store.set(staff.id, staff);
  }
}
