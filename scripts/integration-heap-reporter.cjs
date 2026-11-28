'use strict';

// A Jest reporter that records, for every finished suite, its path, duration and the heap the
// worker held right after it (TD62). Jest's own `--json` file carries no heap: only the console
// reporter prints "N MB heap size". It is passed on the command line only
// (`--reporters default --reporters <this file>`), so jest.config.ts is not touched.
//
// One JSON line is appended per suite as it finishes, so a worker that dies out of memory
// (exit 134) still leaves the series up to the crash: the data that matters most for a crash.
// The heap value needs `--logHeapUsage`. Do not add `--expose-gc` to a full run: it makes Jest
// force a full collection after every suite, which cost about 1.2 s per suite (91 s against 141 s
// for 42 suites), while the series without it stayed within about 5% of the forced-GC one
// (TD62 Story 0 findings), because what the worker retains dominates what it has not collected.
//
// Output file: `INTEGRATION_HEAP_FILE`, else the reporter option `outputFile`, else
// `integration-report/heap.ndjson` under the working directory.

const fs = require('node:fs');
const path = require('node:path');

const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_OUTPUT = path.join('integration-report', 'heap.ndjson');

function toSuiteEntry(testResult) {
  const failed = testResult.numFailingTests > 0 || Boolean(testResult.testExecError);
  return {
    path: testResult.testFilePath,
    durationMs: testResult.perfStats.end - testResult.perfStats.start,
    heapMB:
      typeof testResult.memoryUsage === 'number'
        ? Math.round(testResult.memoryUsage / BYTES_PER_MB)
        : null,
    status: failed ? 'failed' : 'passed',
    passed: testResult.numPassingTests,
    failed: testResult.numFailingTests,
    skipped: testResult.numPendingTests + testResult.numTodoTests,
  };
}

class IntegrationHeapReporter {
  constructor(_globalConfig, options = {}) {
    this.outputFile = path.resolve(
      process.env.INTEGRATION_HEAP_FILE || options.outputFile || DEFAULT_OUTPUT,
    );
  }

  onRunStart() {
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, '');
  }

  onTestResult(_test, testResult) {
    fs.appendFileSync(this.outputFile, `${JSON.stringify(toSuiteEntry(testResult))}\n`);
  }
}

module.exports = IntegrationHeapReporter;
module.exports.toSuiteEntry = toSuiteEntry;
