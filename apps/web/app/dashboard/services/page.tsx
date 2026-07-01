import { getAccessToken } from '@/lib/auth/get-access-token';
import { fetchStaffServices } from '@/lib/api/dashboard/services';
import { ServiceListPage } from '@/components/dashboard/services/ServiceListPage';
import type { StaffServiceListResponse } from '@ikaro/types';

interface ServicesPageProps {
  readonly searchParams: Promise<{ created?: string }>;
}

export default async function ServicesPage({
  searchParams,
}: ServicesPageProps): Promise<React.JSX.Element> {
  const { created } = await searchParams;
  const token = await getAccessToken();
  let services: StaffServiceListResponse['items'] = [];

  try {
    services = (await fetchStaffServices(token)).items;
  } catch {
    services = [];
  }

  return <ServiceListPage services={services} showCreatedBanner={created === '1'} />;
}
