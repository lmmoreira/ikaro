import { CallExpression, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const RULE = 'occupancy-release-choke-point';

// The only files allowed to free a booking's resource occupancy: the helper that also closes the
// booking's open "Reservas a resolver" entries in the same transaction (M23-S48), the occupancy
// helper module that implements the release and the reschedule move, and the worklist's reassign,
// which moves one row to another resource inside a resolve that closes its own entry and leaves
// the booking's other entries open on purpose.
const ALLOWED_FILE =
  /\/booking-exception-closing\.helpers\.ts$|\/resource-occupancy-assignment\.helpers\.ts$|\/resource-reassignment\.helpers\.ts$/;

function isReleaseCall(call: CallExpression): boolean {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) return expression.getText() === 'releaseBookingOccupancy';
  if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'release') {
    return false;
  }
  return /\bIResourceOccupancyRepository\b/.test(
    expression.getExpression().getType().getText(call),
  );
}

// A booking that stops occupying its resources makes every open worklist entry about it obsolete.
// Calling the release anywhere but the shared helper would leave those entries open on a booking
// that no longer needs a decision, so a new cancel-like path has to go through the helper
// (docs/28-LOCK_CATALOG.md § 2, docs/ENGINEERING_RULES_BACKEND.md).
export function checkOccupancyReleaseChokePoint(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const sourceFile of project.getSourceFiles()) {
    const path = sourceFile.getFilePath();
    if (sourceFile.isDeclarationFile() || /\.spec\.ts$|\.integration\.spec\.ts$/.test(path))
      continue;
    if (!/contexts\/[^/]+\/application\//.test(path)) continue;
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!isReleaseCall(call)) continue;
      scannedTargets++;
      if (ALLOWED_FILE.test(path)) continue;
      findings.push({
        rule: RULE,
        file: path,
        line: sourceLine(sourceFile, call.getStart()),
        message:
          "A booking's resource occupancy must be released through saveTerminalBookingsInTransaction() (booking-exception-closing.helpers.ts), which also closes its open worklist entries.",
      });
    }
  }
  return { rule: RULE, scannedTargets, findings };
}
