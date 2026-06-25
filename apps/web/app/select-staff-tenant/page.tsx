import { cookies } from 'next/headers';
import type { StaffTenantOption } from '@ikaro/types';
import { SelectStaffTenantClient } from '@/components/auth/SelectStaffTenantClient';

export default async function SelectStaffTenantPage(): Promise<React.JSX.Element> {
  const token = (await cookies()).get('access_token')?.value;

  let initialOptions: StaffTenantOption[] | null = null;

  if (token) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/staff-tenants`, {
        headers: { Cookie: `access_token=${token}` },
        cache: 'no-store',
      });
      if (res.ok) initialOptions = (await res.json()) as StaffTenantOption[];
    } catch {
      // initialOptions stays null → client renders the error state
    }
  }

  return <SelectStaffTenantClient initialOptions={initialOptions} />;
}
