const ENTITY_FILE = /contexts\/([^/]+)\/infrastructure\/entities\/.*\.entity\.ts$/;
const SHARED_ENTITY_FILE = /shared\/infrastructure\/[^/]+\/.*\.entity\.ts$/;

// Single source of truth for "which src/test/builders/<context>/ directory does this entity's
// builder belong in" — shared by every detector that needs it, so they can't silently disagree
// about the same fact (a bug found by PR #393 review: entity-builder-pk-default.ts originally
// matched a builder by name only, with no context check, while test-builder-coverage.ts required
// the correct context — the two rules could pass/fail the same entity inconsistently).
export function contextFromEntityPath(filePath: string): string | undefined {
  const match = ENTITY_FILE.exec(filePath);
  if (match) return match[1];
  return SHARED_ENTITY_FILE.test(filePath) ? 'shared' : undefined;
}
