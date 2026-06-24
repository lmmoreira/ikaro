import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { LinkGoogleAccountDto } from '../dtos/link-google-account.dto';
import {
  StaffDeactivatedError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffNotFoundError,
} from '../../domain/errors/staff-domain.error';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface LinkGoogleAccountUseCaseResult {
  staffId: string;
  tenantId: string;
  role: StaffRole;
}

@Injectable()
export class LinkGoogleAccountUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    staffId: string,
    dto: LinkGoogleAccountDto,
  ): Promise<LinkGoogleAccountUseCaseResult> {
    const staff = await this.staffRepo.findById(staffId, dto.tenantId);
    if (!staff) throw new StaffNotFoundError(staffId);
    if (!staff.isActive) throw new StaffDeactivatedError();
    if (staff.email.address !== dto.email.toLowerCase().trim()) throw new StaffEmailMismatchError();

    const conflicting = await this.staffRepo.findByTenantAndOAuthId(
      dto.tenantId,
      dto.googleOAuthId,
    );
    if (conflicting && conflicting.id !== staff.id) {
      throw new StaffGoogleAccountConflictError();
    }

    staff.linkGoogleAccount(dto.googleOAuthId, dto.name);
    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
    });

    return { staffId: staff.id, tenantId: staff.tenantId, role: staff.role };
  }
}
