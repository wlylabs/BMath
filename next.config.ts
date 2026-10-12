import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // every page is prerendered; /api/bordrless/* runs on the server (a cached proxy to bordrless.app)
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
