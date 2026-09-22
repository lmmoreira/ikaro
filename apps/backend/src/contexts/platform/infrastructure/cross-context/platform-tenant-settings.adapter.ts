import { Inject, Injectable } from '@nestjs/common';
import type { TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import type { ITenantSettingsPort } from '../../../../shared/ports/tenant-settings.port';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
} from '../../application/ports/tenant-repository.port';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';

@Injectable()
export class PlatformTenantSettingsAdapter implements ITenantSettingsPort {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  // Deliberately reads the repository directly rather than reusing GetTenantByIdUseCase: that
  // use case's result is shaped for the admin GET /tenants/settings HTTP response, which must
  // never leak an Ikaro-only chatbot override (maxConversationsPerDay, llmProvider, ...) to the
  // client — so it hardcodes `chatbot: { knowledgeText }` only. This port instead feeds
  // RequestContext.settings for every guest/tenant request (via RequestInterceptor), which
  // SendChatMessageUseCase/GetChatbotStatusUseCase/GetChatbotCapStatusUseCase all depend on to
  // resolve real tenant overrides — reusing the stripped-down result here silently discarded
  // every Ikaro-granted override in production (found via M19-S10's own integration test).
  async getSettings(tenantId: string): Promise<TenantSettingsProps> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return { ...tenant.settings.toJSON(), chatbot: tenant.settings.chatbot };
  }
}
