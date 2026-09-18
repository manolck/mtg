/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/*.{spec,test}.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg|webp)$': '<rootDir>/src/test/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/test/**',
    '!src/main.tsx',
    '!src/services/errorHandler.ts',
    '!src/services/adminAuth.ts',
    '!src/components/UI/ManaSymbol.tsx', // Utilise des imports d'images
    '!src/utils/keywordSearch.ts', // Utilise des imports JSON
  ],
  coverageThreshold: {
    global: {
      branches: 8,
      functions: 10,
      lines: 12,
      statements: 12,
    },
    // Seuils spécifiques par fichier testé
    './src/services/csvParser.ts': {
      branches: 60,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/hooks/useAuth.ts': {
      branches: 80,
      functions: 100,
      lines: 80,
      statements: 80,
    },
    './src/utils/pocketbaseFilter.ts': {
      branches: 80,
      functions: 100,
      lines: 80,
      statements: 80,
    },
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
        useESM: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library/jest-dom)/)',
  ],
};
