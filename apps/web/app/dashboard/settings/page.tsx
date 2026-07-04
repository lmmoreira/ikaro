import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchTenantSettingsFresh } from '@/features/platform/tenant-settings';
import { SettingsForm } from '@/features/platform/components/settings/SettingsForm';

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const settings = await fetchTenantSettingsFresh(token);

  return <SettingsForm initial={settings} />;
}
