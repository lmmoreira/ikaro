/**
 * Generalizes the recursive-key-parity pattern already CI-enforced for
 * error codes (see `error-codes-exhaustiveness.spec.ts`) to any nested
 * locale JSON tree: `notifications.json`, `web.json`, `email-tables.json`,
 * and `errors.json` itself. Every leaf across these files is a string;
 * none contain arrays (verified during TD37 Story 12 discovery).
 */
export type LocaleTree = { [key: string]: string | LocaleTree };

export interface LocaleKeyParityDiff {
  /** Dot-separated key paths present in `a` but missing from `b`. */
  onlyInA: string[];
  /** Dot-separated key paths present in `b` but missing from `a`. */
  onlyInB: string[];
}

function collectKeyPaths(tree: LocaleTree, prefix: string): Set<string> {
  const paths = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      paths.add(path);
    } else {
      for (const nested of collectKeyPaths(value, path)) {
        paths.add(nested);
      }
    }
  }
  return paths;
}

/**
 * Recursively diffs two locale JSON trees by key path, in both directions.
 * An empty result (`{ onlyInA: [], onlyInB: [] }`) means the two trees
 * declare exactly the same set of leaf keys, regardless of translated value.
 */
export function diffLocaleKeys(a: LocaleTree, b: LocaleTree): LocaleKeyParityDiff {
  const aPaths = collectKeyPaths(a, '');
  const bPaths = collectKeyPaths(b, '');
  return {
    onlyInA: [...aPaths].filter((path) => !bPaths.has(path)).sort((x, y) => x.localeCompare(y)),
    onlyInB: [...bPaths].filter((path) => !aPaths.has(path)).sort((x, y) => x.localeCompare(y)),
  };
}
