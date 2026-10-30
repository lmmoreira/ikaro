import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';

// A config tab's (Recursos / Políticas / Formulário) primary action — Save or Publish. Each panel
// still owns its own draft state and mutation; it only *registers* this descriptor with
// ServiceEditPage so the sticky action panel (desktop aside + mobile bar) can render the button
// the same way it does for Detalhes, instead of every panel drawing its own inline button.
export interface ServiceTabAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
  // The tab's last save result, shown below the buttons in the same sticky pane.
  readonly feedback: FeedbackModel | null;
}

export type ServiceTabActionChange = (action: ServiceTabAction | null) => void;

interface TabActionInput {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
  readonly feedback?: FeedbackModel | null;
}

// A save's error or success as the pane renders it: a fixed title and the message as the body.
// Memoized on the strings, so a panel re-render never re-registers an unchanged message.
export function useTabFeedback(
  form: Pick<ReturnType<typeof useFormFeedback>, 'error' | 'success'>,
): FeedbackModel | null {
  const t = useTranslations('dashboard.servicesPage');
  const errorTitle = t('feedbackErrorTitle');
  const savedTitle = t('feedbackSavedTitle');
  const { error, success } = form;

  return useMemo<FeedbackModel | null>(() => {
    if (error) return { variant: 'error', title: errorTitle, body: error };
    if (success) return { variant: 'success', title: savedTitle, body: success };
    return null;
  }, [error, success, errorTitle, savedTitle]);
}

// `onActionChange` must be referentially stable (ServiceEditConfigTabPanels memoizes one per
// tab) — an unstable callback would re-run the effects below on every render. `onSubmit` is read
// through a ref so the registered `onSubmit` identity never changes and a panel's ever-changing
// handleSave closure doesn't force a re-register on every keystroke.
export function useRegisterTabAction(
  onActionChange: ServiceTabActionChange,
  { label, disabled, pending, onSubmit, feedback = null }: TabActionInput,
): void {
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });
  const stableSubmit = useCallback(() => submitRef.current(), []);

  useEffect(() => {
    onActionChange({ label, disabled, pending, onSubmit: stableSubmit, feedback });
  }, [onActionChange, label, disabled, pending, stableSubmit, feedback]);

  useEffect(() => () => onActionChange(null), [onActionChange]);
}
