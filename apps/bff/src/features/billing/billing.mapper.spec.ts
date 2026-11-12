import { FEATURE_KEYS } from '@ikaro/validation';
import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import {
  failOpenBackendAccess,
  recoverAccessLookup,
  toBillingAccessResponse,
} from './billing.mapper';
import type { BackendTenantAccess } from './billing.types';

const ACCESS: BackendTenantAccess = {
  status: 'PAST_DUE',
  operational: true,
  features: [
    { key: 'HOTSITE', tier: 'STANDARD' },
    { key: 'CHATBOT', tier: 'BASIC' },
  ],
};

describe('toBillingAccessResponse', () => {
  it('gives a MANAGER the status, operational flag and features', () => {
    expect(toBillingAccessResponse('MANAGER', ACCESS)).toEqual({
      status: 'PAST_DUE',
      operational: true,
      features: ACCESS.features,
    });
  });

  it('gives STAFF the operational flag and features, never the status', () => {
    const view = toBillingAccessResponse('STAFF', ACCESS);

    expect(view).toEqual({ operational: true, features: ACCESS.features });
    expect(view).not.toHaveProperty('status');
  });

  it('gives a CUSTOMER only whether the tenant is operational', () => {
    expect(toBillingAccessResponse('CUSTOMER', ACCESS)).toEqual({ operational: true });
  });

  it.each(['MANAGER', 'STAFF', 'CUSTOMER'] as const)(
    'never carries a suspension reason or an internal marker for %s, even when the input does',
    (role) => {
      // What the backend really sends for a suspended tenant, markers and reason included.
      const backendAnswer = {
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [],
        provisional: true,
        degraded: true,
      } as unknown as BackendTenantAccess;

      const serialized = JSON.stringify(toBillingAccessResponse(role, backendAnswer));

      expect(serialized).not.toContain('suspensionReason');
      expect(serialized).not.toContain('NON_PAYMENT');
      expect(serialized).not.toContain('provisional');
      expect(serialized).not.toContain('degraded');
    },
  );
});

describe('failOpenBackendAccess', () => {
  it('is operational with every sellable feature, chatbot at BASIC', () => {
    const access = failOpenBackendAccess();

    expect(access).toMatchObject({ status: 'ACTIVE', operational: true });
    expect(access.features.map((feature) => feature.key).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(access.features.find((feature) => feature.key === 'CHATBOT')?.tier).toBe('BASIC');
  });
});

describe('recoverAccessLookup', () => {
  const recordingLogger = () => {
    const messages: string[] = [];
    return { messages, error: (message: string) => void messages.push(message) };
  };

  it('fails open and logs the cause on an outage', () => {
    const logger = recordingLogger();

    const access = recoverAccessLookup(new Error('ECONNRESET'), 't-1', logger);

    expect(access).toEqual(failOpenBackendAccess());
    expect(logger.messages).toHaveLength(1);
    expect(logger.messages[0]).toContain("tenant 't-1'");
    expect(logger.messages[0]).toContain('ECONNRESET');
  });

  it('fails open on a 5xx and logs it', () => {
    const logger = recordingLogger();

    const access = recoverAccessLookup(
      new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE),
      't-1',
      logger,
    );

    expect(access.operational).toBe(true);
    expect(logger.messages).toHaveLength(1);
  });

  it('fails open on a body that does not match the contract, logged as an invalid backend response', () => {
    const logger = recordingLogger();
    const schemaError = z.object({ status: z.string() }).safeParse({}).error as z.ZodError;

    const access = recoverAccessLookup(schemaError, 't-1', logger);

    expect(access.operational).toBe(true);
    expect(logger.messages[0]).toContain('invalid backend response');
  });

  it('rethrows a 4xx and logs nothing: it is a real answer, never fail-open', () => {
    const logger = recordingLogger();
    const notFound = new HttpException('not found', HttpStatus.NOT_FOUND);

    expect(() => recoverAccessLookup(notFound, 't-1', logger)).toThrow(notFound);
    expect(logger.messages).toHaveLength(0);
  });
});
