import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Linter } from 'eslint';

const backendRoot = resolve(__dirname, '../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec — see
// persistence-boundary.eslint.spec.ts for why (Linter.verify() runs the same config array
// without Jest's dynamic-import gap).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(backendRoot, 'eslint.config.js')) as Linter.Config[];

const REPOSITORY_PATH =
  'src/contexts/staff/infrastructure/repositories/typeorm-example.repository.ts';
const USE_CASE_PATH = 'src/contexts/staff/application/use-cases/example.use-case.ts';

describe('TD54-S4 unescaped LIKE/ILIKE pattern ban', () => {
  const eslint = new Linter({ configType: 'flat' });

  function likePatternMessages(source: string, filePath = REPOSITORY_PATH) {
    return eslint
      .verify(source, productionConfig, filePath)
      .filter((message) => message.message.includes('LIKE wildcard'));
  }

  describe.each([
    ['repository adapter', REPOSITORY_PATH],
    ['use case (Tier S1)', USE_CASE_PATH],
  ])('in a %s', (_label, filePath) => {
    it.each([
      ['a template with % on both edges', 'const p = `%${term}%`;'],
      ['a prefix-only template', 'const p = `%${term}`;'],
      ['a suffix-only template', 'const p = `${term}%`;'],
      ["'%' + x + '%' concatenation", "const p = '%' + term + '%';"],
      ["a prefix-only '%' + x concatenation", "const p = '%' + term;"],
      ["a suffix-only x + '%' concatenation", "const p = term + '%';"],
      [
        'a ternary-nested call (not a direct escapeLikePattern call)',
        'const p = `%${term ? escapeLikePattern(term) : other}%`;',
      ],
      ['a logical-nested call', 'const p = `%${escapeLikePattern(term) ?? other}%`;'],
      ['a computed-literal member call', "const p = `%${helpers['escapeLikePattern'](term)}%`;"],
      ['a member call', 'const p = `%${helpers.escapeLikePattern(term)}%`;'],
      ['a bare call to another function', 'const p = `%${normalize(term)}%`;'],
      ['an unescaped value beside an escaped one', 'const p = `%${escapeLikePattern(a)}${b}%`;'],
    ])('rejects %s', (_name, source) => {
      expect(likePatternMessages(source, filePath).length).toBeGreaterThanOrEqual(1);
    });

    it.each([
      ['a template with % on both edges', 'const p = `%${escapeLikePattern(term)}%`;'],
      ['a prefix-only template', 'const p = `%${escapeLikePattern(term)}`;'],
      ['a suffix-only template', 'const p = `${escapeLikePattern(term)}%`;'],
      ["'%' + x + '%' concatenation", "const p = '%' + escapeLikePattern(term) + '%';"],
      ["a prefix-only '%' + x concatenation", "const p = '%' + escapeLikePattern(term);"],
      ["a suffix-only x + '%' concatenation", "const p = escapeLikePattern(term) + '%';"],
    ])('passes %s when the value is a direct escapeLikePattern() call', (_name, source) => {
      expect(likePatternMessages(source, filePath)).toEqual([]);
    });

    it('does not flag a literal-only % string or a template without a value', () => {
      expect(likePatternMessages("const p = '100%';", filePath)).toEqual([]);
      expect(likePatternMessages('const p = `100%`;', filePath)).toEqual([]);
      expect(likePatternMessages("const p = '%' + '%';", filePath)).toEqual([]);
    });

    it('does not flag a template whose % is not at an edge', () => {
      expect(likePatternMessages('const p = `a%${term}b`;', filePath)).toEqual([]);
    });
  });

  it('exempts *.spec.ts files', () => {
    expect(likePatternMessages('const p = `%${term}%`;', 'src/example.spec.ts')).toEqual([]);
  });

  it('needs no exemption for the escape helper itself', () => {
    const helper = readFileSync(
      resolve(backendRoot, 'src/shared/utils/escape-like-pattern.ts'),
      'utf8',
    );

    expect(likePatternMessages(helper, 'src/shared/utils/escape-like-pattern.ts')).toEqual([]);
  });
});
