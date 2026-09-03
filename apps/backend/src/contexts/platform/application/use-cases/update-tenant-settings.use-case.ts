import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { deepMerge } from '../../../../shared/utils/deep-merge';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { TenantSettings, TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends object
    ? DeepPartial<NonNullable<T[K]>> | Extract<T[K], null>
    : T[K];
};

export interface UpdateTenantSettingsUseCaseInput {
  tenantId: string;
  settings: DeepPartial<TenantSettingsProps>;
}

export interface UpdateTenantSettingsUseCaseResult {
  tenantId: string;
  name: string;
  settings: TenantSettingsProps;
}

@Injectable()
export class UpdateTenantSettingsUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateTenantSettingsUseCaseInput,
  ): Promise<UpdateTenantSettingsUseCaseResult> {
    const { tenantId, settings } = input;

    return this.txManager.run(async () => {
      // findByIdForUpdate (not findById) — reads the current row under a real Postgres row
      // lock, bypassing CachingTenantRepository's read cache entirely. Serializes against a
      // concurrent read of businessHours mid-transaction (e.g.
      // OpenScheduleUseCase.getBusinessHoursAndLocaleForUpdate, booking context) — closes the
      // TOCTOU race where a resource-scoped opening could be validated against a businessHours
      // value that's about to be superseded by this write. An earlier advisory-lock design here
      // didn't actually close this, since the "fresh" read it guarded still went through the
      // cache regardless of lock ordering (Codex PR #460 round-4/5/7 finding — see
      // docs/13-DATABASE_SCHEMA.md).
      const tenant = await this.tenantRepo.findByIdForUpdate(tenantId);
      if (!tenant) throw new TenantNotFoundError(tenantId);

      const merged = deepMerge(tenant.settings.toJSON(), settings as Partial<TenantSettingsProps>);
      tenant.updateSettings(TenantSettings.create(merged));
      await this.tenantRepo.save(tenant);

      return {
        tenantId: tenant.id,
        name: tenant.name,
        settings: {
          ...tenant.settings.toJSON(),
          // `chatbot` getter — unlike toJSON()'s raw props — always resolves knowledgeText even
          // for a tenant whose stored settings predate M19-S04, and never leaks an Ikaro-only
          // override (maxConversationsPerDay, llmProvider, ...) into the API response (docs/21
          // §7).
          chatbot: { knowledgeText: tenant.settings.chatbot.knowledgeText },
        },
      };
    });
  }
}
