import { cookies } from 'next/headers';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { SwitchTenantClient } from '@/components/customer/SwitchTenantClient';

export default async function SwitchTenantPage(): Promise<React.JSX.Element> {
  const token = (await cookies()).get('access_token')?.value;
  const { tenantSlug } = token ? decodeJwtPayload(token) : {};

  return <SwitchTenantClient currentTenantSlug={tenantSlug ?? null} />;
}
