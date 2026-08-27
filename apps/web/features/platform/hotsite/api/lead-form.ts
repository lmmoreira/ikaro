import type { HotsiteLeadFormAnswerRequest, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// Client-only — LeadFormWidget.tsx's question-catalog fetch, a live, guest-facing read that
// needs no identity (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md § LEAD_FORM). Same pattern as
// fetchChatbotStatusClient() (./chatbot.ts): bffClient's /v1 baseURL is proxied by the existing
// generic same-origin gateway straight through to the BFF, whose setGlobalPrefix('v1') makes
// /public/platform/lead-form/* live at /v1/public/platform/lead-form/*.
export async function fetchLeadFormConfigClient(
  slug: string,
): Promise<HotsiteLeadFormConfigResponse> {
  const res = await bffClient.get<HotsiteLeadFormConfigResponse>(
    `/public/platform/lead-form/${encodeURIComponent(slug)}`,
    { headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}

export interface SubmitLeadFormClientBody {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly answers: readonly HotsiteLeadFormAnswerRequest[];
  readonly turnstileToken: string;
}

export type SubmitLeadFormResult =
  | { readonly ok: true; readonly submissionId: string }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code?: string;
      readonly field?: string;
    };

// Calls this app's own /api/platform/lead-form/submissions Route Handler (same-origin, not the
// BFF directly) — that route reads the session cookie server-side and forwards it as
// Authorization: Bearer for a logged-in customer, mirroring createCustomerAttachmentSignedUrl()'s
// exact reasoning in booking/api/customer.ts (TD31 Story 7 pattern). A raw fetch() here (rather
// than bffClient) is the reviewed exception registered in architecture-policy.json for this file.
// Never rejects — a network failure resolves to { ok: false, status: 0 } so callers don't need
// a separate try/catch.
export async function submitLeadFormClient(
  slug: string,
  body: SubmitLeadFormClientBody,
): Promise<SubmitLeadFormResult> {
  try {
    const res = await fetch(
      `/api/platform/lead-form/submissions?slug=${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      submissionId?: string;
      code?: string;
      field?: string;
    };
    if (res.ok && json.submissionId) {
      return { ok: true, submissionId: json.submissionId };
    }
    return { ok: false, status: res.status, code: json.code, field: json.field };
  } catch {
    return { ok: false, status: 0 };
  }
}
