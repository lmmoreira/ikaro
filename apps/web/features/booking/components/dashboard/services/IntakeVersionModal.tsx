'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';

interface IntakeVersionModalProps {
  readonly version: ServiceIntakeSchemaVersion;
  readonly onClose: () => void;
}

// Read-only preview of a superseded intake-schema version (UC-054 A1) — a simple dialog, per the
// story's own AC ("a simple dialog is sufficient"). The backdrop is a real <button>, not a div
// with an onClick, so click-to-close stays keyboard-accessible without extra key handling.
export function IntakeVersionModal({
  version,
  onClose,
}: IntakeVersionModalProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('formularioVersionModalClose')}
        data-testid="intake-version-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('formularioVersionModalTitle', { version: version.version })}
        data-testid="intake-version-modal"
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {t('formularioVersionModalTitle', { version: version.version })}
        </h3>
        <ul className="mb-4 space-y-2 text-sm">
          {version.questions.map((question) => (
            <li key={question.fieldKey} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="font-semibold text-gray-900">{question.label}</p>
              <p className="text-xs text-gray-500">
                {question.type} · {question.required ? t('formularioQuestionRequiredLabel') : ''}
              </p>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-sm text-gray-600">{version.consentText}</p>
        <Button
          type="button"
          variant="outline"
          data-testid="intake-version-modal-close"
          onClick={onClose}
        >
          {t('formularioVersionModalClose')}
        </Button>
      </div>
    </div>
  );
}
