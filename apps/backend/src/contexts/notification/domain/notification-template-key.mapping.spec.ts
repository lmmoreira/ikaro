import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NotificationTemplateKey } from './notification-template-key.enum';
import {
  NOTIFICATION_TEMPLATE_KEY_MAPPING,
  PLATFORM_SCOPED_TEMPLATE_KEYS,
} from './notification-template-key.mapping';
import { BillingReminderDue } from '../../billing/domain/commands/billing-reminder-due.command';
import { ChargeIssued } from '../../billing/domain/events/charge-issued.event';
import { ChargePaid } from '../../billing/domain/events/charge-paid.event';
import { PlanChanged } from '../../billing/domain/events/plan-changed.event';
import { SubscriptionCancelled } from '../../billing/domain/events/subscription-cancelled.event';
import { SubscriptionPastDue } from '../../billing/domain/events/subscription-past-due.event';
import { SubscriptionPriceChangeAnnounced } from '../../billing/domain/events/subscription-price-change-announced.event';
import { SubscriptionReactivated } from '../../billing/domain/events/subscription-reactivated.event';
import { SubscriptionSuspended } from '../../billing/domain/events/subscription-suspended.event';

describe('NOTIFICATION_TEMPLATE_KEY_MAPPING', () => {
  it('has an entry for every NotificationTemplateKey', () => {
    for (const key of Object.values(NotificationTemplateKey)) {
      expect(NOTIFICATION_TEMPLATE_KEY_MAPPING[key]).toBeDefined();
    }
  });

  it('every entry has a non-empty eventName and recipientType', () => {
    for (const mapping of Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
      expect(mapping.eventName.length).toBeGreaterThan(0);
      expect(mapping.recipientType.length).toBeGreaterThan(0);
    }
  });
});

// packages/i18n/locales/**/notifications.json sits outside that package's compiled
// dist and must be read via Node's own module resolution, the same way
// JsonLocalizationAdapter does (docs/ENGINEERING_RULES_SHARED.md "Static locale/config
// files in workspace packages") — never via a TS `import` of the JSON file.
const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
type NotificationsFile = Record<string, Record<string, { subject: string; body: string }>>;

function readNotificationsFile(locale: string): NotificationsFile {
  const localesRoot = join(dirname(require.resolve('@ikaro/i18n/package.json')), 'locales');
  return JSON.parse(
    readFileSync(join(localesRoot, locale, 'notifications.json'), 'utf-8'),
  ) as NotificationsFile;
}

// Generalizes the error-code-catalogue exhaustiveness pattern
// (apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts) to notifications:
// every mapping entry must resolve to real, translated content, and no
// notifications.json entry may be orphaned (present with no mapping key pointing
// at it) in either locale (TD37 Story 12).
describe('NOTIFICATION_TEMPLATE_KEY_MAPPING <-> notifications.json key parity (TD37 Story 12)', () => {
  it.each(SUPPORTED_LOCALES)('every mapping entry has a translated template in %s', (locale) => {
    const notifications = readNotificationsFile(locale);
    for (const { eventName, recipientType } of Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
      const template = notifications[eventName]?.[recipientType];
      expect(template).toBeDefined();
      expect(template?.subject.length).toBeGreaterThan(0);
      expect(template?.body.length).toBeGreaterThan(0);
    }
  });

  it.each(SUPPORTED_LOCALES)(
    'has no notifications.json entry in %s without a matching mapping entry',
    (locale) => {
      const notifications = readNotificationsFile(locale);
      const mappedPairs = new Set(
        Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING).map(
          ({ eventName, recipientType }) => `${eventName}.${recipientType}`,
        ),
      );
      const orphaned: string[] = [];
      for (const [eventName, recipients] of Object.entries(notifications)) {
        for (const recipientType of Object.keys(recipients)) {
          const pair = `${eventName}.${recipientType}`;
          if (!mappedPairs.has(pair)) {
            orphaned.push(pair);
          }
        }
      }
      expect(orphaned).toEqual([]);
    },
  );
});

// The variable contract (M23-S37): render() turns a placeholder nobody supplied into '', so the
// mapping lists the variables each template uses and use cases type their variables against it.
// This is the half of the contract that ties the list to the shipped copy.
interface ShippedTemplate {
  subject: string;
  body: string;
}

function placeholdersOf(template: ShippedTemplate): string[] {
  const found = `${template.subject} ${template.body}`.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...found].map((m) => m[1] as string))].sort((a, b) => a.localeCompare(b));
}

function contractViolations(
  listed: readonly string[],
  template: ShippedTemplate,
): { unlisted: string[]; unused: string[] } {
  const used = placeholdersOf(template);
  return {
    unlisted: used.filter((name) => !listed.includes(name)),
    unused: listed.filter((name) => !used.includes(name)),
  };
}

