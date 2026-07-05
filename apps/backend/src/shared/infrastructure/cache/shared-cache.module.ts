import { Global, Module } from '@nestjs/common';
import { CACHE_PORT } from '../../ports/cache.port';
import { NestCacheAdapter } from './nest-cache.adapter';

// Shared backend cache adapter. Imported once at the application root and by
// context modules that need cache-backed repositories.
@Global()
@Module({
  providers: [{ provide: CACHE_PORT, useClass: NestCacheAdapter }],
  exports: [CACHE_PORT],
})
export class SharedCacheModule {}
