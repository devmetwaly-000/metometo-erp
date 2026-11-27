
// @ts-check
import nextPWA from "@ducanh2912/next-pwa";
import path from "node:path";

const withPWA = nextPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  fallbacks: {
    document: "/offline",
  },
  // Disable PWA in development to avoid compilation blocking
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_PWA === 'true',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // 1. Navigation requests (full page loads / refreshes / deep links)
      {
        urlPattern: ({ request, url }) => {
          const isSameOrigin = self.origin === url.origin;
          return request.mode === 'navigate' && isSameOrigin && !url.pathname.startsWith('/api/');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-cache',
          matchOptions: {
            ignoreVary: true,
            ignoreSearch: true,
          },
          expiration: {
            maxEntries: 250,
            maxAgeSeconds: 24 * 60 * 60 * 30, // 30 Days
          },
          networkTimeoutSeconds: 2,
        },
      },
      // 2. Next.js App Router RSC Payloads (matches ?_rsc=, &rsc=, OR RSC headers)
      {
        urlPattern: ({ request, url }) => {
          const isSameOrigin = self.origin === url.origin;
          if (!isSameOrigin || url.pathname.startsWith('/api/')) return false;
          return (
            url.searchParams.has('_rsc') ||
            request.headers.get('RSC') === '1' ||
            request.headers.get('Next-Router-Prefetch') === '1' ||
            request.headers.get('Next-Router-State-Tree') !== null ||
            /[?&]_rsc=/i.test(url.search)
          );
        },
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-rsc-cache',
          matchOptions: {
            ignoreVary: true,
            ignoreSearch: true,
          },
          expiration: {
            maxEntries: 500,
            maxAgeSeconds: 24 * 60 * 60 * 30, // 30 Days
          },
        },
      },
      // 3. Document / HTML background warmup fetches (when Accept header includes text/html)
      {
        urlPattern: ({ request, url }) => {
          const isSameOrigin = self.origin === url.origin;
          if (!isSameOrigin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return false;
          return request.destination === 'document' || request.headers.get('accept')?.includes('text/html');
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-cache',
          matchOptions: {
            ignoreVary: true,
            ignoreSearch: true,
          },
          expiration: {
            maxEntries: 250,
            maxAgeSeconds: 24 * 60 * 60 * 30, // 30 Days
          },
          networkTimeoutSeconds: 2,
        },
      },
      // 4. Next.js static build chunks (JS, CSS)
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 1000,
            maxAgeSeconds: 24 * 60 * 60 * 30, // 30 Days
          },
        },
      },
      // 5. Next.js image optimization
      {
        urlPattern: /\/_next\/image\?.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 24 * 60 * 60 * 30, // 30 Days
          },
        },
      },
      // 6. Fonts and media assets
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|eot|wasm)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 250,
            maxAgeSeconds: 24 * 60 * 60 * 30,
          },
        },
      },
      // 7. Static JSON / XML
      {
        urlPattern: /\.(?:json|xml|csv)$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'static-data-assets',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60 * 24, // 24 Hours
          },
          networkTimeoutSeconds: 2,
        },
      },
      // 8. Cross origin requests
      {
        urlPattern: ({ url }) => {
          const isSameOrigin = self.origin === url.origin;
          return !isSameOrigin;
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'cross-origin',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 60 * 60, // 1 hour
          },
          networkTimeoutSeconds: 3,
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => { config.parallelism = 2; config.resolve.alias = { ...config.resolve.alias, "@": path.resolve(process.cwd(), "src") }; return config; },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pdf-to-printer'],
  reactStrictMode: false,
  experimental: {
    cpus: 2,
optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'recharts',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-switch',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-slot',
      'localforage'
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
       {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default withPWA(nextConfig);
