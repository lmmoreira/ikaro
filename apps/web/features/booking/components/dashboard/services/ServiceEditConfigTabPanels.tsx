'use client';

import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import type { ServiceEditTabKey } from '@/features/booking/types/service';
import { ServiceResourceRequirementsPanel } from './ServiceResourceRequirementsPanel';
import { ServiceBookingPolicyPanel } from './ServiceBookingPolicyPanel';
import { ServiceIntakeSchemaPanel } from './ServiceIntakeSchemaPanel';

interface ServiceEditConfigTabPanelsProps {
  readonly activeTab: ServiceEditTabKey;
  readonly service: StaffServiceResponse;
  readonly intakeSchema: ServiceIntakeSchemaResponse;
  readonly onTabDirtyChange: (tab: ServiceEditTabKey, dirty: boolean) => void;
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
}: ServiceEditConfigTabPanelsProps): React.JSX.Element {
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
        />
      </div>
    </>
  );
}
