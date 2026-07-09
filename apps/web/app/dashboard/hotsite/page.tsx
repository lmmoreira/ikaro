import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchHotsiteConfig } from '@/features/platform/tenant-settings.server';
import { HotsiteEditor } from '@/features/platform/components/hotsite/HotsiteEditor';

export default async function HotsitePage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const initial = await fetchHotsiteConfig(token);

  return <HotsiteEditor initial={initial} />;
}
