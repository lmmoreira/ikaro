import { Injectable } from '@nestjs/common';
import { StaffQueryService } from '../../../staff/application/services/staff-query.service';
import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import {
  INotificationStaffPort,
  NotificationStaffInfo,
} from '../../application/ports/notification-staff.port';

@Injectable()
export class StaffInfoAdapter implements INotificationStaffPort {
  constructor(
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly staffQueryService: StaffQueryService,
  ) {}

  async getStaffInfo(staffId: string, tenantId: string): Promise<NotificationStaffInfo | null> {
    try {
      const result = await this.getStaffById.execute(staffId, tenantId);
      return { id: result.id, email: result.email, name: result.name };
    } catch {
      return null;
    }
  }

  async getManagerEmails(tenantId: string): Promise<string[]> {
    return this.staffQueryService.findManagersByTenant(tenantId);
  }
}
