import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchTenantSettingsFresh } from '@/features/platform/api/tenant-settings.server';
import { LockedFeatureCard } from '@/features/billing/components/LockedFeatureCard';
import { SettingsForm } from '@/features/platform/components/settings/SettingsForm';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import { lockedFeaturesOf } from '@/shared/lib/billing/tenant-access';

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  // The layout already read the access answer in this render, so this shares that call. A failed
  // read fails open: the Chatbot section renders as before billing.
  const [settings, access] = await Promise.all([
    fetchTenantSettingsFresh(token),
    fetchTenantAccess(token),
  ]);
  const chatbotLocked = access.ok && lockedFeaturesOf(access.access).includes('CHATBOT');

  return (
    <SettingsForm
      initial={settings}
      lockedChatbotSection={
        chatbotLocked ? <LockedFeatureCard feature="CHATBOT" variant="section" /> : undefined
      }
    />
  );
}
