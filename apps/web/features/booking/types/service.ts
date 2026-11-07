import type { FeedbackModel } from '@/shared/components/ui/feedback-message';

// UI-only types for ServiceEditPage's M22-S04 tab bar — not domain DTOs, so they stay local
// rather than in @ikaro/types (grep confirmed at /story-discovery, 2026-09-18: the domain shapes
// this story touches — ResourceRequirementItem, ServiceLegItem, ServiceBookingPolicyItem,
// ServiceIntakeSchemaVersion — already live there; this file must not redefine any of them).
export type ServiceEditTabKey = 'detalhes' | 'recursos' | 'politicas' | 'formulario' | 'pagina';

export type ServiceEditDirtyState = Record<ServiceEditTabKey, boolean>;

export const INITIAL_SERVICE_EDIT_DIRTY_STATE: ServiceEditDirtyState = {
  detalhes: false,
  recursos: false,
  politicas: false,
  formulario: false,
  pagina: false,
};

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
