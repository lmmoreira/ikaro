'use client';

import { useMemo } from 'react';
import type { ResourceResponse } from '@ikaro/types';
import { useResources } from '@/features/booking/hooks/useResources';

interface UseSelectableResourcesResult {
  readonly resources: readonly ResourceResponse[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: unknown;
}

// Shared by ResourceFilterMenu (the page-level view filter) and ResourceSelectField (the
// per-action picker inside ClosureFormSheet/OpeningFormSheet) — both need the same tenant's
// active, non-LOCATION resources. Excludes LOCATION: the tenant-wide default already represents
// that scope, so listing it separately would be a redundant, confusing duplicate option.
export function useSelectableResources(): UseSelectableResourcesResult {
  const { data, isLoading, isError, error } = useResources({ isActive: true });
  const resources = useMemo(
    () => (data?.items ?? []).filter((resource) => resource.type !== 'LOCATION'),
    [data],
  );

  return { resources, isLoading, isError, error };
}
