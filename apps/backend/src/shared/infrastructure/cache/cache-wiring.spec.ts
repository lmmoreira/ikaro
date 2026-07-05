import { PlatformSettingsModule } from '../../../contexts/platform/platform-settings.module';
import { PlatformModule } from '../../../contexts/platform/platform.module';
import { SharedCacheModule } from './shared-cache.module';
import { CACHE_PORT } from '../../ports/cache.port';

describe('cache wiring', () => {
  it('keeps the cache port and module composition loadable', () => {
    expect(PlatformModule).toBeDefined();
    expect(PlatformSettingsModule).toBeDefined();
    expect(SharedCacheModule).toBeDefined();
    expect(typeof CACHE_PORT).toBe('symbol');
  });
});