describe('NOTIFICATION_TEMPLATE_KEY_MAPPING variable contract (M23-S37)', () => {
  it.each(SUPPORTED_LOCALES)(
    'every entry lists exactly the placeholders its template uses in %s',
    (locale) => {
      const notifications = readNotificationsFile(locale);
      const violations: string[] = [];
      for (const [key, mapping] of Object.entries(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
        const template = notifications[mapping.eventName]?.[mapping.recipientType];
        if (!template) {
          violations.push(`${key}: no ${mapping.eventName}.${mapping.recipientType} template`);
          continue;
        }
        const { unlisted, unused } = contractViolations(mapping.variables, template);
        if (unlisted.length > 0) violations.push(`${key}: not listed -> ${unlisted.join(', ')}`);
        if (unused.length > 0) violations.push(`${key}: listed but unused -> ${unused.join(', ')}`);
      }
      expect(violations).toEqual([]);
    },
  );

  it('keeps every entry free of duplicate variable names', () => {
    for (const mapping of Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
      expect(new Set(mapping.variables).size).toBe(mapping.variables.length);
    }
  });

  it('reports a placeholder the entry does not list, and a listed variable the template does not use', () => {
    const template = { subject: 'Hi {{name}}', body: '<p>{{name}} {{orderRef}}</p>' };

    expect(contractViolations(['name'], template)).toEqual({ unlisted: ['orderRef'], unused: [] });
    expect(contractViolations(['name', 'orderRef', 'ghost'], template)).toEqual({
      unlisted: [],
      unused: ['ghost'],
    });
    expect(contractViolations(['name', 'orderRef'], template)).toEqual({
      unlisted: [],
      unused: [],
    });
  });
});

// M26-S11: Billing's manager emails are platform-scoped. The table is the contract with S12 (which
// picks the key from the event data) and with Billing's S03 classes (a renamed event fails here).
describe('platform-scoped templates (M26-S11)', () => {
  const EXPECTED: ReadonlyArray<[NotificationTemplateKey, string, string]> = [
    [NotificationTemplateKey.CHARGE_ISSUED_PERIOD, ChargeIssued.name, 'managerPeriod'],
    [NotificationTemplateKey.CHARGE_ISSUED_RECOVERY, ChargeIssued.name, 'managerRecovery'],
    [NotificationTemplateKey.CHARGE_PAID, ChargePaid.name, 'manager'],
    [NotificationTemplateKey.SUBSCRIPTION_PAST_DUE, SubscriptionPastDue.name, 'manager'],
    [
      NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_NON_PAYMENT,
      SubscriptionSuspended.name,
      'managerNonPayment',
    ],
    [
      NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_OPERATOR,
      SubscriptionSuspended.name,
      'managerOperator',
    ],
    [NotificationTemplateKey.SUBSCRIPTION_REACTIVATED, SubscriptionReactivated.name, 'manager'],
    [
      NotificationTemplateKey.SUBSCRIPTION_CANCELLED_IMMEDIATE,
      SubscriptionCancelled.name,
      'managerImmediate',
    ],
    [
      NotificationTemplateKey.SUBSCRIPTION_CANCELLED_SCHEDULED,
      SubscriptionCancelled.name,
      'managerScheduled',
    ],
    [NotificationTemplateKey.PLAN_CHANGED, PlanChanged.name, 'manager'],
    [
      NotificationTemplateKey.BILLING_REMINDER_PLAN_CONFIRMATION,
      BillingReminderDue.name,
      'planConfirmation',
    ],
    [NotificationTemplateKey.BILLING_REMINDER_TRIAL_ENDING, BillingReminderDue.name, 'trialEnding'],
    [
      NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON,
      BillingReminderDue.name,
      'chargeDueSoon',
    ],
    [
      NotificationTemplateKey.BILLING_REMINDER_CHARGE_OVERDUE,
      BillingReminderDue.name,
      'chargeOverdue',
    ],
    [
      NotificationTemplateKey.BILLING_REMINDER_RECOVERY_CHARGE_OPEN,
      BillingReminderDue.name,
      'recoveryChargeOpen',
    ],
    [
      NotificationTemplateKey.SUBSCRIPTION_PRICE_CHANGE_ANNOUNCED,
      SubscriptionPriceChangeAnnounced.name,
      'manager',
    ],
    // Reserved for M27 (UC-132): the event class does not exist yet, so only its name is pinned.
    [NotificationTemplateKey.TENANT_PURGE_WARNING, 'TenantPurgeWarning', 'manager'],
  ];

  it('PLATFORM_SCOPED_TEMPLATE_KEYS is exactly the set of platformScoped entries (17)', () => {
    const flagged = Object.entries(NOTIFICATION_TEMPLATE_KEY_MAPPING)
      .filter(([, mapping]) => 'platformScoped' in mapping)
      .map(([key]) => key);

    expect([...PLATFORM_SCOPED_TEMPLATE_KEYS].sort()).toEqual(flagged.sort());
    expect(PLATFORM_SCOPED_TEMPLATE_KEYS).toHaveLength(17);
    expect(EXPECTED).toHaveLength(17);
  });

  it.each(EXPECTED)('%s maps to %s.%s and is platform-scoped', (key, eventName, recipientType) => {
    expect(NOTIFICATION_TEMPLATE_KEY_MAPPING[key]).toMatchObject({
      eventName,
      recipientType,
      platformScoped: true,
    });
  });

  it('keeps every other key tenant-scoped', () => {
    const tenantKeys = Object.values(NotificationTemplateKey).filter(
      (key) => !PLATFORM_SCOPED_TEMPLATE_KEYS.includes(key),
    );

    expect(tenantKeys.length).toBeGreaterThan(0);
    for (const key of tenantKeys) {
      expect('platformScoped' in NOTIFICATION_TEMPLATE_KEY_MAPPING[key]).toBe(false);
    }
  });

  it('never links a billing email to a nullable event field: every link placeholder is billingUrl or paymentUrl', () => {
    for (const key of PLATFORM_SCOPED_TEMPLATE_KEYS) {
      const urlVariables = NOTIFICATION_TEMPLATE_KEY_MAPPING[key].variables.filter((v) =>
        v.endsWith('Url'),
      );
      for (const variable of urlVariables) {
        expect(['billingUrl', 'paymentUrl']).toContain(variable);
      }
    }
  });
});
