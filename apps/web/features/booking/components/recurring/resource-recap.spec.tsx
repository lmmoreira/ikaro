// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '@ikaro/i18n/locales/pt-BR/web.json';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import {
  autoRequirement,
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
  storedLocationRequirement,
} from '@/test-utils';
import { buildResourceRecap } from './resource-recap';
import { useRequirementText } from './use-requirement-text';

const OPTIONS: HotsiteServiceResourceOptionsRequirement[] = [
  {
    legIndex: null,
    resourceType: 'STAFF',
    options: [
      { resourceId: 'staff-1', name: 'Dr. Paulo' },
      { resourceId: 'staff-2', name: 'Dra. Lia' },
    ],
  } as HotsiteServiceResourceOptionsRequirement,
];

const DRAFT: RecurringScheduleDraft = {
  serviceId: 'svc',
  resourceIds: ['staff-2'],
  daysOfWeek: ['monday'],
  startTime: '10:00',
  startsOn: '2026-10-12',
  endsOn: '2026-11-09',
};

function service(resourceRequirements: ReturnType<typeof choiceRequirement>[]) {
  return makeHotsiteService({
    bookingPolicy: { ...hotsiteServiceBookingDefaults.bookingPolicy, recurrenceEligible: true },
    resourceRequirements,
  });
}

function recap(
  target: ReturnType<typeof service>,
  options: HotsiteServiceResourceOptionsRequirement[] | undefined,
) {
  const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
    <NextIntlClientProvider locale="pt-BR" messages={ptBR as never}>
      {children}
    </NextIntlClientProvider>
  );
  const { result } = renderHook(
    () => buildResourceRecap(target, DRAFT, options, useRequirementText()),
    { wrapper },
  );
  return result.current;
}

describe('buildResourceRecap', () => {
  it('lists a service with no requirement with no row', () => {
    expect(recap(service([]), undefined)).toEqual([]);
  });

  it('lists the default location, which never had a row, with no row either', () => {
    expect(recap(service([storedLocationRequirement()]), undefined)).toEqual([]);
  });

  it('names the picked resource under the single "Recurso" title', () => {
    expect(recap(service([choiceRequirement('STAFF')]), OPTIONS)).toEqual([
      { key: 'choice-STAFF', label: 'Recurso', value: 'Dra. Lia' },
    ]);
  });

  it('lists nothing for a pick whose options have not loaded', () => {
    expect(recap(service([choiceRequirement('STAFF')]), undefined)).toEqual([]);
  });

  it('does not list a lone automatic requirement: it never had a row on the form', () => {
    expect(recap(service([autoRequirement('ROOM')]), OPTIONS)).toEqual([]);
  });

  it('in a bundle lists the pick by its resource type and the automatic one as chosen every week', () => {
    const rows = recap(service([choiceRequirement('STAFF'), autoRequirement('ROOM')]), OPTIONS);

    expect(rows.map((row) => row.key)).toEqual(['choice-STAFF', 'auto-ROOM']);
    expect(rows[0]).toMatchObject({ value: 'Dra. Lia' });
    expect(rows[1]!.label).not.toBe('Recurso');
    expect(rows[1]!.value.length).toBeGreaterThan(0);
  });
});
