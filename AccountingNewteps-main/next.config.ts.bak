
import nextPWA from "@ducanh2912/next-pwa";

const withPWA = nextPWA({
  dest: "public",
  disable: false,
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          },
          networkTimeoutSeconds: 3,
        },
      },
      {
        urlPattern: ({ request }) =>
          request.destination === 'script' || request.destination === 'style' || request.destination === 'font',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
        },
      },
      {
        urlPattern: ({ request }) => request.destination === 'image',
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
       {
        urlPattern: ({ url }) => url.href.includes("firebaseio.com") || url.href.includes("googleapis.com"),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-data',
          networkTimeoutSeconds: 5,
        },
      },
    ],
  },
  fallbacks: {
    document: "/offline",
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
};

export default withPWA(nextConfig);
