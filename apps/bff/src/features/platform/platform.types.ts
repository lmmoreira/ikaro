import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  TenantSettings,
} from '@ikaro/types';
import { TenantInfoResponse } from '../../shared/types/backend-responses';

export type BackendHotsiteManifestResponse = HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  booking: HotsiteBookingSettingsResponse;
};

// GET /internal/tenants/:tenantId's real shape (GetTenantByIdUseCaseResult) — no guard, already
// used from a @Public() route (getManifest's by-slug sibling call). chatbot-context.ts reuses the
// same route to read settings.businessInfo/businessHours/chatbot.knowledgeText for a guest visitor.
export type BackendTenantByIdResponse = TenantInfoResponse & { settings: TenantSettings };

// Outbound payload the BFF sends to the backend's chatbot endpoint — not a client-facing
// request nor response shape, but still can't live inline in platform.public.controller.ts.
export interface BackendSendChatMessageBody {
  sessionId?: string;
  systemPrompt: string;
  message: string;
  clientIp: string;
}
