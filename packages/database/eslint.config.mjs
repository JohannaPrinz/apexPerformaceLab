import { baseConfig } from '@apex/config/eslint/base';

export default [
  ...baseConfig,
  {
    ignores: ['generated/**'],
  },
];
