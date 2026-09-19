import { useCallback, useEffect, useRef } from 'react';

// A config tab's (Recursos / Políticas / Formulário) primary action — Save or Publish. Each panel
// still owns its own draft state and mutation; it only *registers* this descriptor with
// ServiceEditPage so the sticky action panel (desktop aside + mobile bar) can render the button
// the same way it does for Detalhes, instead of every panel drawing its own inline button.
export interface ServiceTabAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}

export type ServiceTabActionChange = (action: ServiceTabAction | null) => void;

interface TabActionInput {
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}

// `onActionChange` must be referentially stable (ServiceEditConfigTabPanels memoizes one per
// tab) — an unstable callback would re-run the effects below on every render. `onSubmit` is read
// through a ref so the registered `onSubmit` identity never changes and a panel's ever-changing
// handleSave closure doesn't force a re-register on every keystroke.
export function useRegisterTabAction(
  onActionChange: ServiceTabActionChange,
  { label, disabled, pending, onSubmit }: TabActionInput,
): void {
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });
  const stableSubmit = useCallback(() => submitRef.current(), []);

  useEffect(() => {
    onActionChange({ label, disabled, pending, onSubmit: stableSubmit });
  }, [onActionChange, label, disabled, pending, stableSubmit]);

  useEffect(() => () => onActionChange(null), [onActionChange]);
}
