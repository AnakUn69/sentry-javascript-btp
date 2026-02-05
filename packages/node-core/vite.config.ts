import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    alias: {
      '@sentry/core': new URL('../core/src', import.meta.url).pathname,
    },
  },
};
