import '@testing-library/jest-dom';

// Mock Firebase
jest.mock('../services/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(),
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
  },
  db: {},
  storage: {},
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

// Mock crypto.subtle for Node.js environment
if (typeof (globalThis as any).crypto === 'undefined' || !(globalThis as any).crypto?.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');
  (globalThis as any).crypto = {
    ...(globalThis as any).crypto,
    subtle: {
      digest: jest.fn().mockImplementation(async (_algorithm: string, data: ArrayBuffer) => {
        const hash = crypto.createHash('sha256');
        hash.update(Buffer.from(data));
        return Buffer.from(hash.digest('hex'), 'hex');
      }),
    },
  } as any;
}