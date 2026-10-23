'use client';

import { useTranslations } from 'next-intl';
import type { ModuleConfigPanelProps } from './module-config-panel.types';

// Stand-in for the NAVIGATION and CONTENT_BLOCK panels until TD56 Story 5 builds the real ones.
// MODULE_CONFIG_PANELS is a non-partial Record<HotsiteModuleType, …> so that a missing panel fails
// `tsc`, which means the two new module types need an entry the moment they join the union.
// Until Story 5, materializeLayout() does not append these types, so a manager only reaches this
// panel when a manifest that already carries one was applied from the Manifesto tab.
export function PlaceholderConfigPanel(_props: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.placeholder');
  return (
    <p data-testid="placeholder-config-panel" className="text-sm text-gray-600">
      {t('description')}
    </p>
  );
}
