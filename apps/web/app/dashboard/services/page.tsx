import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchStaffServices } from '@/features/booking/api/services.server';
import { ServiceListPage } from '@/features/booking/components/dashboard/services/ServiceListPage';
import type { StaffServiceListResponse } from '@ikaro/types';

export default async function ServicesPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  let services: StaffServiceListResponse['items'] = [];
  let loadFailed = false;

  try {
    services = (await fetchStaffServices(token)).items;
  } catch {
    loadFailed = true;
  }

  return <ServiceListPage services={services} loadFailed={loadFailed} />;
}
