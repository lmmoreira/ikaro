import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
