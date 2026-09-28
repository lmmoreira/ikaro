import { ListBookingsSchema } from './list-bookings.dto';

describe('ListBookingsSchema', () => {
  describe('from / to', () => {
    it.each(['2026-08-16', '2026-02-28', '2028-02-29', '2026-08-16T00:00:00.000Z'])(
      'accepts %s as a date key or an instant, unchanged',
      (value) => {
        const result = ListBookingsSchema.safeParse({ from: value, to: value });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ from: value, to: value });
      },
    );

    it.each(['2026-02-30', '2026-13-01', '2026-08-32', '2027-02-29', 'yesterday', '16/08/2026'])(
      'rejects %s',
      (value) => {
        expect(ListBookingsSchema.safeParse({ from: value }).success).toBe(false);
        expect(ListBookingsSchema.safeParse({ to: value }).success).toBe(false);
      },
    );

    it('keeps both optional', () => {
      const result = ListBookingsSchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ limit: 25, offset: 0 });
      expect(result.data?.from).toBeUndefined();
      expect(result.data?.to).toBeUndefined();
    });
  });
});
