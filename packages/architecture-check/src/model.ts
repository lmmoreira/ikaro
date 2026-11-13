export interface Finding {
  rule: string;
  file: string;
  line: number;
  message: string;
}

/**
 * How a detector's findings count: `error` fails the run (the default for every detector), `warn`
 * prints them as warnings and leaves the exit code alone. A detector starts in `warn` while the
 * work that satisfies it is still in flight (it would otherwise fail every open branch), and its
 * policy-file `mode` is flipped to `error` by the change that finishes that work.
 */
export type DetectorMode = 'warn' | 'error';

export interface ScanResult {
  rule: string;
  scannedTargets: number;
  findings: Finding[];
}

/**
 * The CLI's exit-code contract: a finding of a rule in `warnRules` is a warning and never fails the
 * run; every other finding is an error, and a result that scanned zero targets fails whatever its mode
 * (a silent glob must never read as "nothing to flag").
 */
export function classifyScanResults(
  results: ScanResult[],
  warnRules: ReadonlySet<string>,
): { errors: Finding[]; warnings: Finding[]; failed: boolean } {
  const findings = results.flatMap((result) => result.findings);
  const warnings = findings.filter((finding) => warnRules.has(finding.rule));
  const errors = findings.filter((finding) => !warnRules.has(finding.rule));
  const zeroTarget = results.some((result) => result.scannedTargets === 0);
  return { errors, warnings, failed: zeroTarget || errors.length > 0 };
}

export function mergeScanResults(rule: string, results: ScanResult[]): ScanResult {
  return {
    rule,
    scannedTargets: results.reduce((sum, result) => sum + result.scannedTargets, 0),
    findings: results.flatMap((result) => result.findings),
  };
}
