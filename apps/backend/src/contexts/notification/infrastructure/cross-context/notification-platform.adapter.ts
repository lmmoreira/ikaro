import { Inject, Injectable } from '@nestjs/common';
import { countrySpec } from '@ikaro/i18n';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../shared/ports/application-config.port';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import {
  INotificationPlatformPort,
  NotificationTenantInfo,
} from '../../application/ports/notification-platform.port';

@Injectable()
export class NotificationPlatformAdapter implements INotificationPlatformPort {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
  ) {}

  async getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null> {
    // Read outside the try: a missing FRONTEND_URL is a deployment error, not "tenant not found".
    const frontendUrl = this.config.getOrThrow('FRONTEND_URL');
    try {
      const result = await this.getTenantById.execute({ tenantId });
      const spec = countrySpec(result.settings.localization.countryCode);
      return {
        id: result.id,
        name: result.name,
        slug: result.slug,
        hotsiteUrl: `${frontendUrl}/${encodeURIComponent(result.slug)}`,
        timezone: result.settings.businessHours.timezone,
        locale: result.settings.localization.language,
        replyToEmail: result.settings.businessInfo?.email ?? null,
        dateFormat: spec.dateFormat,
        timeFormat: spec.timeFormat,
      };
    } catch {
      return null;
    }
  }
}
