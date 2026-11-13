import type { Type } from '@nestjs/common';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { routeAccessRequirements } from '../../../../test/utils/route-access-requirements';
import { ChatbotController } from './chatbot.controller';
import { HotsiteAdminController } from './hotsite-admin.controller';
import { HotsiteController } from './hotsite.controller';
import { LeadFormController } from './lead-form.controller';
import { LeadFormPublicController } from './lead-form-public.controller';
import { TenantController } from './tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';

interface Declared {
  feature: FeatureKey;
  policy: SuspensionAccessPolicy;
}

interface ControllerMapping {
  controller: Type<unknown>;
  /** What every route of the controller declares unless `routes` says otherwise. */
  default?: Declared;
  /** Per-route declarations, for a controller that mixes features. */
  routes?: Record<string, Declared>;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

// M25-S17: the Platform route → feature / suspension-policy mapping, pinned. The detector proves a
// declaration exists; only this proves it is the right one. A route added later is covered by its
// controller's default, or fails here until it is mapped.
const MAPPING: ControllerMapping[] = [
  {
    controller: HotsiteAdminController,
    default: { feature: 'HOTSITE', policy: 'DEFAULT_DENY' },
    minRoutes: 10,
  },
  {
    // The manifest: reachable while suspended so "Página não publicada" can render (UC-122).
    controller: HotsiteController,
    default: { feature: 'HOTSITE', policy: 'PUBLIC_MANIFEST' },
    minRoutes: 1,
  },
  {
    controller: ChatbotController,
    default: { feature: 'CHATBOT', policy: 'PUBLIC_NONE' },
    minRoutes: 2,
  },
  {
    controller: LeadFormPublicController,
    default: { feature: 'LEAD_FORM', policy: 'PUBLIC_NONE' },
    minRoutes: 2,
  },
  {
    controller: LeadFormController,
    default: { feature: 'LEAD_FORM', policy: 'DEFAULT_DENY' },
    minRoutes: 5,
  },
  {
    controller: TenantController,
    default: { feature: 'HOTSITE', policy: 'DEFAULT_DENY' },
    minRoutes: 1,
  },
  {
    // Mixed features: annotated per route, never at class level.
    controller: TenantSettingsController,
    routes: {
      getSettings: { feature: 'HOTSITE', policy: 'DEFAULT_DENY' },
      updateSettings: { feature: 'HOTSITE', policy: 'DEFAULT_DENY' },
      getCapStatus: { feature: 'CHATBOT', policy: 'DEFAULT_DENY' },
    },
    minRoutes: 3,
  },
];

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.routes?.[route.handler] ?? mapping.default,
  })),
);

describe('Platform routes — tenant access mapping (M25-S17)', () => {
  it.each(MAPPING)('finds the routes of $controller.name', ({ controller, minRoutes }) => {
    expect(routeAccessRequirements(controller).length).toBeGreaterThanOrEqual(minRoutes);
  });

  it.each(rows)(
    '$controller.$handler declares the mapped feature and suspension policy',
    ({ requirement, expected }) => {
      expect(expected).toBeDefined();
      expect(requirement).toEqual({
        feature: expected?.feature,
        noFeatureGate: undefined,
        policy: expected?.policy,
      });
    },
  );

  it('maps every per-route entry of a mixed controller to a real handler', () => {
    for (const mapping of MAPPING.filter((entry) => entry.routes)) {
      const handlers = routeAccessRequirements(mapping.controller).map((route) => route.handler);
      expect(handlers.sort()).toEqual(Object.keys(mapping.routes ?? {}).sort());
    }
  });

  it('keeps the manifest the only Platform route a suspended tenant can still reach', () => {
    const reachable = rows.filter(
      (row) =>
        row.requirement.policy !== 'DEFAULT_DENY' && row.requirement.policy !== 'PUBLIC_NONE',
    );

    expect(reachable.map((row) => `${row.controller}.${row.handler}`)).toEqual([
      'HotsiteController.getManifest',
    ]);
  });
});
