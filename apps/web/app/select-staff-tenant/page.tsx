import type { StaffTenantOption } from '@ikaro/types';
import { getAccessToken } from '@/lib/auth/get-access-token';
import { bffServerFetch } from '@/lib/api/bff-server';
import { SelectStaffTenantClient } from '@/components/staff/SelectStaffTenantClient';

export default async function SelectStaffTenantPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();

  let initialOptions: StaffTenantOption[] | null = null;

  if (token) {
    try {
      const res = await bffServerFetch(token, '/auth/staff-tenants');
      if (res.ok) initialOptions = (await res.json()) as StaffTenantOption[];
    } catch {
      // initialOptions stays null → client renders the error state
    }
  }

  return <SelectStaffTenantClient initialOptions={initialOptions} />;
}
