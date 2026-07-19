import { extractSchemaKeysFromSource } from './schema-keys';

describe('extractSchemaKeysFromSource', () => {
  it('extracts every top-level key from a schema = z.object({ ... }) declaration', () => {
    const source = `
      const schema = z.object({
        FOO: z.string(),
        BAR: z.coerce.number().default(1),
        BAZ: z.enum(['a', 'b']).optional(),
      });
    `;

    expect(extractSchemaKeysFromSource(source)).toEqual(['FOO', 'BAR', 'BAZ']);
  });

  it('ignores unrelated variables named differently', () => {
    const source = `
      const notSchema = z.object({ IGNORED: z.string() });
      const schema = z.object({ REAL: z.string() });
    `;

    expect(extractSchemaKeysFromSource(source)).toEqual(['REAL']);
  });

  it('throws when no schema declaration exists', () => {
    const source = `const somethingElse = z.object({ FOO: z.string() });`;

    expect(() => extractSchemaKeysFromSource(source)).toThrow(/No "schema/);
  });

  it('handles a single-property schema', () => {
    const source = `const schema = z.object({ ONLY: z.string() });`;

    expect(extractSchemaKeysFromSource(source)).toEqual(['ONLY']);
  });
});
