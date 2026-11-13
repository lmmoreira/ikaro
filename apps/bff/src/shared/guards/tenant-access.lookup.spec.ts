import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { of, throwError } from 'rxjs';
import { TtlCache } from '../cache/ttl-cache';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { publicTenantIdCache, withPublicTenant } from '../http/public-tenant';
import {
  OPERATIONAL_ACCESS_TTL_MS,
  SUSPENDED_ACCESS_TTL_MS,
  TenantAccessLookup,
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

const config = {
  getOrThrow: (key: string) =>
    key === 'BACKEND_INTERNAL_URL' ? 'http://backend:3001' : 'internal-key',
} as unknown as ConfigService;

const req = { headers: { 'x-correlation-id': 'corr-1' }, user: undefined } as unknown as Request;

function makeLookup(answer: () => unknown, clock = new FakeClock()) {
  const get = jest.fn().mockImplementation(() => of({ data: answer() }));
  const http = { get } as unknown as HttpService;
  const cache = new TtlCache<{ operational: boolean; features: { key: string }[] }>({
    maxEntries: 100,
    clock,
  });
  return { lookup: new TenantAccessLookup(http, config, cache), get, clock };
}

describe('TenantAccessLookup', () => {
  afterEach(() => publicTenantIdCache.clear());

  it('reads the backend access route with the internal key and keeps only what the gate needs', async () => {
    const { lookup, get } = makeLookup(() => ({
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [BOOKING],
    }));

    await expect(lookup.getAccess(TENANT_ID, req)).resolves.toEqual({
      operational: true,
      features: [{ key: 'BOOKING' }],
    });
    expect(get).toHaveBeenCalledWith(
      `http://backend:3001/internal/billing/tenants/${TENANT_ID}/access`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Internal-Key': 'internal-key' }),
      }),
    );
  });

  it('makes no second backend call inside the TTL', async () => {
    const { lookup, get } = makeLookup(() => ({ operational: true, features: [BOOKING] }));

    await lookup.getAccess(TENANT_ID, req);
    await lookup.getAccess(TENANT_ID, req);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('caches an operational answer for 300 s and a suspended one for 10 s', async () => {
    let operational = true;
    const { lookup, get, clock } = makeLookup(() => ({ operational, features: [BOOKING] }));
    await lookup.getAccess(TENANT_ID, req);

    clock.advance(OPERATIONAL_ACCESS_TTL_MS - 1);
    await lookup.getAccess(TENANT_ID, req);
    expect(get).toHaveBeenCalledTimes(1);
    clock.advance(1);
    operational = false;
    await lookup.getAccess(TENANT_ID, req);
    expect(get).toHaveBeenCalledTimes(2);

    clock.advance(SUSPENDED_ACCESS_TTL_MS - 1);
    await lookup.getAccess(TENANT_ID, req);
    expect(get).toHaveBeenCalledTimes(2);
    clock.advance(1);
    await lookup.getAccess(TENANT_ID, req);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('never caches a degraded (fail-open) answer', async () => {
    const { lookup, get } = makeLookup(() => ({
      operational: true,
      features: [BOOKING],
      degraded: true,
    }));

    await expect(lookup.getAccess(TENANT_ID, req)).resolves.toEqual({
      operational: true,
      features: [{ key: 'BOOKING' }],
    });
    await lookup.getAccess(TENANT_ID, req);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects an answer that does not match the contract instead of guessing', async () => {
    const { lookup } = makeLookup(() => ({ operational: 'yes' }));
    await expect(lookup.getAccess(TENANT_ID, req)).rejects.toThrow();
  });

  it('propagates a backend failure for the guard to turn into a pass-through', async () => {
    const http = {
      get: () => throwError(() => new Error('connect ECONNREFUSED')),
    } as unknown as HttpService;
    const lookup = new TenantAccessLookup(
      http,
      config,
      new TtlCache({ maxEntries: 10, clock: new FakeClock() }),
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
      const { lookup, get } = makeLookup(() => ({
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

      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith(
        'http://backend:3001/internal/tenants/by-slug/autospa',
        expect.anything(),
      );
      expect(backendHttp.get).not.toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith(TENANT_ID);
    });

    it('never caches a failed lookup (an unknown slug)', async () => {
      const http = { get: jest.fn().mockReturnValue(throwError(() => new Error('404'))) };
      const lookup = new TenantAccessLookup(
        http as unknown as HttpService,
        config,
        new TtlCache({ maxEntries: 10 }),
      );
      await expect(lookup.resolveTenantId('nope', req)).rejects.toThrow('404');
      await expect(lookup.resolveTenantId('nope', req)).rejects.toThrow('404');
      expect(http.get).toHaveBeenCalledTimes(2);
    });
  });
});
