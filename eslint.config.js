const nextConfig = require('eslint-config-next');

module.exports = [
  ...nextConfig,
  {
    ignores: [
      '.next/',
      'node_modules/',
      '.vercel/',
      'coverage/',
      'next-env.d.ts',
      'package-lock.json',
    ],
  },
];
