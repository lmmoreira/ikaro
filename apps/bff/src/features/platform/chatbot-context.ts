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
  knowledgeText: string;
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
// One call for everything Platform-side buildSystemPrompt needs (businessInfo, businessHours,
// locale, knowledgeText) — merged from two separate calls after PR #373 review (Codex) flagged
// the duplicate round trip: business info and knowledge text used to each independently re-fetch
// the identical /internal/tenants/:tenantId payload.
export async function getBusinessContext(
  backendHttp: BackendHttpService,
  tenantId: string,
): Promise<ChatbotBusinessContext> {
  const tenant = await backendHttp.get<BackendTenantByIdResponse>(`/internal/tenants/${tenantId}`);
  return {
    businessInfo: tenant.settings.businessInfo,
    businessHours: tenant.settings.businessHours,
    locale: tenant.locale,
    knowledgeText: tenant.settings.chatbot.knowledgeText,
  };
}
