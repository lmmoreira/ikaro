'use client';

import { useCallback } from 'react';
import type {
  ResourceRequirementItem,
  ServiceIntakeSchemaResponse,
  StaffServiceResponse,
} from '@ikaro/types';
import type { ServiceEditTabKey } from '@/features/booking/types/service';
import type { ServiceTabAction } from './service-tab-action';
import { ServiceResourceRequirementsPanel } from './ServiceResourceRequirementsPanel';
import { ServiceBookingPolicyPanel } from './ServiceBookingPolicyPanel';
import { ServiceIntakeSchemaPanel } from './ServiceIntakeSchemaPanel';
import { ServicePublicPageTab } from './ServicePublicPageTab';

interface ServiceEditConfigTabPanelsProps {
  readonly activeTab: ServiceEditTabKey;
  readonly service: StaffServiceResponse;
  readonly intakeSchema: ServiceIntakeSchemaResponse;
  readonly onTabDirtyChange: (tab: ServiceEditTabKey, dirty: boolean) => void;
  // Each panel registers its Save/Publish action here so ServiceEditPage can render it in the
  // sticky action panel. Must be referentially stable.
  readonly onTabActionChange: (tab: ServiceEditTabKey, action: ServiceTabAction | null) => void;
  readonly onLegsSaved?: (totalSpanMinutes: number) => void;
  // Overrides `service.legs` once a legs save lands in this session (legs bar a customer-chosen duration).
  readonly hasLegs?: boolean;
  // The flat requirements as last saved and the live "requires pickup address" value, for the
  // Políticas tab's recurrence hint; they override `service.*` once the page has newer values.
  readonly resourceRequirements?: ResourceRequirementItem[];
  readonly requiresPickupAddress?: boolean;
  readonly onRequirementsSaved?: (requirements: ResourceRequirementItem[]) => void;
  // Live flag for the Página pública tab's note (a deactivated service shows no page on the site).
  readonly isActive?: boolean;
}

// Split out of ServiceEditPage to stay under docs/CODE_STANDARDS.md's function-length limit —
// the Recursos/Políticas de reserva/Formulário de reserva/Página pública tabpanels, which (unlike Detalhes)
// need no page-level state threaded through per-field handlers, just their own initial* props
// and a dirty-change callback. Stays mounted-but-hidden like Detalhes, for the same reason: a
// tab switch must never discard a panel's own local, unsaved draft state.
export function ServiceEditConfigTabPanels({
  activeTab,
  service,
  intakeSchema,
  onTabDirtyChange,
  onTabActionChange,
  onLegsSaved,
  hasLegs = service.legs !== null,
  resourceRequirements = service.resourceRequirements,
  requiresPickupAddress = service.requiresPickupAddress,
  onRequirementsSaved,
  isActive = service.isActive,
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
  const onPaginaAction = useCallback(
    (action: ServiceTabAction | null) => onTabActionChange('pagina', action),
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
          onLegsSaved={onLegsSaved}
          onRequirementsSaved={onRequirementsSaved}
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
          hasLegs={hasLegs}
          resourceRequirements={resourceRequirements}
          requiresPickupAddress={requiresPickupAddress}
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

      <div
        role="tabpanel"
        id="service-edit-tabpanel-pagina"
        aria-labelledby="service-edit-tab-pagina"
        hidden={activeTab !== 'pagina'}
      >
        <ServicePublicPageTab
          service={service}
          isActive={isActive}
          onDirtyChange={(value) => onTabDirtyChange('pagina', value)}
          onActionChange={onPaginaAction}
        />
      </div>
    </>
  );
}
