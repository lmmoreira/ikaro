import { Module } from '@nestjs/common';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { BACKEND_RESPONSE_CACHE } from './backend-read-cache';

// One ceiling for every cached backend read (tenant-by-slug): the oldest entry goes
// first, so a flood of distinct slugs cannot grow the cache without bound.
const BACKEND_RESPONSE_CACHE_MAX_ENTRIES = 5_000;

/**
 * The cache behind `BackendHttpService`. Imported by every module that provides it, so they share
 * one instance. In-memory and per instance today; a Redis adapter replaces only this provider.
 */
@Module({
  providers: [
    {
      provide: BACKEND_RESPONSE_CACHE,
      useFactory: () =>
        new InMemoryBffCache<unknown>({ maxEntries: BACKEND_RESPONSE_CACHE_MAX_ENTRIES }),
    },
  ],
  exports: [BACKEND_RESPONSE_CACHE],
})
export class BackendCacheModule {}
