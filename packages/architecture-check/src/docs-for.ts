// `docs-for`: which docs describe a file, a git range or a tag. Same matcher as the
// `doc-orientation` detector (doc-tags.ts), so /docs-audit and /mark-done get a deterministic answer
// instead of guessing from the policy JSON.
//
//   docs-for --file <path…>      tags of each file, then the docs carrying them
//   docs-for --range <a>..<b>    the same for every file changed in a git range
//   docs-for --tag <name…>       the docs carrying a tag
//   --json                       machine-readable output
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  docsForFiles,
  docsForTags,
  isOrientationDoc,
  parseDocHeader,
  type DocOrientationPolicy,
  type DocsForResult,
  type DocTagIndexEntry,
} from './doc-tags';

export interface DocsForIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = 'usage: docs-for (--file <path…> | --range <a>..<b> | --tag <name…>) [--json]';

function git(rootDir: string, args: string[]): string[] {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

function loadPolicy(rootDir: string): DocOrientationPolicy {
  const raw = JSON.parse(
    readFileSync(resolve(rootDir, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
  ) as { docOrientation?: DocOrientationPolicy };
  if (!raw.docOrientation) throw new Error('The architecture policy must define docOrientation.');
  return raw.docOrientation;
}

function buildIndex(
  rootDir: string,
  policy: DocOrientationPolicy,
  files: string[],
): DocTagIndexEntry[] {
  return files
    .filter((file) => isOrientationDoc(file) && existsSync(resolve(rootDir, file)))
    .map((file) => ({
      path: file,
      tags:
        parseDocHeader(readFileSync(resolve(rootDir, file), 'utf8'), policy.headerLines).tags
          ?.value ?? [],
    }));
}

function parse(argv: string[]): {
  mode: 'file' | 'range' | 'tag';
  values: string[];
  json: boolean;
} {
  const json = argv.includes('--json');
  const rest = argv.filter((arg) => arg !== '--json');
  const [flag, ...values] = rest;
  if (flag === '--file' || flag === '--range' || flag === '--tag') {
    if (values.length === 0 || (flag === '--range' && values.length !== 1)) {
      throw new Error(USAGE);
    }
    return { mode: flag.slice(2) as 'file' | 'range' | 'tag', values, json };
  }
  throw new Error(USAGE);
}

function render(result: DocsForResult): string {
  const lines = result.docs.map((doc) => `${doc.kind} ${doc.path} [${doc.tags.join(', ')}]`);
  for (const file of result.unmapped) lines.push(`unmapped ${file}`);
  return lines.length > 0 ? `${lines.join('\n')}\n` : 'no docs\n';
}

// Returns the process exit code: 0 on success, 2 on a usage or input error.
export function runDocsFor(argv: string[], rootDir: string, io: DocsForIo): number {
  try {
    const { mode, values, json } = parse(argv);
    const policy = loadPolicy(rootDir);
    const files = git(rootDir, ['ls-files', '--cached', '--others', '--exclude-standard']);
    const index = buildIndex(rootDir, policy, files);

    let result: DocsForResult;
    if (mode === 'tag') {
      const unknown = values.filter((tag) => !policy.tags[tag]);
      if (unknown.length > 0) {
        throw new Error(
          `Unknown tag ${unknown.join(', ')}. Known tags: ${Object.keys(policy.tags).join(', ')}.`,
        );
      }
      result = { docs: docsForTags(values, index, policy), unmapped: [] };
    } else {
      const changed = mode === 'range' ? git(rootDir, ['diff', '--name-only', values[0]]) : values;
      result = docsForFiles(changed, index, policy);
    }
    io.stdout(json ? `${JSON.stringify(result, null, 2)}\n` : render(result));
    return 0;
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return 2;
  }
}

if (require.main === module) {
  const rootDir = resolve(__dirname, '../../..');
  process.exitCode = runDocsFor(process.argv.slice(2), rootDir, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
