import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  INotificationTenantPort,
  NotificationTenantInfo,
} from '../../application/ports/notification-tenant.port';

@Injectable()
export class TenantInfoAdapter implements INotificationTenantPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null> {
    try {
      const result = await this.getTenantById.execute(tenantId);
      return {
        id: result.id,
        name: result.name,
        slug: result.slug,
        timezone: result.settings.business_hours.timezone,
        fromEmail: result.settings.notification?.from_email ?? null,
      };
    } catch {
      return null;
    }
  }
}
