import {
  fetchCustomerFeatures,
  fetchCustomerTenantOperational,
} from '@/shared/lib/billing/access.server';
import { CustomerTenantAccessProvider } from './customer-tenant-access-context';

interface CustomerTenantAccessScopeProps {
  readonly token: string;
  readonly children: React.ReactNode;
}

// The tenant's state for one account page, read in that page's own server render. The account
// layout also provides it (for the topbar and the navs), but a layout is kept across client
// navigation between the account's pages and is not re-rendered, so the state a page's actions
// depend on (reschedule, "+ Novo", the "Empresa inativa" notice) is read here, on every navigation:
// a tenant suspended or reactivated mid-session shows on the next page, not on the next full load.
// Both reads are request-cached, so the layout and the page share one `GET /billing/access`; an
// unreadable answer fails open, as in the layout.
export async function CustomerTenantAccessScope({
  token,
  children,
}: CustomerTenantAccessScopeProps): Promise<React.JSX.Element> {
  const [operational, entitledFeatures] = await Promise.all([
    fetchCustomerTenantOperational(token),
    fetchCustomerFeatures(token),
  ]);

  return (
    <CustomerTenantAccessProvider
      operational={operational !== false}
      entitledFeatures={entitledFeatures}
    >
      {children}
    </CustomerTenantAccessProvider>
  );
}
