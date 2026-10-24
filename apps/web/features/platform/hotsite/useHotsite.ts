import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyHotsiteTemplate,
  featureBookingPhoto,
  generateHotsiteImageSignedUrl,
  getChatbotCapStatus,
  getLeadFormConfig,
  getHotsiteConfig,
  listHotsiteTemplates,
  publishHotsite,
  unpublishHotsite,
  updateHotsiteConfig,
  type FeatureBookingPhotoRequest,
  type HotsiteImageSignedUrlRequest,
  type UpdateHotsiteRequest,
} from '@/features/platform/api/tenant-settings';
import type { ApplyHotsiteTemplateRequest, HotsiteTemplateId } from '@ikaro/types';
import { useTenant } from '@/providers/tenant-provider';

export function useHotsiteConfig() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['hotsite', tenantId],
    queryFn: getHotsiteConfig,
  });
}

// The catalogue is platform-owned and only changes with a deploy, so it is fetched once per session.
export function useHotsiteTemplates() {
  return useQuery({
    queryKey: ['hotsite-templates'],
    queryFn: listHotsiteTemplates,
    staleTime: Infinity,
  });
}

// Applying is pure on the server (nothing is saved or published), so there is deliberately no
// invalidation here: the saved ['hotsite', tenantId] config must keep reflecting what is stored.
export function useApplyHotsiteTemplate() {
  return useMutation({
    mutationFn: ({
      templateId,
      body,
    }: {
      readonly templateId: HotsiteTemplateId;
      readonly body: ApplyHotsiteTemplateRequest;
    }) => applyHotsiteTemplate(templateId, body),
  });
}

export function useUpdateHotsiteConfig() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: UpdateHotsiteRequest) => updateHotsiteConfig(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotsite', tenantId] });
      // Cheap and harmless when the request carried no audienceMode/questions — invalidating an
      // unaffected query just marks it stale, refetched on next read. Covers the LEAD_FORM
      // config panel, which reads a separate aggregate this same request can also write to
      // (folded in at M20-S08 — see UpdateHotsiteRequest's own audienceMode/questions fields).
      queryClient.invalidateQueries({ queryKey: ['lead-form-config', tenantId] });
    },
  });
}

export function usePublishHotsite() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: publishHotsite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotsite', tenantId] }),
  });
}

export function useUnpublishHotsite() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: unpublishHotsite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotsite', tenantId] }),
  });
}

export function useGenerateHotsiteImageSignedUrl() {
  return useMutation({
    mutationFn: (body: HotsiteImageSignedUrlRequest) => generateHotsiteImageSignedUrl(body),
  });
}

export function useFeatureBookingPhoto() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: FeatureBookingPhotoRequest) => featureBookingPhoto(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotsite', tenantId] }),
  });
}

// Powers the CHATBOT module config panel's own red banner (UC-027 A5) — the only module panel
// that reads its own data instead of operating purely on draft.layout via props.
export function useChatbotCapStatus() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['chatbot-cap-status', tenantId],
    queryFn: getChatbotCapStatus,
  });
}

export function useLeadFormConfig() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['lead-form-config', tenantId],
    queryFn: getLeadFormConfig,
  });
}
