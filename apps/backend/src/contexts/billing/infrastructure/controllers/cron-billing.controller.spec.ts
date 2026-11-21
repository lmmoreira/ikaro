import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NO_FEATURE_GATE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  CRON_BILLING_ISSUE_CHARGES_TRIGGER,
  CRON_BILLING_STATUS_SWEEP_TRIGGER,
} from '../events/cron-trigger-names.constants';
import { CronBillingController } from './cron-billing.controller';

describe('CronBillingController', () => {
  let controller: CronBillingController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronBillingController(triggerBus);
  });

  it('is open to every tenant status and to no feature gate: the crons reach suspended tenants', () => {
    const reflector = new Reflector();

    expect(reflector.get(NO_FEATURE_GATE_KEY, CronBillingController)).toBe(true);
    expect(reflector.get(SUSPENSION_ACCESS_KEY, CronBillingController)).toBe('ANY_AUTHENTICATED');
  });

  describe('POST /cron/billing-issue-charges', () => {
    it('returns { ok: true }', async () => {
      await expect(controller.issueCharges()).resolves.toEqual({ ok: true });
    });

    it('publishes the cron-billing-issue-charges trigger', async () => {
      await controller.issueCharges();

      expect(triggerBus.publishedTriggers).toEqual([CRON_BILLING_ISSUE_CHARGES_TRIGGER]);
    });
  });

  describe('POST /cron/billing-status-sweep', () => {
    it('answers exactly 200', () => {
      expect(Reflect.getMetadata('__httpCode__', CronBillingController.prototype.statusSweep)).toBe(
        HttpStatus.OK,
      );
    });

    it('returns { ok: true }', async () => {
      await expect(controller.statusSweep()).resolves.toEqual({ ok: true });
    });

    it('publishes the cron-billing-status-sweep trigger and no other', async () => {
      await controller.statusSweep();

      expect(triggerBus.publishedTriggers).toEqual([CRON_BILLING_STATUS_SWEEP_TRIGGER]);
      expect(CRON_BILLING_STATUS_SWEEP_TRIGGER).toBe('cron-billing-status-sweep');
    });
  });
});
