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
    '\\.(json)$': '<rootDir>/src/test/__mocks__/jsonMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/test/**',
    '!src/main.tsx',
    '!src/services/firebase.ts', // Utilise import.meta.env
    '!src/services/errorHandler.ts', // Utilise import.meta.env
    '!src/services/adminAuth.ts', // Utilise import.meta.env
    '!src/components/UI/ManaSymbol.tsx', // Utilise des imports d'images
    '!src/utils/keywordSearch.ts', // Utilise des imports JSON
  ],
  coverageThreshold: {
    global: {
      branches: 0, // Désactivé temporairement - à augmenter progressivement
      functions: 0,
      lines: 0,
      statements: 0,
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
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library/jest-dom)/)',
  ],
};
