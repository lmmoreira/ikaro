import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  TenantSettings,
} from '@ikaro/types';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { SubmitLeadFormBody } from './platform.public.schemas';

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

// Outbound payload the BFF sends to the backend's lead-form submission endpoint (M20-S05) — same
// "not a client-facing shape, still can't live inline" reasoning as BackendSendChatMessageBody
// above. customerId/ipAddress are BFF-computed (decoded JWT / trusted client IP), never part of
// the public request body (SubmitLeadFormBody). turnstileToken passes through unchanged — M20-S14
// moved verification itself to the backend, the BFF no longer checks it.
export interface BackendSubmitLeadFormBody {
  name: string;
  email: string;
  phone: string;
  answers: SubmitLeadFormBody['answers'];
  customerId: string | null;
  ipAddress: string;
  turnstileToken: string;
}
