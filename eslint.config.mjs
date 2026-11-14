import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
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

export default config;
