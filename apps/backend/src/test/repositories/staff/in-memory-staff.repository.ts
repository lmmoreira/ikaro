import {
  FindAllByTenantResult,
  IStaffRepository,
  StaffFilters,
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

  async findAllByEmail(email: string): Promise<Staff[]> {
    return Array.from(this.store.values()).filter((s) => s.email.address === email);
  }

  async findById(id: string, tenantId: string): Promise<Staff | null> {
    const staff = this.store.get(id);
    if (staff?.tenantId !== tenantId) return null;
    return staff;
  }

  async findAllByTenant(tenantId: string, filters: StaffFilters): Promise<FindAllByTenantResult> {
    if (filters.ids && filters.ids.length === 0) return { items: [], total: 0 };
    let all = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    if (filters.ids) all = all.filter((s) => filters.ids!.includes(s.id));
    if (filters.roles?.length) all = all.filter((s) => filters.roles!.includes(s.role));
    if (filters.status === 'ACTIVE') all = all.filter((s) => s.isActive);
    if (filters.status === 'DEACTIVATED') all = all.filter((s) => !s.isActive);
    if (filters.search) {
      const search = filters.search.toLowerCase();
      all = all.filter(
        (s) =>
          s.email.address.toLowerCase().includes(search) || s.name?.toLowerCase().includes(search),
      );
    }
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
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
