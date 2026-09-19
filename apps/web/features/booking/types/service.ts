// UI-only types for ServiceEditPage's M22-S04 tab bar — not domain DTOs, so they stay local
// rather than in @ikaro/types (grep confirmed at /story-discovery, 2026-09-18: the domain shapes
// this story touches — ResourceRequirementItem, ServiceLegItem, ServiceBookingPolicyItem,
// ServiceIntakeSchemaVersion — already live there; this file must not redefine any of them).
export type ServiceEditTabKey = 'detalhes' | 'recursos' | 'politicas' | 'formulario';

export type ServiceEditDirtyState = Record<ServiceEditTabKey, boolean>;

export const INITIAL_SERVICE_EDIT_DIRTY_STATE: ServiceEditDirtyState = {
  detalhes: false,
  recursos: false,
  politicas: false,
  formulario: false,
};
