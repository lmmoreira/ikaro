import { Injectable } from '@nestjs/common';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  INotificationPlatformPort,
  NotificationTenantInfo,
} from '../../application/ports/notification-platform.port';

@Injectable()
export class NotificationPlatformAdapter implements INotificationPlatformPort {
  constructor(private readonly getTenantById: GetTenantByIdUseCase) {}

  async getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null> {
    try {
      const result = await this.getTenantById.execute(tenantId);
      return {
        id: result.id,
        name: result.name,
        slug: result.slug,
        timezone: result.settings.businessHours.timezone,
        locale: result.settings.localization.language,
        fromEmail: result.settings.notification?.fromEmail ?? null,
      };
    } catch {
      return null;
    }
  }
}
