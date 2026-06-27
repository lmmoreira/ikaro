import { cookies } from 'next/headers';
import type { StaffTenantOption } from '@ikaro/types';
import { bffServerFetch } from '@/lib/api/bff-server';
import { SelectStaffTenantClient } from '@/components/staff/SelectStaffTenantClient';

export default async function SelectStaffTenantPage(): Promise<React.JSX.Element> {
  const token = (await cookies()).get('access_token')?.value;

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
