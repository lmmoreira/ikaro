import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationConfigModule } from '../../shared/infrastructure/application-config.module';
import { StorageModule } from '../../shared/infrastructure/storage.module';
import { RequestModule } from '../../shared/request/request.module';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { CHATBOT_MESSAGE_REPOSITORY } from './application/ports/chatbot-message-repository.port';
import { CHATBOT_PROVIDER_BALANCE_REPOSITORY } from './application/ports/chatbot-provider-balance-repository.port';
import { CHATBOT_SESSION_REPOSITORY } from './application/ports/chatbot-session-repository.port';
import { FRONTEND_REVALIDATION_PORT } from './application/ports/frontend-revalidation.port';
import { HOTSITE_CONFIG_REPOSITORY } from './application/ports/hotsite-config-repository.port';
import { LEAD_FORM_CONFIG_REPOSITORY } from './application/ports/lead-form-config-repository.port';
import { LEAD_FORM_SUBMISSION_REPOSITORY } from './application/ports/lead-form-submission-repository.port';
import {
  ANTHROPIC_LLM_PROVIDER,
  FAKE_LLM_PROVIDER,
  ILlmProvider,
  OPENAI_LLM_PROVIDER,
  OPENROUTER_LLM_PROVIDER,
  OPENROUTER_PROVIDER_NAME,
} from './application/ports/llm-provider.port';
import { TENANT_REPOSITORY } from './application/ports/tenant-repository.port';
import {
  LLM_PROVIDER_REGISTRY,
  LlmProviderRegistry,
} from './application/services/llm-provider-registry.service';
import { HotsiteImagePathsService } from './domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from './domain/services/hotsite-image-url-resolver.service';
import { ChatbotBalancePollJob } from './application/jobs/chatbot-balance-poll.job';
import { ChatbotRetentionPurgeJob } from './application/jobs/chatbot-retention-purge.job';
import { LeadFormRetentionPurgeJob } from './application/jobs/lead-form-retention-purge.job';
import { DeleteHotsiteImageUseCase } from './application/use-cases/delete-hotsite-image.use-case';
import { FeatureBookingPhotoUseCase } from './application/use-cases/feature-booking-photo.use-case';
import { GenerateHotsiteImageReadSignedUrlUseCase } from './application/use-cases/generate-hotsite-image-read-signed-url.use-case';
import { GenerateHotsiteImageSignedUrlUseCase } from './application/use-cases/generate-hotsite-image-signed-url.use-case';
import { GetChatbotCapStatusUseCase } from './application/use-cases/get-chatbot-cap-status.use-case';
import { GetChatbotStatusUseCase } from './application/use-cases/get-chatbot-status.use-case';
import { GetHotsiteContentUseCase } from './application/use-cases/get-hotsite-content.use-case';
import { GetHotsiteManifestUseCase } from './application/use-cases/get-hotsite-manifest.use-case';
import { CreateLeadFormSubmissionUseCase } from './application/use-cases/create-lead-form-submission.use-case';
import { GetLeadFormConfigUseCase } from './application/use-cases/get-lead-form-config.use-case';
import { GetLeadFormStatusUseCase } from './application/use-cases/get-lead-form-status.use-case';
import { UpdateLeadFormModuleUseCase } from './application/use-cases/update-lead-form-module.use-case';
import { GetTenantByIdUseCase } from './application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from './application/use-cases/get-tenant-by-slug.use-case';
import { GetTenantsUseCase } from './application/use-cases/get-tenants.use-case';
import { ListPublishedHotsitesUseCase } from './application/use-cases/list-published-hotsites.use-case';
import { ProvisionTenantUseCase } from './application/use-cases/provision-tenant.use-case';
import { PublishHotsiteUseCase } from './application/use-cases/publish-hotsite.use-case';
import { RenameTenantUseCase } from './application/use-cases/rename-tenant.use-case';
import { SendChatMessageUseCase } from './application/use-cases/send-chat-message.use-case';
import { UnpublishHotsiteUseCase } from './application/use-cases/unpublish-hotsite.use-case';
import { UpdateHotsiteContentUseCase } from './application/use-cases/update-hotsite-content.use-case';
import { UpdateTenantSettingsUseCase } from './application/use-cases/update-tenant-settings.use-case';
import { ChatbotMessageEntity } from './infrastructure/entities/chatbot-message.entity';
import { ChatbotProviderBalanceEntity } from './infrastructure/entities/chatbot-provider-balance.entity';
import { ChatbotSessionEntity } from './infrastructure/entities/chatbot-session.entity';
import { HotsiteConfigEntity } from './infrastructure/entities/hotsite-config.entity';
import { LeadFormConfigEntity } from './infrastructure/entities/lead-form-config.entity';
import { LeadFormSubmissionEntity } from './infrastructure/entities/lead-form-submission.entity';
import { TenantEntity } from './infrastructure/entities/tenant.entity';
import { FrontendRevalidationAdapter } from './infrastructure/adapters/frontend-revalidation.adapter';
import { PlatformTenantSettingsAdapter } from './infrastructure/cross-context/platform-tenant-settings.adapter';
import { AnthropicLlmAdapter } from './infrastructure/llm/anthropic-llm.adapter';
import { FakeLlmAdapter } from './infrastructure/llm/fake-llm.adapter';
import { OpenAiLlmAdapter } from './infrastructure/llm/openai-llm.adapter';
import { OpenRouterCreditsClient } from './infrastructure/llm/openrouter-credits.client';
import { OpenRouterLlmAdapter } from './infrastructure/llm/openrouter-llm.adapter';
import { HotsiteContentReader } from './application/services/hotsite-content-reader.service';
import { HotsiteImagePromotionService } from './application/services/hotsite-image-promotion.service';
import { ChatbotController } from './infrastructure/controllers/chatbot.controller';
import { CronChatbotController } from './infrastructure/controllers/cron-chatbot.controller';
import { CronLeadFormController } from './infrastructure/controllers/cron-lead-form.controller';
import { ChatbotBalancePollTriggerHandler } from './infrastructure/events/chatbot-balance-poll-trigger.handler';
import { ChatbotRetentionPurgeTriggerHandler } from './infrastructure/events/chatbot-retention-purge-trigger.handler';
import { LeadFormRetentionPurgeTriggerHandler } from './infrastructure/events/lead-form-retention-purge-trigger.handler';
import { HotsiteAdminController } from './infrastructure/controllers/hotsite-admin.controller';
import { HotsiteController } from './infrastructure/controllers/hotsite.controller';
import { LeadFormController } from './infrastructure/controllers/lead-form.controller';
import { InternalTenantController } from './infrastructure/controllers/internal-tenant.controller';
import { InternalTenantReadController } from './infrastructure/controllers/internal-tenant-read.controller';
import { TenantController } from './infrastructure/controllers/tenant.controller';
import { TenantSettingsController } from './infrastructure/controllers/tenant-settings.controller';
import { CachingTenantRepository } from './infrastructure/repositories/caching-tenant.repository';
import { TypeOrmChatbotMessageRepository } from './infrastructure/repositories/typeorm-chatbot-message.repository';
import { TypeOrmChatbotProviderBalanceRepository } from './infrastructure/repositories/typeorm-chatbot-provider-balance.repository';
import { TypeOrmChatbotSessionRepository } from './infrastructure/repositories/typeorm-chatbot-session.repository';
import { TypeOrmHotsiteConfigRepository } from './infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmLeadFormConfigRepository } from './infrastructure/repositories/typeorm-lead-form-config.repository';
import { TypeOrmLeadFormSubmissionRepository } from './infrastructure/repositories/typeorm-lead-form-submission.repository';
import { TypeOrmTenantRepository } from './infrastructure/repositories/typeorm-tenant.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      HotsiteConfigEntity,
      LeadFormConfigEntity,
      ChatbotSessionEntity,
      ChatbotMessageEntity,
      ChatbotProviderBalanceEntity,
      LeadFormSubmissionEntity,
    ]),
    ApplicationConfigModule,
    RequestModule,
    StorageModule,
    SharedCacheModule,
  ],
  controllers: [
    ChatbotController,
    CronChatbotController,
    CronLeadFormController,
    HotsiteAdminController,
    HotsiteController,
    LeadFormController,
    InternalTenantController,
    InternalTenantReadController,
    TenantController,
    TenantSettingsController,
  ],
  providers: [
    TypeOrmTenantRepository,
    CachingTenantRepository,
    { provide: TENANT_REPOSITORY, useClass: CachingTenantRepository },
    { provide: HOTSITE_CONFIG_REPOSITORY, useClass: TypeOrmHotsiteConfigRepository },
    { provide: LEAD_FORM_CONFIG_REPOSITORY, useClass: TypeOrmLeadFormConfigRepository },
    { provide: CHATBOT_SESSION_REPOSITORY, useClass: TypeOrmChatbotSessionRepository },
    { provide: CHATBOT_MESSAGE_REPOSITORY, useClass: TypeOrmChatbotMessageRepository },
    {
      provide: CHATBOT_PROVIDER_BALANCE_REPOSITORY,
      useClass: TypeOrmChatbotProviderBalanceRepository,
    },
    { provide: LEAD_FORM_SUBMISSION_REPOSITORY, useClass: TypeOrmLeadFormSubmissionRepository },
    { provide: TENANT_SETTINGS_PORT, useClass: PlatformTenantSettingsAdapter },
    { provide: OPENROUTER_LLM_PROVIDER, useClass: OpenRouterLlmAdapter },
    { provide: ANTHROPIC_LLM_PROVIDER, useClass: AnthropicLlmAdapter },
    { provide: OPENAI_LLM_PROVIDER, useClass: OpenAiLlmAdapter },
    { provide: FAKE_LLM_PROVIDER, useClass: FakeLlmAdapter },
    {
      provide: LLM_PROVIDER_REGISTRY,
      useFactory: (
        config: ConfigService,
        openRouterProvider: ILlmProvider,
        anthropicProvider: ILlmProvider,
        openAiProvider: ILlmProvider,
        fakeProvider: ILlmProvider,
      ) =>
        new LlmProviderRegistry(
          config.get<string>('CHATBOT_LLM_PROVIDER', OPENROUTER_PROVIDER_NAME),
          openRouterProvider,
          anthropicProvider,
          openAiProvider,
          fakeProvider,
        ),
      inject: [
        ConfigService,
        OPENROUTER_LLM_PROVIDER,
        ANTHROPIC_LLM_PROVIDER,
        OPENAI_LLM_PROVIDER,
        FAKE_LLM_PROVIDER,
      ],
    },
    HotsiteContentReader,
    { provide: FRONTEND_REVALIDATION_PORT, useClass: FrontendRevalidationAdapter },
    HotsiteImagePathsService,
    HotsiteImagePromotionService,
    HotsiteImageUrlResolver,
    DeleteHotsiteImageUseCase,
    FeatureBookingPhotoUseCase,
    GenerateHotsiteImageReadSignedUrlUseCase,
    GenerateHotsiteImageSignedUrlUseCase,
    ChatbotBalancePollJob,
    ChatbotBalancePollTriggerHandler,
    OpenRouterCreditsClient,
    ChatbotRetentionPurgeJob,
    ChatbotRetentionPurgeTriggerHandler,
    LeadFormRetentionPurgeJob,
    LeadFormRetentionPurgeTriggerHandler,
    CreateLeadFormSubmissionUseCase,
    GetChatbotCapStatusUseCase,
    GetChatbotStatusUseCase,
    GetHotsiteContentUseCase,
    GetHotsiteManifestUseCase,
    GetLeadFormConfigUseCase,
    GetLeadFormStatusUseCase,
    UpdateLeadFormModuleUseCase,
    GetTenantByIdUseCase,
    GetTenantBySlugUseCase,
    GetTenantsUseCase,
    ListPublishedHotsitesUseCase,
    ProvisionTenantUseCase,
    PublishHotsiteUseCase,
    RenameTenantUseCase,
    SendChatMessageUseCase,
    UnpublishHotsiteUseCase,
    UpdateHotsiteContentUseCase,
    UpdateTenantSettingsUseCase,
  ],
  exports: [GetTenantByIdUseCase, GetTenantsUseCase, TENANT_SETTINGS_PORT],
})
export class PlatformModule {}
