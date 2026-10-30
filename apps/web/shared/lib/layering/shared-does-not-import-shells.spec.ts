import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Negative guarantee: `shared/` is the cross-cutting layer and `shells/` composes domain slices on
// top of it (.copilot/context.md §11), so a `shared/` file that imports from a shell inverts the
// dependency. It holds by construction — neither dependency-cruiser nor ESLint has a rule for it,
// so nothing else would notice a regression.
const SHARED_DIR = join(__dirname, '..', '..');
const SHELL_IMPORT = /from\s+['"](?:@\/shells\/|(?:\.\.\/)+shells\/)|import\(\s*['"]@\/shells\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.spec\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('shared/ layering', () => {
  it('scans the shared sources it is meant to guard', () => {
    expect(sourceFiles(SHARED_DIR).length).toBeGreaterThan(50);
  });

  it('imports nothing from shells/', () => {
    const violations = sourceFiles(SHARED_DIR).filter((file) =>
      SHELL_IMPORT.test(readFileSync(file, 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it.each([
    "import { X } from '@/shells/dashboard/utils/mobile-action-bar';",
    'import { X } from "@/shells/hotsite/components/Y";',
    "import { X } from '../../../shells/dashboard/model/z';",
    "const mod = await import('@/shells/dashboard/model/z');",
  ])('recognises the shell import %s', (line) => {
    expect(SHELL_IMPORT.test(line)).toBe(true);
  });

  it.each([
    "import { X } from '@/shared/components/ui/card';",
    "import { X } from '@/features/booking/api/services';",
    "// shells/ composes the shared layer, see docs'",
  ])('does not flag %s', (line) => {
    expect(SHELL_IMPORT.test(line)).toBe(false);
  });
});
