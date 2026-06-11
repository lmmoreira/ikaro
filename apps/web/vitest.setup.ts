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
