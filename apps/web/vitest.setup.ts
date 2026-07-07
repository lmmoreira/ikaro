import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import { expect, vi } from 'vitest';

// Register jest-axe matchers globally — available in all jsdom component specs.
// The configured axe instance (color-contrast disabled) lives in axe-helper.ts;
// specs import { axe } from there, not directly from jest-axe.
expect.extend(toHaveNoViolations);

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

if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.hasOwnProperty('hasPointerCapture')
) {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
}

if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.hasOwnProperty('setPointerCapture')
) {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => undefined,
  });
}

if (
  typeof HTMLElement !== 'undefined' &&
  !HTMLElement.prototype.hasOwnProperty('releasePointerCapture')
) {
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.hasOwnProperty('scrollIntoView')) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
}

// jsdom does not implement ResizeObserver — cmdk (the Command/combobox primitive) observes
// its list element to recalculate visible items.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
