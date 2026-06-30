import { getAccessToken } from '@/lib/auth/get-access-token';
import { fetchStaffServices } from '@/lib/api/dashboard/services';
import { ServiceListPage } from '@/components/dashboard/services/ServiceListPage';
import type { StaffServiceListResponse } from '@ikaro/types';

export default async function ServicesPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  let services: StaffServiceListResponse['items'] = [];

  try {
    services = (await fetchStaffServices(token)).items;
  } catch {
    services = [];
  }

  return <ServiceListPage services={services} />;
}
