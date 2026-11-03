import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@myabeshop/shared'],
  poweredByHeader: false,
  compress: true,
  images: { unoptimized: true },
};

export default nextConfig;
