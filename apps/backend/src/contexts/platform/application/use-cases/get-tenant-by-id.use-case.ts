import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';

export interface GetTenantByIdUseCaseInput {
  tenantId: string;
}

export interface GetTenantByIdUseCaseResult {
  id: string;
  slug: string;
  name: string;
  locale: string;
  settings: TenantSettingsProps;
}

@Injectable()
export class GetTenantByIdUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(input: GetTenantByIdUseCaseInput): Promise<GetTenantByIdUseCaseResult> {
    const { tenantId } = input;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return {
      id: tenant.id,
      slug: tenant.slug.value,
      name: tenant.name,
      locale: tenant.settings.localization.language,
      settings: {
        ...tenant.settings.toJSON(),
        // `chatbot` getter — unlike toJSON()'s raw props — always resolves knowledgeText even for
        // a tenant whose stored settings predate M19-S04, and never leaks an Ikaro-only override
        // (maxConversationsPerDay, llmProvider, ...) into the API response (docs/21 §7).
        chatbot: { knowledgeText: tenant.settings.chatbot.knowledgeText },
      },
    };
  }
}
