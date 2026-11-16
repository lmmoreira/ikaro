import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchHotsiteConfig } from '@/features/platform/api/tenant-settings.server';
import { LockedFeatureCard } from '@/features/billing/components/LockedFeatureCard';
import { HotsiteEditor } from '@/features/platform/components/hotsite/HotsiteEditor';
import {
  LockedModulePanelsProvider,
  type LockedModulePanels,
} from '@/features/platform/components/hotsite/locked-module-panels-context';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import { lockedHotsiteModules } from '@/shared/lib/billing/locked-modules';
import { lockedFeaturesOf } from '@/shared/lib/billing/tenant-access';

export default async function HotsitePage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  // The layout already read the access answer in this render, so this shares that call. A failed
  // read fails open: every module panel renders as before billing.
  const [initial, access] = await Promise.all([
    fetchHotsiteConfig(token),
    fetchTenantAccess(token),
  ]);
  const lockedModules = access.ok ? lockedHotsiteModules(lockedFeaturesOf(access.access)) : {};
  const lockedModulePanels: LockedModulePanels = Object.fromEntries(
    Object.entries(lockedModules).map(([type, feature]) => [
      type,
      <LockedFeatureCard key={type} feature={feature} variant="section" />,
    ]),
  );

  return (
    <LockedModulePanelsProvider value={lockedModulePanels}>
      <HotsiteEditor initial={initial} />
    </LockedModulePanelsProvider>
  );
}
