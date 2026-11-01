import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Suppress async background cloud sync warnings from racing with worker teardown
const origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Sync product to Supabase') ||
      args[0].includes('Sync customer to Supabase') ||
      args[0].includes('Background sync'))
  ) {
    return;
  }
  origWarn(...args);
};

const origError = console.error;
console.error = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Sync product to Supabase') ||
      args[0].includes('Sync customer to Supabase') ||
      args[0].includes('Background sync'))
  ) {
    return;
  }
  origError(...args);
};

