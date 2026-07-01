export function normalizeText(value: string): string {
  return value.trim();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
