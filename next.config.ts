import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

// Everything runs in the browser, so the site exports to static files that any host can serve.
const nextConfig: NextConfig = {
  // `next dev` does not export; it serves the API rewrite below instead
  output: dev ? undefined : 'export',
  // every page exports as <route>/index.html, which any static host serves without rewrites
  trailingSlash: true,
  images: { unoptimized: true },
  // in production the host forwards /api/bordrless/* (vercel.json, public/_redirects)
  ...(dev && {
    rewrites: async () => [{ source: '/api/bordrless/:path*/', destination: 'https://bordrless.app/api/:path*' }],
  }),
};

export default nextConfig;
