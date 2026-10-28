// The Resources tab's buffer input holds text. '' means "no override" — the service inherits the
// business default and is saved as null — and is never read as zero: '0' is an explicit
// "no prep time" override (TD51-S00).

export function bufferToField(buffer: number | null): string {
  return buffer === null ? '' : String(buffer);
}

export function fieldToBuffer(field: string): number | null {
  return field === '' ? null : Number(field);
}

export function isValidBufferField(field: string): boolean {
  if (field === '') return true;
  const parsed = Number(field);
  return Number.isInteger(parsed) && parsed >= 0;
}
