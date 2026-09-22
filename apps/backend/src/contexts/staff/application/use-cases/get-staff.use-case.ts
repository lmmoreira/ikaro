import { Inject, Injectable } from '@nestjs/common';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface StaffItemResult {
  id: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'STAFF';
  isActive: boolean;
  // Set once at UC-025 activation, never cleared by deactivate() — null means the
  // invite was never accepted. The BFF derives a display status from it (M13-S32)
  // and strips it from the frontend response.
  googleOAuthId: string | null;
  createdAt: string;
}

export interface GetStaffUseCaseInput {
  tenantId: string;
  ids?: string[];
  roles?: StaffRole[];
  status?: 'ACTIVE' | 'DEACTIVATED' | 'ANY';
  search?: string;
  limit: number;
  offset: number;
}

export interface GetStaffUseCaseResult {
  items: StaffItemResult[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

@Injectable()
export class GetStaffUseCase {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async execute(input: GetStaffUseCaseInput): Promise<GetStaffUseCaseResult> {
    const { items, total } = await this.staffRepo.findAllByTenant(input.tenantId, {
      ids: input.ids,
      roles: input.roles,
      status: input.status,
      search: input.search,
      limit: input.limit,
      offset: input.offset,
    });
    const hasMore = input.offset + items.length < total;

    return {
      items: items.map((s) => ({
        id: s.id,
        email: s.email.address,
        name: s.name,
        role: s.role,
        isActive: s.isActive,
        googleOAuthId: s.googleOAuthId,
        createdAt: s.createdAt.toISOString(),
      })),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore,
        nextOffset: hasMore ? input.offset + items.length : null,
      },
    };
  }
}
