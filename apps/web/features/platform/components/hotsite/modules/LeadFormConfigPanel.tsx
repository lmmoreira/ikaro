'use client';

import { useTranslations } from 'next-intl';

// Minimal placeholder, not the real config panel — M20-S07 only registers the LEAD_FORM module
// type (title/subtitle/eyebrow/ctaLabel/variant/backgroundImageUrl/backgroundImagePosition/
// bgStyle field editing is M20-S08's scope). Still required in the same commit as the module type:
// MODULE_CONFIG_PANELS (hotsite-editor-lazy-panels.tsx) is a non-partial
// Record<HotsiteModuleType, ...> by design, so every module type needs a real entry here the
// moment it's added to HotsiteModuleType, or the app fails to compile. M20-S08 replaces this
// file's body with the real field-editing form.
export function LeadFormConfigPanel(): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.leadForm');

  return (
    <div
      className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4"
      data-testid="lead-form-config-panel-placeholder"
    >
      <p className="text-sm font-semibold text-gray-900">{t('comingSoonTitle')}</p>
      <p className="mt-1 text-sm text-gray-600">{t('comingSoonBody')}</p>
    </div>
  );
}
