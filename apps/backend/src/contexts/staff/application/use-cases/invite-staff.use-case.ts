import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Email } from '../../../../shared/value-objects/email.vo';
import { normalizeText } from '../../../../shared/utils/text-normalization';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { Staff } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface InviteStaffUseCaseInput {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'MANAGER' | 'STAFF';
  invitedBy: string | null;
  correlationId: string;
}

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
  ) {}

  async execute(dto: InviteStaffUseCaseInput): Promise<InviteStaffUseCaseResult> {
    const { tenantId, email, firstName, lastName, role, invitedBy, correlationId } = dto;
    const normalizedEmail = Email.create(email).address;
    const name = normalizeText(`${firstName} ${lastName}`);

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

    return {
      staffId: staff.id,
      email: normalizedEmail,
      role: staff.role,
      isActive: staff.isActive,
    };
  }
}
