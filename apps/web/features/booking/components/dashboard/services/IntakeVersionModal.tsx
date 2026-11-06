'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';

interface IntakeVersionModalProps {
  readonly version: ServiceIntakeSchemaVersion;
  readonly onClose: () => void;
}

// Read-only preview of a superseded intake-schema version (UC-054 A1) — a simple dialog, per the
// story's own AC ("a simple dialog is sufficient"). Built on the shared `ui/dialog`: Radix gives
// the focus trap, Escape and focus return, and the backdrop is its overlay, so click-to-close needs
// no hand-written `role="dialog"` div or key handler (the SonarCloud S6819 concern this file used
// to document). The caller mounts it only while a version is being previewed.
export function IntakeVersionModal({
  version,
  onClose,
}: IntakeVersionModalProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-testid="intake-version-modal"
        overlayTestId="intake-version-modal-backdrop"
        overlayClassName="bg-black/40"
        className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl"
      >
        <DialogTitle className="mb-3">
          {t('formularioVersionModalTitle', { version: version.version })}
        </DialogTitle>
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
        <DialogDescription className="mb-4 text-gray-600">{version.consentText}</DialogDescription>
        <Button
          type="button"
          variant="outline"
          data-testid="intake-version-modal-close"
          onClick={onClose}
        >
          {t('formularioVersionModalClose')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
