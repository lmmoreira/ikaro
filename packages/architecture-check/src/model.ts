export interface Finding {
  rule: string;
  file: string;
  line: number;
  message: string;
}

export interface ScanResult {
  rule: string;
  scannedTargets: number;
  findings: Finding[];
}

/**
 * The CLI's exit-code contract: every finding is an error, and a result that scanned zero targets
 * fails the run too (a silent glob must never read as "nothing to flag").
 */
export function classifyScanResults(results: ScanResult[]): { errors: Finding[]; failed: boolean } {
  const errors = results.flatMap((result) => result.findings);
  const zeroTarget = results.some((result) => result.scannedTargets === 0);
  return { errors, failed: zeroTarget || errors.length > 0 };
}

export function mergeScanResults(rule: string, results: ScanResult[]): ScanResult {
  return {
    rule,
    scannedTargets: results.reduce((sum, result) => sum + result.scannedTargets, 0),
    findings: results.flatMap((result) => result.findings),
  };
}
