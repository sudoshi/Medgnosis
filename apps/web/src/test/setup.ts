// =============================================================================
// Medgnosis Web — Vitest setup
// =============================================================================

import '@testing-library/jest-dom/vitest';

// jsdom lacks browser APIs that Radix/cmdk reference on mount. Stub them so
// component tests can render without ReferenceErrors.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = (): void => {};
}
