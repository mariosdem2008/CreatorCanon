import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      '@sentry/node',
      'require-in-the-middle',
      '@opentelemetry/instrumentation',
      '@opentelemetry/sdk-node',
    ],
  },
  transpilePackages: ['@creatorcanon/ui', '@creatorcanon/core', '@creatorcanon/auth', '@creatorcanon/db'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  tunnelRoute: '/monitoring',
});
