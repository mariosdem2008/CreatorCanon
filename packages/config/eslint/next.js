/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [
    require.resolve('./base.js'),
    'next/core-web-vitals',
    'next/typescript',
  ],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'react/no-unescaped-entities': 'off',
  },
};
