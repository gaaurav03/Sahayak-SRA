/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://challenges.cloudflare.com https://*.clerk.accounts.dev https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "img-src 'self' blob: data: https://img.clerk.com https://*.clerk.com https://*.openstreetmap.org https://*.tile.openstreetmap.org https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com https://unpkg.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev",
              "connect-src 'self' https://*.clerk.accounts.dev wss://*.clerk.accounts.dev https://clerk.com https://*.openstreetmap.org https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org",
              "worker-src 'self' blob:",
            ].join("; "),
          },
          {
            // Allow Clerk hosted pages to render in frames
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001/api/v1";
    const cleanApiBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    
    return [
      {
        // Proxy all API calls to Express EXCEPT the auth/sync route
        // which is handled natively by Next.js server-side
        source: "/api/v1/:path((?!auth).*)",
        destination: `${cleanApiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
