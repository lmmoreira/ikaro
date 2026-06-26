import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTodayLabel } from './format-today';

describe('formatTodayLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prepends the prefix with a space before the formatted date', () => {
    const label = formatTodayLabel('pt-BR', 'Hoje,');

    expect(label).toMatch(/^Hoje, /);
    expect(label).toContain('2026');
  });

  it('formats the date using the provided locale', () => {
    const ptLabel = formatTodayLabel('pt-BR', 'Hoje,');
    const enLabel = formatTodayLabel('en', 'Today,');

    expect(ptLabel).toContain('junho');
    expect(enLabel).toContain('June');
  });
});
