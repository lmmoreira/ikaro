'use strict';

// Turns the backend integration run's two outputs into one readable summary (TD62):
//   - `heap.ndjson`, one line per suite from scripts/integration-heap-reporter.cjs (duration and
//     the heap the worker held after the suite; survives a worker that dies out of memory);
//   - `jest.json`, Jest's own `--json --outputFile` (the run's totals and the test names).
// Either file may be missing or partial: a crashed run still produces what it recorded.
//
//   node scripts/integration-report.cjs [--heap <file>] [--jest <file>] [--top <n>] [--list]
//
// In CI (`GITHUB_STEP_SUMMARY` set) the markdown view is also appended to the job summary.
// It never fails the job: a missing input prints a note and exits 0.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TOP = 15;
const DEFAULT_HEAP_FILE = path.join('integration-report', 'heap.ndjson');
const DEFAULT_JEST_FILE = path.join('integration-report', 'jest.json');

function normalizeSuitePath(suitePath) {
  const match = /(?:^|\/)(apps\/.*)$/.exec(suitePath.replaceAll('\\', '/'));
  return match ? match[1] : suitePath;
}

function parseHeapEntries(text) {
  const entries = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      skipped += 1;
    }
  }
  return { entries, skipped };
}

function suitesFromHeap(entries) {
  return entries.map((entry, index) => ({
    order: index + 1,
    path: normalizeSuitePath(entry.path),
    durationMs: entry.durationMs,
    heapMB: typeof entry.heapMB === 'number' ? entry.heapMB : null,
    status: entry.status,
    tests: (entry.passed || 0) + (entry.failed || 0) + (entry.skipped || 0),
  }));
}

function suitesFromJest(jestReport) {
  return (jestReport.testResults || []).map((result, index) => ({
    order: index + 1,
    path: normalizeSuitePath(result.name),
    durationMs: result.endTime - result.startTime,
    heapMB: null,
    status: result.status === 'passed' ? 'passed' : 'failed',
    tests: (result.assertionResults || []).length,
  }));
}

function totalsFrom(suites, jestReport) {
  if (jestReport) {
    return {
      source: 'jest',
      suites: jestReport.numTotalTestSuites,
      failedSuites: jestReport.numFailedTestSuites,
      tests: jestReport.numTotalTests,
      failedTests: jestReport.numFailedTests,
      skippedTests: (jestReport.numPendingTests || 0) + (jestReport.numTodoTests || 0),
    };
  }
  return {
    source: 'heap',
    suites: suites.length,
    failedSuites: suites.filter((suite) => suite.status === 'failed').length,
    tests: suites.reduce((sum, suite) => sum + suite.tests, 0),
    failedTests: null,
    skippedTests: null,
  };
}

function heapFigures(suites) {
  const withHeap = suites.filter((suite) => suite.heapMB !== null);
  if (withHeap.length === 0) {
    return { first: null, last: null, peak: null, growthPerSuite: null, count: 0 };
  }
  const first = withHeap[0];
  const last = withHeap[withHeap.length - 1];
  const growthPerSuite =
    withHeap.length > 1 ? (last.heapMB - first.heapMB) / (withHeap.length - 1) : null;
  return {
    first,
    last,
    peak: withHeap.reduce((best, suite) => (suite.heapMB > best.heapMB ? suite : best)),
    growthPerSuite: growthPerSuite === null ? null : Math.round(growthPerSuite * 10) / 10,
    count: withHeap.length,
  };
}

