/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 120000, 
  transform: {},
  testMatch: ['**/tests/concurrency/**/*.test.cjs'],
};
