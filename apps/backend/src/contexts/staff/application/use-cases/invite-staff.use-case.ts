import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { StaffInvited } from '../../domain/events/staff-invited.event';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { Staff } from '../../domain/staff.aggregate';
import { InviteStaffDto } from '../dtos/invite-staff.dto';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface InviteStaffUseCaseResult {
  staffId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  isActive: false;
}

@Injectable()
export class InviteStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: InviteStaffDto): Promise<InviteStaffUseCaseResult> {
    const { tenantId, email, firstName, lastName, role, invitedBy } = dto;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.staffRepo.findByTenantAndEmail(tenantId, normalizedEmail);

    if (existing?.isActive) {
      throw new StaffAlreadyExistsError(normalizedEmail);
    }

    // A2: inactive staff exists — reuse the row, update role, resend invite
    const staff = existing ?? Staff.invite(tenantId, normalizedEmail, role);
    if (existing) staff.reinvite(role);

    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
    });

    await this.eventBus.publish(
      new StaffInvited(tenantId, uuidv7(), {
        staffId: staff.id,
        email: normalizedEmail,
        firstName,
        lastName,
        role: staff.role,
        invitedBy,
      }),
    );

    return { staffId: staff.id, email: normalizedEmail, role: staff.role, isActive: false };
  }
}
