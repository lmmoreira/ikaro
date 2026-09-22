'use client';

import { useQuery } from '@tanstack/react-query';
import type { TenantSettingsResponse } from '@ikaro/types';
import { getTenantSettings } from '@/features/platform/api/tenant-settings';
import { useTenant } from '@/providers/tenant-provider';

export function useTenantSettings() {
  const { tenantId } = useTenant();
  return useQuery<TenantSettingsResponse>({
    queryKey: ['tenant-settings', tenantId],
    queryFn: () => getTenantSettings(),
  });
}
