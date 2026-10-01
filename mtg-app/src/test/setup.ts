import '@testing-library/jest-dom';

// Mock PocketBase
jest.mock('../services/pocketbase', () => ({
  pb: {
    collection: jest.fn(() => ({
      getFullList: jest.fn().mockResolvedValue([]),
      getOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      authWithPassword: jest.fn(),
    })),
    authStore: {
      isValid: false,
      model: null,
      onChange: jest.fn(() => () => {}),
      clear: jest.fn(),
    },
  },
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
(globalThis as any).IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
       args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock TextEncoder/TextDecoder for Node.js environment
if (typeof (globalThis as any).TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util') as typeof import('util');
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

// Always provide crypto.subtle — jsdom/Node stubs are incomplete, and jest.fn
// implementations get wiped by clearAllMocks in individual suites.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: {
      getRandomValues: (arr: Uint8Array) => nodeCrypto.randomFillSync(arr),
      subtle: {
        digest: async (_algorithm: string, data: BufferSource) => {
          const hash = nodeCrypto.createHash('sha256');
          const bytes =
            data instanceof ArrayBuffer
              ? Buffer.from(data)
              : Buffer.from((data as ArrayBufferView).buffer);
          hash.update(bytes);
          return hash.digest().buffer;
        },
      },
    },
  });
}
