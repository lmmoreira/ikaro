import { Observable, of, throwError } from 'rxjs';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { makeRequest } from '../../test/execution-context.factory';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { TtlCache } from '../cache/ttl-cache';
import { publicTenantCache, withPublicTenant } from '../http/public-tenant';
import {
  OPERATIONAL_ACCESS_TTL_MS,
  SUSPENDED_ACCESS_TTL_MS,
  TenantAccessLookup,
  type AccessLookupConfig,
  type BackendGetClient,
} from './tenant-access.lookup';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const BOOKING = { key: 'BOOKING', tier: 'STANDARD' };

class FakeClock {
  private current = 5_000_000;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

// Answers every GET with what `answer()` returns right now, and records the URLs it was asked for.
class FakeBackend implements BackendGetClient {
  readonly urls: string[] = [];
  lastHeaders: Record<string, string> = {};

  constructor(private readonly answer: () => unknown) {}

  get<T>(
    url: string,
    config: { headers: Record<string, string>; timeout: number },
  ): Observable<{ data: T }> {
    this.urls.push(url);
    this.lastHeaders = config.headers;
    return of({ data: this.answer() as T });
  }
}

class FailingBackend implements BackendGetClient {
  calls = 0;

  constructor(private readonly message: string) {}

  get<T>(): Observable<{ data: T }> {
    this.calls += 1;
    return throwError(() => new Error(this.message));
  }
}

const config: AccessLookupConfig = {
  getOrThrow: (key) => (key === 'BACKEND_INTERNAL_URL' ? 'http://backend:3001' : 'internal-key'),
};

const req = makeRequest({ headers: { 'x-correlation-id': 'corr-1' } });

type AccessCache = InMemoryBffCache<{ operational: boolean; features: { key: string }[] }>;

function makeLookup(answer: () => unknown, clock = new FakeClock()) {
  const backend = new FakeBackend(answer);
  const cache: AccessCache = new InMemoryBffCache({ maxEntries: 100, clock });
  return { lookup: new TenantAccessLookup(backend, config, cache), backend, clock };
}

describe('TenantAccessLookup', () => {
  afterEach(() => publicTenantCache.clear());

  it('reads the backend access route with the internal key and keeps only what the gate needs', async () => {
    const { lookup, backend } = makeLookup(() => ({
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [BOOKING],
    }));

    await expect(lookup.getAccess(TENANT_ID, req)).resolves.toEqual({
      operational: true,
      features: [{ key: 'BOOKING' }],
    });
    expect(backend.urls).toEqual([
      `http://backend:3001/internal/billing/tenants/${TENANT_ID}/access`,
    ]);
    expect(backend.lastHeaders['X-Internal-Key']).toBe('internal-key');
  });

  it('makes no second backend call inside the TTL', async () => {
    const { lookup, backend } = makeLookup(() => ({ operational: true, features: [BOOKING] }));

    await lookup.getAccess(TENANT_ID, req);
    await lookup.getAccess(TENANT_ID, req);

    expect(backend.urls).toHaveLength(1);
  });

  it('caches an operational answer for 300 s and a suspended one for 10 s', async () => {
    let operational = true;
    const { lookup, backend, clock } = makeLookup(() => ({ operational, features: [BOOKING] }));
    await lookup.getAccess(TENANT_ID, req);

    clock.advance(OPERATIONAL_ACCESS_TTL_MS - 1);
    await lookup.getAccess(TENANT_ID, req);
    expect(backend.urls).toHaveLength(1);
    clock.advance(1);
    operational = false;
    await lookup.getAccess(TENANT_ID, req);
    expect(backend.urls).toHaveLength(2);

    clock.advance(SUSPENDED_ACCESS_TTL_MS - 1);
    await lookup.getAccess(TENANT_ID, req);
    expect(backend.urls).toHaveLength(2);
    clock.advance(1);
    await lookup.getAccess(TENANT_ID, req);
    expect(backend.urls).toHaveLength(3);
  });

  it('never caches a degraded (fail-open) answer', async () => {
    const { lookup, backend } = makeLookup(() => ({
      operational: true,
      features: [BOOKING],
      degraded: true,
    }));

    await expect(lookup.getAccess(TENANT_ID, req)).resolves.toEqual({
      operational: true,
      features: [{ key: 'BOOKING' }],
    });
    await lookup.getAccess(TENANT_ID, req);
    expect(backend.urls).toHaveLength(2);
  });

  it('rejects an answer that does not match the contract instead of guessing', async () => {
    const { lookup } = makeLookup(() => ({ operational: 'yes' }));
    await expect(lookup.getAccess(TENANT_ID, req)).rejects.toThrow();
  });

  it('propagates a backend failure for the guard to turn into a pass-through', async () => {
    const backend = new FailingBackend('connect ECONNREFUSED');
    const lookup = new TenantAccessLookup(
      backend,
      config,
      new InMemoryBffCache({ maxEntries: 10, clock: new FakeClock() }),
    );
    await expect(lookup.getAccess(TENANT_ID, req)).rejects.toThrow('ECONNREFUSED');
  });

  describe('stacked staleness (the BFF cache over the backend subscription cache)', () => {
    // The backend layer is stood in for by a second TtlCache with the real
    // `CachingSubscriptionRepository` TTLs (300 s / 10 s; pinned by that class's own spec), so the
    // two layers compose on one shared fake clock.
    function stack() {
      const clock = new FakeClock();
      let truth = true;
      const backendLayer = new TtlCache<boolean>({ maxEntries: 10, clock });
      const readBackend = (): boolean => {
        const cached = backendLayer.get('t');
        if (cached !== undefined) return cached;
        backendLayer.set('t', truth, truth ? 300_000 : 10_000);
        return truth;
      };
      const { lookup } = makeLookup(
        () => ({ operational: readBackend(), features: [BOOKING] }),
        clock,
      );
      return {
        clock,
        // Another request on the backend fills its layer first: the worst case for stacking.
        warmBackend: () => {
          readBackend();
        },
        read: async () => (await lookup.getAccess(TENANT_ID, req)).operational,
        setTruth: (value: boolean) => {
          truth = value;
        },
      };
    }

    it('shows a suspension on another instance within 600 s, and never later', async () => {
      const { clock, read, warmBackend, setTruth } = stack();
      warmBackend();
      setTruth(false);

      // The BFF reads the backend's still-cached answer just before it expires and keeps it for
      // its own 300 s: the old answer is served right up to 299.999 + 300 s…
      clock.advance(299_999);
      expect(await read()).toBe(true);
      clock.advance(299_999);
      expect(await read()).toBe(true);
      // …and is gone by 600 s.
      clock.advance(2);
      expect(await read()).toBe(false);
    });

    it('shows a lifting on another instance within 20 s, and never later', async () => {
      const { clock, read, warmBackend, setTruth } = stack();
      setTruth(false);
      warmBackend();
      setTruth(true);

      clock.advance(9_999);
      expect(await read()).toBe(false);
      clock.advance(9_999);
      expect(await read()).toBe(false);
      clock.advance(2);
      expect(await read()).toBe(true);
    });
  });

  describe('slug → tenant id for an @Public() route', () => {
    it('makes one by-slug call for the guard and withPublicTenant together, and none inside the TTL', async () => {
      const { lookup, backend } = makeLookup(() => ({
        id: TENANT_ID,
        slug: 'autospa',
        name: 'Autospa',
      }));
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ id: TENANT_ID }),
      });
      const run = jest.fn().mockResolvedValue('ok');

      await lookup.resolveTenantId('autospa', req);
      await withPublicTenant(backendHttp, 'autospa', run);
      await lookup.resolveTenantId('autospa', req);

      expect(backend.urls).toEqual(['http://backend:3001/internal/tenants/by-slug/autospa']);
      expect(backendHttp.get).not.toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith(TENANT_ID);
    });

    it('never caches a failed lookup (an unknown slug)', async () => {
      const backend = new FailingBackend('404');
      const lookup = new TenantAccessLookup(
        backend,
        config,
        new InMemoryBffCache({ maxEntries: 10 }),
      );
      await expect(lookup.resolveTenantId('nope', req)).rejects.toThrow('404');
      await expect(lookup.resolveTenantId('nope', req)).rejects.toThrow('404');
      expect(backend.calls).toBe(2);
    });
  });
});
