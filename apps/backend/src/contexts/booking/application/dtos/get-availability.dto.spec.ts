import { GetAvailabilitySchema } from './get-availability.dto';
import { GetAvailabilitySummarySchema } from './get-availability-summary.dto';

const serviceId = '0198a000-0000-7000-8000-000000000001';
const resourceId = '0198a000-0000-7000-8000-000000000002';
const selections = `${serviceId}:-:STAFF:${resourceId}`;

describe('availability query schemas (M23-S29)', () => {
  describe.each([
    ['GetAvailabilitySchema', GetAvailabilitySchema, { date: '2030-01-07' }],
    [
      'GetAvailabilitySummarySchema',
      GetAvailabilitySummarySchema,
      { from: '2030-01-07', to: '2030-01-09' },
    ],
  ])('%s', (_name, schema, range) => {
    const base = { ...range, serviceIds: serviceId };

    it('parses resourceSelections and durationMinutes from the query strings', () => {
      const result = schema.safeParse({
        ...base,
        resourceSelections: selections,
        durationMinutes: '90',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        durationMinutes: 90,
        resourceSelections: [{ serviceId, legIndex: null, resourceType: 'STAFF', resourceId }],
      });
    });

    it('is unchanged when neither new param is sent', () => {
      const result = schema.safeParse(base);

      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('resourceSelections');
      expect(result.data).not.toHaveProperty('durationMinutes');
    });

    it('rejects resourceId together with resourceSelections', () => {
      const result = schema.safeParse({ ...base, resourceId, resourceSelections: selections });

      expect(result.success).toBe(false);
    });

    it('rejects a malformed resourceSelections item and a non-positive duration', () => {
      expect(schema.safeParse({ ...base, resourceSelections: 'nope' }).success).toBe(false);
      expect(schema.safeParse({ ...base, durationMinutes: '0' }).success).toBe(false);
    });
  });
});
