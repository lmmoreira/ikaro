'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { Button } from '@/shared/components/ui/button';

interface IntakeVersionModalProps {
  readonly version: ServiceIntakeSchemaVersion;
  readonly onClose: () => void;
}

const TITLE_ID = 'intake-version-modal-title';

// Read-only preview of a superseded intake-schema version (UC-054 A1) — a simple dialog, per the
// story's own AC ("a simple dialog is sufficient"). Native <dialog> + the shared useModalDialog
// hook matches the existing modal precedent (BookingActionSheetShell/ScheduleRemovalDialog) —
// showModal()/focus-trap/Escape-to-close all come from there, rather than a bespoke role="dialog"
// div with its own keydown listener (SonarCloud S6819). The backdrop stays a real <button>, not a
// div with an onClick, so click-to-close stays keyboard-accessible without extra key handling.
export function IntakeVersionModal({
  version,
  onClose,
}: IntakeVersionModalProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const dialogRef = useModalDialog(true);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={TITLE_ID}
      data-testid="intake-version-modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh w-dvw max-h-none max-w-none border-0 bg-transparent p-0"
    >
      <button
        type="button"
        aria-label={t('formularioVersionModalClose')}
        data-testid="intake-version-modal-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/40"
      />
      <div className="relative z-10 flex h-full items-center justify-center p-4">
        <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <h3 id={TITLE_ID} className="mb-3 text-sm font-semibold text-gray-900">
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
    </dialog>
  );
}
