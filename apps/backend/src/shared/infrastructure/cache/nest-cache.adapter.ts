import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CachePort } from '../../ports/cache.port';

@Injectable()
export class NestCacheAdapter implements CachePort {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.cacheManager.get<T>(key)) ?? null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
