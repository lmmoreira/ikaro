const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildSummary,
  main,
  normalizeSuitePath,
  parseArgs,
  parseHeapEntries,
  renderSummary,
} = require('./integration-report.cjs');
const IntegrationHeapReporter = require('./integration-heap-reporter.cjs');

function entry(name, durationMs, heapMB, extra = {}) {
  return {
    path: `/repo/apps/backend/src/${name}.integration.spec.ts`,
    durationMs,
    heapMB,
    status: 'passed',
    passed: 2,
    failed: 0,
    skipped: 0,
    ...extra,
  };
}

function ndjson(entries) {
  return entries.map((item) => JSON.stringify(item)).join('\n') + '\n';
}

test('ranks the slowest suites first and keeps the run order in `order`', () => {
  const summary = buildSummary({
    heapEntries: [entry('a', 1000, 100), entry('b', 9000, 200), entry('c', 4000, 300)],
    top: 2,
  });
  assert.deepEqual(
    summary.slowest.map((suite) => [suite.path, suite.order]),
    [
      ['apps/backend/src/b.integration.spec.ts', 2],
      ['apps/backend/src/c.integration.spec.ts', 3],
    ],
  );
});

test('reports the heap series: first, last, peak and the average growth per suite', () => {
  const summary = buildSummary({
    heapEntries: [entry('a', 1, 100), entry('b', 1, 400), entry('c', 1, 250), entry('d', 1, 300)],
  });
  assert.equal(summary.heap.first.heapMB, 100);
  assert.equal(summary.heap.last.heapMB, 300);
  assert.equal(summary.heap.peak.heapMB, 400);
  assert.equal(summary.heap.peak.order, 2);
  assert.equal(summary.heap.growthPerSuite, 66.7);
  assert.deepEqual(
    summary.heaviest.map((suite) => suite.heapMB),
    [400, 300, 250, 100],
  );
});

test('a suite without a heap figure is listed by time but never by heap', () => {
  const summary = buildSummary({ heapEntries: [entry('a', 5, null), entry('b', 1, 120)] });
  assert.equal(summary.heaviest.length, 1);
  assert.equal(summary.heap.count, 1);
  assert.equal(summary.heap.growthPerSuite, null);
  assert.match(renderSummary(summary), /n\/a/);
});

test('a failing suite is named and counted', () => {
  const summary = buildSummary({
    heapEntries: [entry('a', 1, 10), entry('b', 2, 20, { status: 'failed', failed: 1 })],
  });
  assert.deepEqual(summary.failed, ['apps/backend/src/b.integration.spec.ts']);
  assert.equal(summary.totals.failedSuites, 1);
  const text = renderSummary(summary);
  assert.match(text, /Failed suites/);
  assert.match(text, /b\.integration\.spec\.ts/);
});

test('an empty report says so and does not throw', () => {
  const summary = buildSummary({});
  assert.equal(summary.totals.suites, 0);
  assert.equal(summary.heap.count, 0);
  assert.match(renderSummary(summary), /No suite results were recorded/);
  assert.match(renderSummary(summary), /did not use --logHeapUsage/);
});

test('totals come from the Jest report when present, from the heap file otherwise', () => {
  const heapEntries = [entry('a', 1, 10), entry('b', 1, 20)];
  const jestReport = {
    numTotalTestSuites: 169,
    numFailedTestSuites: 0,
    numTotalTests: 1793,
    numFailedTests: 0,
    numPendingTests: 1,
    numTodoTests: 2,
    testResults: [],
  };
  assert.deepEqual(buildSummary({ heapEntries, jestReport }).totals, {
    source: 'jest',
    suites: 169,
    failedSuites: 0,
    tests: 1793,
    failedTests: 0,
    skippedTests: 3,
  });
  const fromHeap = buildSummary({ heapEntries }).totals;
  assert.equal(fromHeap.source, 'heap');
  assert.equal(fromHeap.suites, 2);
  assert.equal(fromHeap.tests, 4);
});

test('a run that died before writing heap data still reports from the Jest file', () => {
  const jestReport = {
    numTotalTestSuites: 1,
    numFailedTestSuites: 0,
    numTotalTests: 1,
    numFailedTests: 0,
    testResults: [
      {
        name: '/repo/apps/backend/src/x.integration.spec.ts',
        startTime: 1000,
        endTime: 3500,
        status: 'passed',
        assertionResults: [{}],
      },
    ],
  };
  const summary = buildSummary({ jestReport });
  assert.equal(summary.slowest[0].durationMs, 2500);
  assert.equal(summary.slowest[0].heapMB, null);
});

