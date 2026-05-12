/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.expo/',
    '/android/',
    '/ios/',
    '/dist/',
  ],
  // Pure-unit tests only — no native modules involved in the modules under test.
  // If/when we add screen/component tests, jest-expo's preset already mocks
  // most Expo + RN native modules.
};
