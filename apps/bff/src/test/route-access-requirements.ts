import type { Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { StubExecutionContext, readTenantAccessRequirement } from '@ikaro/nestjs-http';
import type { TenantAccessRequirement } from '@ikaro/types';

export interface RouteAccessRequirement {
  /** The handler's method name on the controller. */
  handler: string;
  /** What the route declares, read exactly the way `TenantAccessGuard` reads it. */
  requirement: TenantAccessRequirement;
}

/**
 * Every HTTP route handler of a controller with the tenant-access requirement the guard would
 * resolve for it (class-level declarations inherited, a handler-level entitlement overriding the
 * class's). A route is any method carrying Nest's route `path` metadata, so a route added later is
 * picked up without a spec edit. Used by the per-feature mapping specs that pin which feature and
 * suspension policy each route declares (the detector only proves a declaration exists).
 */
export function routeAccessRequirements(controller: Type<unknown>): RouteAccessRequirement[] {
  const reflector = new Reflector();
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => {
      const member = prototype[name];
      return (
        name !== 'constructor' &&
        typeof member === 'function' &&
        reflector.get<unknown>(PATH_METADATA, member) !== undefined
      );
    })
    .map((handler) => ({
      handler,
      requirement: readTenantAccessRequirement(
        reflector,
        new StubExecutionContext(
          prototype[handler] as (...args: never[]) => unknown,
          controller,
          {},
        ),
      ),
    }));
}
