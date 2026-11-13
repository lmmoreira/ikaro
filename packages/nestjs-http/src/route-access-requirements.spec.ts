import 'reflect-metadata';
import { Controller, Get, Post } from '@nestjs/common';
import { routeAccessRequirements } from './route-access-requirements';
import { NoFeatureGate, RequiresFeature, SuspensionAccess } from './tenant-access-decorators';
import type { RouteMetadataReader } from './tenant-access-metadata';

// The same two reads Nest's `Reflector` does, over `Reflect` metadata, so the helper is exercised
// against real decorator metadata without depending on `@nestjs/core`.
const reader: RouteMetadataReader = {
  get: <T>(key: string, target: object) => Reflect.getMetadata(key, target) as T | undefined,
  getAllAndOverride: <T>(key: string, targets: object[]) => {
    for (const target of targets) {
      const value = Reflect.getMetadata(key, target) as T | undefined;
      if (value !== undefined) return value;
    }
    return undefined;
  },
};

describe('routeAccessRequirements', () => {
  it('lists only the route handlers, never the constructor or a plain method', () => {
    @Controller('things')
    class Things {
      @Get()
      list(): void {}

      @Post()
      create(): void {}

      helper(): void {}
    }

    const handlers = routeAccessRequirements(Things, reader).map((route) => route.handler);

    expect(handlers.sort()).toEqual(['create', 'list']);
  });

  it('resolves a class-level declaration for a route that declares nothing itself', () => {
    @Controller('things')
    @RequiresFeature('LEAD_FORM')
    @SuspensionAccess('PUBLIC_NONE')
    class Things {
      @Get()
      list(): void {}
    }

    expect(routeAccessRequirements(Things, reader)).toEqual([
      {
        handler: 'list',
        requirement: { feature: 'LEAD_FORM', noFeatureGate: undefined, policy: 'PUBLIC_NONE' },
      },
    ]);
  });

  it("lets a handler's entitlement override the class's and keeps the inherited policy", () => {
    @Controller('things')
    @RequiresFeature('HOTSITE')
    @SuspensionAccess('DEFAULT_DENY')
    class Things {
      @Get('cap')
      @RequiresFeature('CHATBOT')
      cap(): void {}

      @Get('open')
      @NoFeatureGate()
      open(): void {}
    }

    const byHandler = Object.fromEntries(
      routeAccessRequirements(Things, reader).map((route) => [route.handler, route.requirement]),
    );

    expect(byHandler['cap']).toEqual({
      feature: 'CHATBOT',
      noFeatureGate: undefined,
      policy: 'DEFAULT_DENY',
    });
    expect(byHandler['open']).toEqual({
      feature: undefined,
      noFeatureGate: true,
      policy: 'DEFAULT_DENY',
    });
  });

  it('returns an empty list for a controller with no routes', () => {
    @Controller('empty')
    class Empty {}

    expect(routeAccessRequirements(Empty, reader)).toEqual([]);
  });
});
