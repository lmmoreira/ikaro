import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { HotsiteAdminController } from './hotsite-admin.controller';
import { HotsiteTemplatesController } from './hotsite-templates.controller';
import { LeadFormController } from './lead-form.controller';
import { PlatformPublicController } from './platform.public.controller';
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

const HOTSITE_DENY: Declared = { feature: 'HOTSITE', policy: 'DEFAULT_DENY' };
const MANIFEST: Declared = { feature: 'HOTSITE', policy: 'PUBLIC_MANIFEST' };
const CHATBOT_PUBLIC: Declared = { feature: 'CHATBOT', policy: 'PUBLIC_NONE' };
const LEAD_FORM_PUBLIC: Declared = { feature: 'LEAD_FORM', policy: 'PUBLIC_NONE' };

// M25-S17: the BFF Platform route → feature / suspension-policy mapping, pinned. The detector
// proves a declaration exists; only this proves it is the right one. A route added later is covered
// by its controller's default, or fails here until it is mapped.
const MAPPING: ControllerMapping[] = [
  { controller: HotsiteAdminController, default: HOTSITE_DENY, minRoutes: 8 },
  { controller: HotsiteTemplatesController, default: HOTSITE_DENY, minRoutes: 2 },
  {
    controller: LeadFormController,
    default: { feature: 'LEAD_FORM', policy: 'DEFAULT_DENY' },
    minRoutes: 5,
  },
  { controller: TenantController, default: HOTSITE_DENY, minRoutes: 1 },
  {
    // Mixed features: annotated per route, never at class level.
    controller: TenantSettingsController,
    routes: {
      getSettings: HOTSITE_DENY,
      updateSettings: HOTSITE_DENY,
      getChatbotCapStatus: { feature: 'CHATBOT', policy: 'DEFAULT_DENY' },
    },
    minRoutes: 3,
  },
  {
    // The manifest and the published list stay reachable while suspended (UC-122); every other
    // public route refuses.
    controller: PlatformPublicController,
    routes: {
      getManifest: MANIFEST,
      getPublishedHotsites: MANIFEST,
      getChatbotStatus: CHATBOT_PUBLIC,
      sendChatbotMessage: CHATBOT_PUBLIC,
      getLeadFormConfig: LEAD_FORM_PUBLIC,
      submitLeadForm: LEAD_FORM_PUBLIC,
    },
    minRoutes: 6,
  },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller, reflector).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.routes?.[route.handler] ?? mapping.default,
  })),
);

describe('BFF Platform routes — tenant access mapping (M25-S17)', () => {
  it.each(MAPPING)('finds the routes of $controller.name', ({ controller, minRoutes }) => {
    expect(routeAccessRequirements(controller, reflector).length).toBeGreaterThanOrEqual(minRoutes);
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
      const handlers = routeAccessRequirements(mapping.controller, reflector).map(
        (route) => route.handler,
      );
      expect(handlers.sort()).toEqual(Object.keys(mapping.routes ?? {}).sort());
    }
  });

  it('keeps the manifest and the published list the only Platform routes a suspended tenant reaches', () => {
    const reachable = rows.filter(
      (row) =>
        row.requirement.policy !== 'DEFAULT_DENY' && row.requirement.policy !== 'PUBLIC_NONE',
    );

    expect(reachable.map((row) => `${row.controller}.${row.handler}`).sort()).toEqual([
      'PlatformPublicController.getManifest',
      'PlatformPublicController.getPublishedHotsites',
    ]);
  });
});
