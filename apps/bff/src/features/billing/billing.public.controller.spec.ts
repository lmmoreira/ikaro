import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import express, { type Response } from 'express';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { BillingPublicController } from './billing.public.controller';
import { BackendPublicPricesSchema, PublicPricesQuerySchema } from './billing.public.schemas';

// A real Node response with Express's prototype, so `setHeader` and `getHeader` behave as in
// production (the controller only ever sets a header on it).
function newResponse(): Response {
  return Object.setPrototypeOf(
    new ServerResponse(new IncomingMessage(new Socket())),
    express.response,
  );
}

const BACKEND_OFFERED = {
  offered: true,
  countryCode: 'BR',
  currency: 'BRL',
  taxBehavior: 'INCLUSIVE',
  prices: [
    {
      featureKey: 'HOTSITE',
      tier: 'STANDARD',
      cycle: 'MONTHLY',
      currency: 'BRL',
      amountMinor: 4900,
      effectiveFrom: '2026-01-01',
      upcoming: { amountMinor: 5900, effectiveFrom: '2026-12-01' },
    },
  ],
};

describe('BillingPublicController', () => {
  describe('getPrices', () => {
    it('asks the backend for the country, maps the answer and caches it for five minutes', async () => {
      const get = jest.fn().mockResolvedValue(BACKEND_OFFERED);
      const controller = new BillingPublicController(makeBackendHttp({ get }));
      const res = newResponse();

      const result = await controller.getPrices({ country: 'BR' }, res);

      expect(get).toHaveBeenCalledWith('/internal/billing/public-prices', { country: 'BR' });
      expect(result).toEqual({
        countryCode: 'BR',
        currency: 'BRL',
        taxBehavior: 'INCLUSIVE',
        items: [
          {
            featureKey: 'HOTSITE',
            tier: 'STANDARD',
            amountMinor: 4900,
            upcoming: { amountMinor: 5900, effectiveFrom: '2026-12-01' },
          },
        ],
      });
      expect(res.getHeader('Cache-Control')).toBe('public, max-age=300');
    });

    it('answers a country that is not offered with exactly an empty list, also cacheable', async () => {
      const get = jest.fn().mockResolvedValue({ offered: false });
      const controller = new BillingPublicController(makeBackendHttp({ get }));
      const res = newResponse();

      await expect(controller.getPrices({ country: 'US' }, res)).resolves.toEqual({ items: [] });
      expect(res.getHeader('Cache-Control')).toBe('public, max-age=300');
    });

    it('sets no cache header when the backend fails: an error is never cacheable', async () => {
      const get = jest.fn().mockRejectedValue(new Error('backend down'));
      const controller = new BillingPublicController(makeBackendHttp({ get }));
      const res = newResponse();

      await expect(controller.getPrices({ country: 'BR' }, res)).rejects.toThrow('backend down');
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });

    it('sets no cache header when the backend answer is not the declared shape', async () => {
      const get = jest.fn().mockResolvedValue({ unexpected: true });
      const controller = new BillingPublicController(makeBackendHttp({ get }));
      const res = newResponse();

      await expect(controller.getPrices({ country: 'BR' }, res)).rejects.toThrow();
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });
  });

  describe('PublicPricesQuerySchema', () => {
    it('checks only the shape: any string is forwarded, the backend judges it', () => {
      for (const country of ['', 'br', 'US', 'ZZ', 'not a country']) {
        expect(PublicPricesQuerySchema.safeParse({ country }).success).toBe(true);
      }
    });

    it('rejects a missing or non-string country', () => {
      expect(PublicPricesQuerySchema.safeParse({}).success).toBe(false);
      expect(PublicPricesQuerySchema.safeParse({ country: ['BR', 'US'] }).success).toBe(false);
    });
  });

  describe('BackendPublicPricesSchema', () => {
    it('strips what it does not declare, so a backend field can never reach the visitor', () => {
      const parsed = BackendPublicPricesSchema.parse({
        ...BACKEND_OFFERED,
        internalNote: 'x',
        prices: [{ ...BACKEND_OFFERED.prices[0], tenantId: 't' }],
      });

      expect(JSON.stringify(parsed)).not.toContain('internalNote');
      expect(JSON.stringify(parsed)).not.toContain('tenantId');
      expect(JSON.stringify(parsed)).not.toContain('cycle');
      expect(JSON.stringify(parsed)).not.toContain('effectiveFrom":"2026-01-01');
    });

    it('rejects an unknown tax behaviour', () => {
      expect(
        BackendPublicPricesSchema.safeParse({ ...BACKEND_OFFERED, taxBehavior: 'MAYBE' }).success,
      ).toBe(false);
    });
  });
});
