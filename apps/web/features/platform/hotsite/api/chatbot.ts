import type { HotsiteChatbotMessageResponse, HotsiteChatbotStatusResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// Client-only — ChatbotWidget.tsx's mount-time pre-flight check and message send, both live,
// guest-facing calls that can never be server-rendered/cached (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md
// § CHATBOT). Same pattern as fetchServicesClient() (../api/services.ts): bffClient's /v1 baseURL
// is proxied by the existing generic same-origin gateway (apps/web/app/v1/[...path]/route.ts)
// straight through to the BFF, whose setGlobalPrefix('v1') makes /public/platform/chatbot/* live
// at /v1/public/platform/chatbot/*.
export async function fetchChatbotStatusClient(
  slug: string,
): Promise<HotsiteChatbotStatusResponse> {
  const res = await bffClient.get<HotsiteChatbotStatusResponse>('/public/platform/chatbot/status', {
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data;
}

export async function sendChatbotMessageClient(
  slug: string,
  body: { sessionId?: string; message: string },
): Promise<HotsiteChatbotMessageResponse> {
  const res = await bffClient.post<HotsiteChatbotMessageResponse>(
    '/public/platform/chatbot/messages',
    body,
    { headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}
