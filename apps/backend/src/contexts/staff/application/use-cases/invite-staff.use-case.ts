import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { Staff } from '../../domain/staff.aggregate';
import { InviteStaffDto } from '../dtos/invite-staff.dto';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface InviteStaffUseCaseResult {
  staffId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  isActive: boolean;
}

@Injectable()
export class InviteStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: InviteStaffDto): Promise<InviteStaffUseCaseResult> {
    const { tenantId, email, firstName, lastName, role, invitedBy } = dto;
    const normalizedEmail = email.toLowerCase().trim();
    const name = `${firstName} ${lastName}`.trim();
    const correlationId = this.tenantContext.correlationId;

    const existing = await this.staffRepo.findByTenantAndEmail(tenantId, normalizedEmail);

    if (existing?.googleOAuthId) {
      throw new StaffAlreadyExistsError(normalizedEmail);
    }

    const staff =
      existing ?? Staff.invite(tenantId, normalizedEmail, role, name, invitedBy, correlationId);
    if (existing) staff.reinvite(role, name, invitedBy, correlationId);

    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
    });

    for (const event of staff.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return { staffId: staff.id, email: normalizedEmail, role: staff.role, isActive: staff.isActive };
  }
}
