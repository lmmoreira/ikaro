'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import {
  parseManifestJson,
  type ManifestDraft,
  type ManifestParseErrorReason,
} from '@/features/platform/hotsite/manifest-schema';

interface ManifestTabProps {
  readonly value: ManifestDraft;
  readonly onApply: (next: ManifestDraft) => void;
}

// Maps `reason.code` to the matching `manifest.errors.*` key, passing along the params
// (`max`/`moduleType`) that key's translation interpolates.
function manifestErrorMessage(
  t: ReturnType<typeof useTranslations<'dashboard.hotsitePage'>>,
  reason: ManifestParseErrorReason,
): string {
  switch (reason.code) {
    case 'invalidSyntax':
      return t('manifest.errors.invalidSyntax');
    case 'invalidStructure':
      return t('manifest.errors.invalidStructure');
    case 'tooManyModules':
      return t('manifest.errors.tooManyModules', { max: reason.max });
    case 'unknownModuleType':
      return t('manifest.errors.unknownModuleType', { moduleType: reason.moduleType });
    case 'duplicateModuleType':
      return t('manifest.errors.duplicateModuleType', { moduleType: reason.moduleType });
    case 'invalidModuleData':
      return t('manifest.errors.invalidModuleData', { moduleType: reason.moduleType });
  }
}

// Unlike Branding/Layout/SEO's per-keystroke onChange, this tab holds its own local text buffer —
// arbitrary JSON text is transiently invalid while being typed, so it can't be written into
// `draft` on every change. "Aplicar" parses + validates it and only then calls onApply. Seeding
// happens once, lazily, from `value` — since HotsiteEditor unmounts this tab's subtree when
// another tab is active, switching away without clicking Aplicar discards the pending edit, and
// switching back always reseeds from the current draft (mirrors ModuleConfigShell's existing
// Cancelar-without-apply behavior elsewhere on this same screen).
export function ManifestTab({ value, onApply }: ManifestTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [errorReason, setErrorReason] = useState<ManifestParseErrorReason | null>(null);

  function handleTextChange(next: string): void {
    setText(next);
    setErrorReason(null);
  }

  function handleApply(): void {
    const result = parseManifestJson(text);
    if (!result.success) {
      setErrorReason(result.reason);
      return;
    }
    setErrorReason(null);
    onApply(result.value);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <SectionCard title={t('manifest.sectionTitle')}>
        <p className="text-sm leading-6 text-gray-500">{t('layout.configShell.description')}</p>
        <Textarea
          data-testid="hotsite-manifest-textarea"
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          spellCheck={false}
          className="min-h-[28rem] font-mono text-xs"
        />
        {errorReason && (
          <p
            role="alert"
            data-testid="hotsite-manifest-error"
            className="text-sm font-semibold text-red-700"
          >
            {manifestErrorMessage(t, errorReason)}
          </p>
        )}
        <Button type="button" onClick={handleApply} data-testid="hotsite-manifest-apply">
          {t('layout.configShell.applyLabel')}
        </Button>
      </SectionCard>
    </div>
  );
}