test('the sorted suite list is the coverage baseline', () => {
  const summary = buildSummary({ heapEntries: [entry('b', 1, 1), entry('a', 1, 1)] });
  assert.deepEqual(summary.suitePaths, [
    'apps/backend/src/a.integration.spec.ts',
    'apps/backend/src/b.integration.spec.ts',
  ]);
});

test('normalizeSuitePath keeps the repo-relative path and leaves other paths alone', () => {
  assert.equal(
    normalizeSuitePath('/home/runner/work/ikaro/ikaro/apps/backend/src/a.spec.ts'),
    'apps/backend/src/a.spec.ts',
  );
  assert.equal(normalizeSuitePath('C:\\w\\apps\\backend\\a.spec.ts'), 'apps/backend/a.spec.ts');
  assert.equal(normalizeSuitePath('/elsewhere/a.spec.ts'), '/elsewhere/a.spec.ts');
});

test('parseHeapEntries skips a torn last line from a killed worker and counts it', () => {
  const text = ndjson([entry('a', 1, 10)]) + '{"path":"/repo/apps/backend/src/b.integr';
  const { entries, skipped } = parseHeapEntries(text);
  assert.equal(entries.length, 1);
  assert.equal(skipped, 1);
});

test('parseArgs rejects an unknown flag and a bad --top', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
  assert.throws(() => parseArgs(['--top', '0']), /positive integer/);
  assert.equal(parseArgs(['--top', '3', '--list']).list, true);
});

test('main prints the summary, appends markdown to the job summary and tolerates missing files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-report-'));
  const heapFile = path.join(dir, 'heap.ndjson');
  const jobSummary = path.join(dir, 'summary.md');
  fs.writeFileSync(heapFile, ndjson([entry('a', 2000, 111), entry('b', 500, 222)]));

  const printed = [];
  main(
    ['--heap', heapFile, '--jest', path.join(dir, 'missing.json'), '--list'],
    { GITHUB_STEP_SUMMARY: jobSummary },
    (text) => printed.push(text),
  );
  assert.match(printed.join('\n'), /Suites: 2 .*totals from heap/);
  assert.match(printed.join('\n'), /Suite paths \(2, sorted\)/);
  const markdown = fs.readFileSync(jobSummary, 'utf8');
  assert.match(markdown, /^## Backend integration run/);
  assert.match(
    markdown,
    /\| 1 \| `apps\/backend\/src\/a\.integration\.spec\.ts` \| 2\.0 s \| 111 MB \|/,
  );

  const none = [];
  main(['--heap', path.join(dir, 'nope'), '--jest', path.join(dir, 'nope2')], {}, (text) =>
    none.push(text),
  );
  assert.match(none.join('\n'), /No suite results were recorded/);
});

test('the heap reporter writes one line per suite and truncates on a new run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-heap-'));
  const file = path.join(dir, 'nested', 'heap.ndjson');
  const reporter = new IntegrationHeapReporter({}, { outputFile: file });
  reporter.onRunStart();
  reporter.onTestResult(
    {},
    {
      testFilePath: '/repo/apps/backend/src/a.integration.spec.ts',
      perfStats: { start: 1000, end: 4200 },
      memoryUsage: 300 * 1024 * 1024,
      numPassingTests: 3,
      numFailingTests: 0,
      numPendingTests: 1,
      numTodoTests: 0,
    },
  );
  reporter.onTestResult(
    {},
    {
      testFilePath: '/repo/apps/backend/src/b.integration.spec.ts',
      perfStats: { start: 4200, end: 5000 },
      numPassingTests: 0,
      numFailingTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testExecError: { message: 'boom' },
    },
  );
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines[0], {
    path: '/repo/apps/backend/src/a.integration.spec.ts',
    durationMs: 3200,
    heapMB: 300,
    status: 'passed',
    passed: 3,
    failed: 0,
    skipped: 1,
  });
  assert.equal(lines[1].status, 'failed');
  assert.equal(lines[1].heapMB, null);

  reporter.onRunStart();
  assert.equal(fs.readFileSync(file, 'utf8'), '');
});
