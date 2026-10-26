import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';
import { resetViewport } from './media';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// jsdom has no matchMedia; default to a desktop viewport (tests override with mockViewport).
beforeEach(resetViewport);
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// jsdom lacks these; Radix popovers / cmdk call them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;
