import {
  HotsiteServiceListResponse,
  HotsiteServiceResponse,
  TenantBusinessHours,
  TenantBusinessInfo,
} from '@ikaro/types';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { BackendTenantByIdResponse } from './platform.types';

export interface ChatbotBusinessContext {
  businessInfo: TenantBusinessInfo | undefined;
  businessHours: TenantBusinessHours;
  locale: string;
}

// Same call `SERVICE_LIST`/`ServicesPublicController` already makes — no new cross-context
// machinery (docs/discovery/CHATBOT/CHATBOT.md §6).
export async function getServicesContext(
  backendHttp: BackendHttpService,
  tenantId: string,
): Promise<HotsiteServiceResponse[]> {
  const { items } = await backendHttp.getForPublic<HotsiteServiceListResponse>(
    '/services',
    tenantId,
  );
  return items;
}

// `/internal/tenants/:tenantId` (InternalTenantReadController) — no role guard, already called
// from a @Public() route (platform.public.controller.ts's getManifest, via its by-slug sibling).
// GetTenantByIdUseCase resolves it through CachingTenantRepository, not a fresh raw query.
// Bundles `locale` (settings.localization.language) too, from the same payload — buildSystemPrompt
// needs it and there's no separate "get locale" tool-shaped function named in the story.
export async function getBusinessInfoContext(
  backendHttp: BackendHttpService,
  tenantId: string,
): Promise<ChatbotBusinessContext> {
  const tenant = await backendHttp.get<BackendTenantByIdResponse>(`/internal/tenants/${tenantId}`);
  return {
    businessInfo: tenant.settings.businessInfo,
    businessHours: tenant.settings.businessHours,
    locale: tenant.locale,
  };
}

// Same `/internal/tenants/:tenantId` route as getBusinessInfoContext — a separate call (not a
// shared fetch) to keep each function's signature tool-shaped and independently invokable, per
// CHATBOT.md §6; the extra round trip is cheap and absorbed by CachingTenantRepository's cache.
export async function getKnowledgeTextContext(
  backendHttp: BackendHttpService,
  tenantId: string,
): Promise<string> {
  const tenant = await backendHttp.get<BackendTenantByIdResponse>(`/internal/tenants/${tenantId}`);
  return tenant.settings.chatbot.knowledgeText;
}
