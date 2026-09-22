import { ResourceStaffOptionsResponse } from '@ikaro/types';
import { StaffItem } from '../staff/staff.types';
import { ResourceResponse } from './resource.types';

// Merges Staff + Resource reads server-side so apps/web never has to orchestrate two BFF calls
// and merge them itself — the BFF owns multi-read composition, not the browser
// (docs/24-BFF_ARCHITECTURE.md § Web-facing composite views).
export function toResourceStaffOptionsResponse(
  staffItems: readonly StaffItem[],
  staffResources: readonly ResourceResponse[],
  excludeResourceId: string | undefined,
): ResourceStaffOptionsResponse {
  const wrappedStaffIds = new Set(
    staffResources
      .filter((resource) => resource.id !== excludeResourceId)
      .map((resource) => resource.refId)
      .filter((refId): refId is string => refId !== null),
  );

  return {
    items: staffItems.map((staff) => ({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      isActive: staff.isActive,
      isWrapped: wrappedStaffIds.has(staff.id),
    })),
  };
}
