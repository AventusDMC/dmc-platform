import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    middlewareClientMaxBodySize: '25mb',
    parallelServerBuildTraces: false,
    serverActions: {
      bodySizeLimit: '25mb',
    },
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
