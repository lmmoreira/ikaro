import type { Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { TenantAccessRequirement } from '@ikaro/types';
import { StubExecutionContext } from './stub-execution-context';
import { readTenantAccessRequirement, type RouteMetadataReader } from './tenant-access-metadata';

export interface RouteAccessRequirement {
  /** The handler's method name on the controller. */
  handler: string;
  /** What the route declares, read exactly the way the tenant-access guards read it. */
  requirement: TenantAccessRequirement;
}

/**
 * Every HTTP route handler of a controller with the tenant-access requirement the guard would
 * resolve for it (class-level declarations inherited, a handler-level entitlement overriding the
 * class's). A route is any method carrying Nest's route `path` metadata, so a route added later is
 * picked up without a spec edit. For the per-context mapping specs that pin which feature and
 * suspension policy each route declares (the route detector only proves a declaration exists).
 * Pass Nest's `Reflector` as `reader`.
 */
export function routeAccessRequirements(
  controller: Type<unknown>,
  reader: RouteMetadataReader,
): RouteAccessRequirement[] {
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => {
      const member = prototype[name];
      return (
        name !== 'constructor' &&
        typeof member === 'function' &&
        reader.get<unknown>(PATH_METADATA, member) !== undefined
      );
    })
    .map((handler) => ({
      handler,
      requirement: readTenantAccessRequirement(
        reader,
        new StubExecutionContext(
          prototype[handler] as (...args: never[]) => unknown,
          controller,
          {},
        ),
      ),
    }));
}
