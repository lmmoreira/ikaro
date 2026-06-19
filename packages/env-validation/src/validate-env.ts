import type { ZodType } from 'zod';

// Called by ConfigModule.forRoot({ validate }) at startup. Throws (rather than
// process.exit) so Test.createTestingModule(...).compile() surfaces a catchable
// rejection instead of killing the Jest worker — NestFactory.create() still hard-exits
// on a fatal bootstrap error regardless, via its own exceptions-zone handling.
export function validateEnvWithSchema<T>(schema: ZodType<T>, config: Record<string, unknown>): T {
  const result = schema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`ENV validation failed:\n${errors}`);
  }

  return result.data;
}
