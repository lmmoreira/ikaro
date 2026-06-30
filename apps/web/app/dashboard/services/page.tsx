import { getAccessToken } from '@/lib/auth/get-access-token';
import { fetchStaffServices } from '@/lib/api/dashboard/services';
import { ServiceListPage } from '@/components/dashboard/services/ServiceListPage';

export default async function ServicesPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const services = await fetchStaffServices(token);

  return <ServiceListPage services={services.items} />;
}
