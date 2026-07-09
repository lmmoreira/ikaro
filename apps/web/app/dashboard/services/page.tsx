import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchStaffServices } from '@/features/booking/services/api.server';
import { ServiceListPage } from '@/features/booking/components/dashboard/services/ServiceListPage';
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
