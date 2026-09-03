import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../../../../shared/ports/tenant-lock.port';
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
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateTenantSettingsUseCaseInput,
  ): Promise<UpdateTenantSettingsUseCaseResult> {
    const { tenantId, settings } = input;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    const merged = deepMerge(tenant.settings.toJSON(), settings as Partial<TenantSettingsProps>);
    tenant.updateSettings(TenantSettings.create(merged));

    await this.txManager.run(async () => {
      // Serializes against a concurrent read of businessHours under the same lock (e.g.
      // OpenScheduleUseCase in the booking context) — closes the TOCTOU race where a
      // resource-scoped opening could be validated against a businessHours snapshot that's
      // about to be superseded by this write (Codex PR #460 round-4/5 finding, closed in
      // round 7 rather than left as accepted risk — see docs/13-DATABASE_SCHEMA.md).
      await this.tenantLock.lockTenantSettings(tenantId);
      await this.tenantRepo.save(tenant);
    });

    return {
      tenantId: tenant.id,
      name: tenant.name,
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
