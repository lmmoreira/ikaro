import '@testing-library/jest-dom/vitest';
import { configureAxe, toHaveNoViolations } from 'jest-axe';
import { expect, vi } from 'vitest';

// Register jest-axe matchers globally — available in all jsdom component specs.
expect.extend(toHaveNoViolations);

// Disable colour-contrast rule globally: jsdom does not compute CSS custom
// properties (--ba-primary etc.) so axe always reports contrast violations
// even for valid branding. Contrast correctness is covered separately by
// the contrastRatio unit tests in apply-branding.spec.ts.
configureAxe({ rules: { 'color-contrast': { enabled: false } } });

// jsdom does not implement HTMLDialogElement.showModal / close.
// Guard is required because lib/** specs run in the node environment where
// HTMLDialogElement is not defined.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = vi.fn().mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn().mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open');
  });
}

// jsdom does not implement URL.createObjectURL / revokeObjectURL (used for local
// image previews). Node's environment already provides these for Blob, so only
// patch when missing.
if (typeof URL.createObjectURL === 'undefined') {
  let objectUrlCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++objectUrlCount}`);
  URL.revokeObjectURL = vi.fn();
}
