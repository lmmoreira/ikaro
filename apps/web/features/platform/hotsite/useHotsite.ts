import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  featureBookingPhoto,
  generateHotsiteImageSignedUrl,
  getHotsiteConfig,
  publishHotsite,
  unpublishHotsite,
  updateHotsiteConfig,
  type FeatureBookingPhotoRequest,
  type HotsiteImageSignedUrlRequest,
  type UpdateHotsiteRequest,
} from '@/features/platform/tenant-settings';
import { useTenant } from '@/providers/tenant-provider';

export function useHotsiteConfig() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['hotsite', tenantId],
    queryFn: getHotsiteConfig,
  });
}

export function useUpdateHotsiteConfig() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: UpdateHotsiteRequest) => updateHotsiteConfig(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotsite', tenantId] }),
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
