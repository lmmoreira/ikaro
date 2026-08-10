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