function buildSummary({
  heapEntries = [],
  skippedLines = 0,
  jestReport = null,
  top = DEFAULT_TOP,
}) {
  const suites = heapEntries.length > 0 ? suitesFromHeap(heapEntries) : [];
  const ordered = suites.length > 0 ? suites : jestReport ? suitesFromJest(jestReport) : [];
  return {
    totals: totalsFrom(ordered, jestReport),
    skippedLines,
    totalDurationMs: ordered.reduce((sum, suite) => sum + suite.durationMs, 0),
    slowest: [...ordered].sort((a, b) => b.durationMs - a.durationMs).slice(0, top),
    heaviest: ordered
      .filter((suite) => suite.heapMB !== null)
      .sort((a, b) => b.heapMB - a.heapMB)
      .slice(0, top),
    heap: heapFigures(ordered),
    failed: ordered.filter((suite) => suite.status === 'failed').map((suite) => suite.path),
    suitePaths: ordered.map((suite) => suite.path).sort(),
  };
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

function heapText(suite) {
  return suite.heapMB === null ? 'n/a' : `${suite.heapMB} MB`;
}

function renderTable(rows, markdown) {
  if (markdown) {
    return [
      '| # | Suite | Time | Heap after |',
      '|---|---|---|---|',
      ...rows.map(
        (suite) =>
          `| ${suite.order} | \`${suite.path}\` | ${seconds(suite.durationMs)} | ${heapText(suite)} |`,
      ),
    ];
  }
  return rows.map(
    (suite) =>
      `  ${String(suite.order).padStart(3)}  ${seconds(suite.durationMs).padStart(8)}  ${heapText(suite).padStart(8)}  ${suite.path}`,
  );
}

function renderHeapLine(heap) {
  if (heap.count === 0) {
    return 'Heap: no per-suite figures (the run did not use --logHeapUsage).';
  }
  const growth =
    heap.growthPerSuite === null ? '' : `, +${heap.growthPerSuite} MB per suite on average`;
  return (
    `Heap after the first suite ${heap.first.heapMB} MB, after the last ${heap.last.heapMB} MB ` +
    `(suite ${heap.last.order}), peak ${heap.peak.heapMB} MB (suite ${heap.peak.order})${growth}.`
  );
}

function renderSummary(summary, { markdown = false, top = DEFAULT_TOP } = {}) {
  const { totals, heap } = summary;
  const heading = markdown ? '## ' : '';
  const sub = markdown ? '### ' : '';
  const lines = [
    `${heading}Backend integration run`,
    '',
    `Suites: ${totals.suites ?? 'n/a'} (${totals.failedSuites ?? 'n/a'} failed) · ` +
      `tests: ${totals.tests ?? 'n/a'}` +
      (totals.failedTests === null ? '' : ` (${totals.failedTests} failed)`) +
      ` · suite time: ${seconds(summary.totalDurationMs)} · totals from ${totals.source}`,
    renderHeapLine(heap),
  ];
  if (summary.skippedLines > 0) {
    lines.push(`Note: ${summary.skippedLines} unreadable line(s) skipped in the heap file.`);
  }
  if (summary.failed.length > 0) {
    lines.push('', `${sub}Failed suites`, ...summary.failed.map((suitePath) => `- ${suitePath}`));
  }
  if (summary.slowest.length === 0) {
    lines.push('', 'No suite results were recorded.');
    return lines.join('\n');
  }
  lines.push('', `${sub}${top} slowest suites`, '', ...renderTable(summary.slowest, markdown));
  if (summary.heaviest.length > 0) {
    lines.push(
      '',
      `${sub}${top} suites with the most heap held after them`,
      '',
      ...renderTable(summary.heaviest, markdown),
    );
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    heapFile: DEFAULT_HEAP_FILE,
    jestFile: DEFAULT_JEST_FILE,
    top: DEFAULT_TOP,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--heap') options.heapFile = argv[++index];
    else if (flag === '--jest') options.jestFile = argv[++index];
    else if (flag === '--top') options.top = Number(argv[++index]);
    else if (flag === '--list') options.list = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(options.top) || options.top < 1) {
    throw new Error('--top needs a positive integer');
  }
  return options;
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function readJestReport(file) {
  const text = readIfPresent(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function main(argv, env, write) {
  const options = parseArgs(argv);
  const heapText = readIfPresent(options.heapFile);
  const { entries, skipped } =
    heapText === null ? { entries: [], skipped: 0 } : parseHeapEntries(heapText);
  const summary = buildSummary({
    heapEntries: entries,
    skippedLines: skipped,
    jestReport: readJestReport(options.jestFile),
    top: options.top,
  });
  write(renderSummary(summary, { top: options.top }));
  if (options.list) {
    write(
      `\nSuite paths (${summary.suitePaths.length}, sorted):\n${summary.suitePaths.join('\n')}`,
    );
  }
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `${renderSummary(summary, { markdown: true, top: options.top })}\n`,
    );
  }
  return summary;
}

module.exports = {
  buildSummary,
  main,
  normalizeSuitePath,
  parseArgs,
  parseHeapEntries,
  renderSummary,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2), process.env, (text) => console.log(text));
  } catch (error) {
    console.error(`integration-report: ${error.message}`);
    process.exitCode = 1;
  }
}
