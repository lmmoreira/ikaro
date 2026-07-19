/**
 * Extracts the keys wired into a `module "<name>" { ... }` block's
 * `env_vars = { ... }` (or `env_vars = merge({...}, cond ? {...} : {})`) and
 * `secret_env_vars = { ... }` maps, via balanced-brace scanning of the raw
 * HCL text — not a full HCL parser, but this repo has no HCL-parsing
 * dependency and this is a narrow, terraform-fmt normalized shape, the same
 * "scan for a known, controlled source shape" approach M17-S19's
 * pubsub-catalog scanner uses.
 *
 * Comment- and string-aware (CodeRabbit finding, 2026-07-19): `#`/`//` line
 * comments and quoted string bodies are masked to spaces (same length, so
 * offsets stay aligned with the original text) before any brace-counting or
 * key matching, so a stray `{`/`}` inside a comment (or a literal brace in a
 * string value) can never corrupt block boundaries. The one exception is the
 * module's own quoted label (`module "name" {`), which is matched against
 * the *original* text — masking would hide the very name we're looking for.
 */
export function extractModuleEnvKeys(fileContent: string, moduleName: string): string[] {
  const masked = maskCommentsAndStrings(fileContent);

  const labelMarker = new RegExp(`module\\s+"${moduleName}"\\s*\\{`);
  const labelMatch = labelMarker.exec(fileContent);
  if (!labelMatch) {
    throw new Error(`module "${moduleName}" not found`);
  }

  const moduleBlock = extractBalancedSpan(
    masked,
    labelMatch.index + labelMatch[0].length,
    '{',
    '}',
  );

  const keys = new Set<string>();
  for (const mapName of ['env_vars', 'secret_env_vars']) {
    const assignmentRegex = new RegExp(`${mapName}\\s*=\\s*(\\{|merge\\()`);
    const match = assignmentRegex.exec(moduleBlock);
    if (!match) {
      continue;
    }

    const isDirectMap = match[1] === '{';
    const startIndex = match.index + match[0].length;
    const span = isDirectMap
      ? extractBalancedSpan(moduleBlock, startIndex, '{', '}')
      : extractBalancedSpan(moduleBlock, startIndex, '(', ')');

    const objectLiteralBodies = isDirectMap ? [span] : extractTopLevelObjectLiterals(span);

    for (const body of objectLiteralBodies) {
      for (const m of body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
        keys.add(m[1]);
      }
    }
  }
  return [...keys];
}

function extractBalancedSpan(
  text: string,
  startIndex: number,
  opener: string,
  closer: string,
): string {
  let depth = 1;
  let i = startIndex;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === opener) {
      depth++;
    } else if (text[i] === closer) {
      depth--;
    }
  }

  if (depth !== 0) {
    throw new Error(`Unbalanced ${opener}${closer} while scanning`);
  }

  return text.slice(startIndex, i - 1);
}

/** Finds every top-level `{ ... }` chunk in `text` and returns each one's inner content. */
function extractTopLevelObjectLiterals(text: string): string[] {
  const bodies: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 1;
      let j = i + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') {
          depth++;
        } else if (text[j] === '}') {
          depth--;
        }
      }
      bodies.push(text.slice(i + 1, j - 1));
      i = j;
    } else {
      i++;
    }
  }
  return bodies;
}

/** Replaces `#`/`//` line comments and quoted-string bodies with spaces, preserving length/offsets. */
function maskCommentsAndStrings(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '#' || (text[i] === '/' && text[i + 1] === '/')) {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      result += ' '.repeat(stop - i);
      i = stop;
      continue;
    }

    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1;
      }
      const stop = Math.min(j + 1, text.length);
      result += ' '.repeat(stop - i);
      i = stop;
      continue;
    }

    result += text[i];
    i++;
  }
  return result;
}
