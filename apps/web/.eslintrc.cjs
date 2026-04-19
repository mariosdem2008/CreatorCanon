/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  parserOptions: { project: false },
  ignorePatterns: ['.next/', 'node_modules/', 'dist/'],
};
