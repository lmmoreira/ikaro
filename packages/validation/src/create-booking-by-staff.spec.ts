import { CreateBookingByStaffSchema } from './booking';

const SERVICE_ID = '30000000-0000-4000-8000-000000000391';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000391';

const base = {
  scheduledAt: '2026-12-15T10:00:00.000Z',
  serviceIds: [SERVICE_ID],
};
const guest = {
  contactName: 'Pessoa Nova',
  contactPhone: '+5531977777777',
  contactEmail: 'nova@example.com',
};

describe('CreateBookingByStaffSchema', () => {
  it('accepts a customer booking', () => {
    expect(CreateBookingByStaffSchema.safeParse({ ...base, customerId: CUSTOMER_ID }).success).toBe(
      true,
    );
  });

  it('accepts a guest booking with the full contact trio', () => {
    expect(CreateBookingByStaffSchema.safeParse({ ...base, ...guest }).success).toBe(true);
  });

  it('accepts the optional booking-flow fields on either shape', () => {
    const optional = {
      notes: 'Cliente ligou',
      durationMinutes: 45,
      participantCount: 2,
      consentAccepted: true,
      resourceSelections: [],
    };

    expect(
      CreateBookingByStaffSchema.safeParse({ ...base, customerId: CUSTOMER_ID, ...optional })
        .success,
    ).toBe(true);
    expect(CreateBookingByStaffSchema.safeParse({ ...base, ...guest, ...optional }).success).toBe(
      true,
    );
  });

  it.each([
    ['both customerId and a contact field', { ...base, customerId: CUSTOMER_ID, ...guest }],
    [
      'customerId with just one contact field',
      { ...base, customerId: CUSTOMER_ID, contactName: 'X' },
    ],
    ['neither customerId nor a contact', base],
    ['a contact without the phone', { ...base, contactName: 'X', contactEmail: 'x@example.com' }],
    ['a contact without the email', { ...base, contactName: 'X', contactPhone: '+5531977777777' }],
    ['a contact without the name', { ...base, ...guest, contactName: undefined }],
    ['a non-uuid customerId', { ...base, customerId: 'not-a-uuid' }],
    ['a phone that is not E.164', { ...base, ...guest, contactPhone: '31977777777' }],
    ['an empty service list', { ...base, customerId: CUSTOMER_ID, serviceIds: [] }],
    ['an invalid scheduledAt', { ...base, customerId: CUSTOMER_ID, scheduledAt: 'tomorrow' }],
  ])('rejects %s', (_label, body) => {
    expect(CreateBookingByStaffSchema.safeParse(body).success).toBe(false);
  });

  // Negative guarantees: the staff flow collects no photos, and the acting staff id is the request
  // context's, never the body's.
  it.each(['beforeServicePhotoUrls', 'createdByStaffId', 'approvedBy', 'status', 'type'])(
    'rejects an unknown %s key on both shapes',
    (key) => {
      const value = key === 'beforeServicePhotoUrls' ? [] : CUSTOMER_ID;

      expect(
        CreateBookingByStaffSchema.safeParse({ ...base, customerId: CUSTOMER_ID, [key]: value })
          .success,
      ).toBe(false);
      expect(
        CreateBookingByStaffSchema.safeParse({ ...base, ...guest, [key]: value }).success,
      ).toBe(false);
    },
  );
});
