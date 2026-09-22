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

export function mergeScanResults(rule: string, results: ScanResult[]): ScanResult {
  return {
    rule,
    scannedTargets: results.reduce((sum, result) => sum + result.scannedTargets, 0),
    findings: results.flatMap((result) => result.findings),
  };
}
