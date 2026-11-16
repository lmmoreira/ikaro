import { Injectable } from '@nestjs/common';
import { GetStaffUseCase } from '../../../staff/application/use-cases/get-staff.use-case';
import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import {
  INotificationStaffPort,
  NotificationStaffInfo,
} from '../../application/ports/notification-staff.port';

@Injectable()
export class NotificationStaffAdapter implements INotificationStaffPort {
  constructor(
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly getStaff: GetStaffUseCase,
  ) {}

  async getStaffInfo(staffId: string, tenantId: string): Promise<NotificationStaffInfo | null> {
    try {
      const result = await this.getStaffById.execute({ staffId, tenantId });
      return { id: result.id, email: result.email, name: result.name };
    } catch (err) {
      // Only a genuine "no such staff member" collapses to null; any other failure must propagate.
      if (err instanceof StaffNotFoundError) return null;
      throw err;
    }
  }

  async getManagerEmails(tenantId: string): Promise<string[]> {
    const result = await this.getStaff.execute({
      tenantId,
      roles: ['MANAGER'],
      status: 'ACTIVE',
      limit: 1000,
      offset: 0,
    });
    return result.items.map((staff) => staff.email);
  }
}
