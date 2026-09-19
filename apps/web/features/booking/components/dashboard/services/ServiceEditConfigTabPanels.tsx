'use client';

import { useCallback } from 'react';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import type { ServiceEditTabKey } from '@/features/booking/types/service';
import type { ServiceTabAction } from './service-tab-action';
import { ServiceResourceRequirementsPanel } from './ServiceResourceRequirementsPanel';
import { ServiceBookingPolicyPanel } from './ServiceBookingPolicyPanel';
import { ServiceIntakeSchemaPanel } from './ServiceIntakeSchemaPanel';

interface ServiceEditConfigTabPanelsProps {
  readonly activeTab: ServiceEditTabKey;
  readonly service: StaffServiceResponse;
  readonly intakeSchema: ServiceIntakeSchemaResponse;
  readonly onTabDirtyChange: (tab: ServiceEditTabKey, dirty: boolean) => void;
  // Each panel registers its Save/Publish action here so ServiceEditPage can render it in the
  // sticky action panel. Must be referentially stable.
  readonly onTabActionChange: (tab: ServiceEditTabKey, action: ServiceTabAction | null) => void;
}

// Split out of ServiceEditPage to stay under docs/CODE_STANDARDS.md's function-length limit —
// the Recursos/Políticas de reserva/Formulário de reserva tabpanels, which (unlike Detalhes)
// need no page-level state threaded through per-field handlers, just their own initial* props
// and a dirty-change callback. Stays mounted-but-hidden like Detalhes, for the same reason: a
// tab switch must never discard a panel's own local, unsaved draft state.
export function ServiceEditConfigTabPanels({
  activeTab,
  service,
  intakeSchema,
  onTabDirtyChange,
  onTabActionChange,
}: ServiceEditConfigTabPanelsProps): React.JSX.Element {
  // One stable callback per tab — a panel's registration effect depends on its identity.
  const onRecursosAction = useCallback(
    (action: ServiceTabAction | null) => onTabActionChange('recursos', action),
    [onTabActionChange],
  );
  const onPoliticasAction = useCallback(
    (action: ServiceTabAction | null) => onTabActionChange('politicas', action),
    [onTabActionChange],
  );
  const onFormularioAction = useCallback(
    (action: ServiceTabAction | null) => onTabActionChange('formulario', action),
    [onTabActionChange],
  );

  return (
    <>
      <div
        role="tabpanel"
        id="service-edit-tabpanel-recursos"
        aria-labelledby="service-edit-tab-recursos"
        hidden={activeTab !== 'recursos'}
      >
        <ServiceResourceRequirementsPanel
          serviceId={service.serviceId}
          initialResourceRequirements={service.resourceRequirements}
          initialLegs={service.legs}
          initialBufferAfterMinutes={service.bufferAfterMinutes}
          onDirtyChange={(value) => onTabDirtyChange('recursos', value)}
          onActionChange={onRecursosAction}
        />
      </div>

      <div
        role="tabpanel"
        id="service-edit-tabpanel-politicas"
        aria-labelledby="service-edit-tab-politicas"
        hidden={activeTab !== 'politicas'}
      >
        <ServiceBookingPolicyPanel
          serviceId={service.serviceId}
          initialPolicy={service.bookingPolicy}
          onDirtyChange={(value) => onTabDirtyChange('politicas', value)}
          onActionChange={onPoliticasAction}
        />
      </div>

      <div
        role="tabpanel"
        id="service-edit-tabpanel-formulario"
        aria-labelledby="service-edit-tab-formulario"
        hidden={activeTab !== 'formulario'}
      >
        <ServiceIntakeSchemaPanel
          serviceId={service.serviceId}
          initialActive={intakeSchema.active}
          initialHistory={intakeSchema.history}
          onDirtyChange={(value) => onTabDirtyChange('formulario', value)}
          onActionChange={onFormularioAction}
        />
      </div>
    </>
  );
}
