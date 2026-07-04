import '@testing-library/jest-dom/vitest';

// localStorage polyfill for test environments
// Provides a working localStorage API when not available through jsdom
if (typeof global !== 'undefined' && !global.localStorage) {
  const store: Record<string, string> = {};

  global.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach(key => {
        delete store[key];
      });
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
}
