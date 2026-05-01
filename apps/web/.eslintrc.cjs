/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  parserOptions: { project: false },
  ignorePatterns: ['.next/', 'node_modules/', 'dist/'],
  rules: {
    // Match the pipeline package's convention: an underscore prefix opts a
    // var or arg out of unused-var checking. Standard TypeScript discipline.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      },
    ],
  },
};
