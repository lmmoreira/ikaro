// UI-only types for ServiceEditPage's M22-S04 tab bar — not domain DTOs, so they stay local
// rather than in @ikaro/types (grep confirmed at /story-discovery, 2026-09-18: the domain shapes
// this story touches — ResourceRequirementItem, ServiceLegItem, ServiceBookingPolicyItem,
// ServiceIntakeSchemaVersion — already live there; this file must not redefine any of them).
export type ServiceEditTabKey = 'detalhes' | 'recursos' | 'politicas' | 'formulario';

// Formulário de reserva has no "unsaved draft" concept the same way the other 3 do — publishing
// is its own explicit action with no in-place edit of already-submitted state, so it's
// deliberately excluded from this map (dev-notes.md § UX review fixes, round 2, item 1).
export type ServiceEditDirtyTabKey = Exclude<ServiceEditTabKey, 'formulario'>;

export type ServiceEditDirtyState = Record<ServiceEditDirtyTabKey, boolean>;

export const INITIAL_SERVICE_EDIT_DIRTY_STATE: ServiceEditDirtyState = {
  detalhes: false,
  recursos: false,
  politicas: false,
};
