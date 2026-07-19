/**
 * Extracts the keys wired into a `module "<name>" { ... }` block's
 * `env_vars = { ... }` and `secret_env_vars = { ... }` maps, via balanced-
 * brace scanning of the raw HCL text — not a full HCL parser, but this repo
 * has no HCL-parsing dependency and this is a narrow, terraform-fmt
 * normalized shape (a flat `KEY = value` map), the same "scan for a known,
 * controlled source shape" approach M17-S19's pubsub-catalog scanner uses.
 */
export function extractModuleEnvKeys(fileContent: string, moduleName: string): string[] {
  const moduleBlock = extractBalancedBlock(
    fileContent,
    new RegExp(`module\\s+"${moduleName}"\\s*\\{`),
  );
  if (moduleBlock === null) {
    throw new Error(`module "${moduleName}" not found`);
  }

  const keys = new Set<string>();
  for (const mapName of ['env_vars', 'secret_env_vars']) {
    const mapBlock = extractBalancedBlock(moduleBlock, new RegExp(`${mapName}\\s*=\\s*\\{`));
    if (mapBlock === null) {
      continue;
    }
    for (const match of mapBlock.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

function extractBalancedBlock(text: string, openMarker: RegExp): string | null {
  const match = openMarker.exec(text);
  if (!match) {
    return null;
  }

  const startIndex = match.index + match[0].length;
  let depth = 1;
  let i = startIndex;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
    }
  }

  if (depth !== 0) {
    throw new Error(`Unbalanced braces scanning for ${openMarker.source}`);
  }

  return text.slice(startIndex, i - 1);
}
