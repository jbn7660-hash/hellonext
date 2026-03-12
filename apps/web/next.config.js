/** @type {import('next').NextConfig} */

const { withSentryConfig } = require('@sentry/nextjs');

// Validate required environment variables at build time
const validateEnvVars = () => {
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
};

// Only validate in production builds
if (process.env.NODE_ENV === 'production') {
  validateEnvVars();
}

const nextConfig = {
  // React Strict Mode for development
  reactStrictMode: true,

  // Transpile shared packages from monorepo
  transpilePackages: ['@hellonext/shared'],

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/hellonext/**',
      },
    ],
    // Optimize images: use WebP format when possible
    formats: ['image/avif', 'image/webp'],
    // Cache optimized images for 1 year (content-hash in filename)
    minimumCacheTTL: 31536000,
  },

  // Performance optimization
  swcMinify: true, // Use SWC for minification (faster than Terser)
  compress: true,
  poweredByHeader: false,

  // Security headers and CSP
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        // Prevent clickjacking attacks
        { key: 'X-Frame-Options', value: 'DENY' },
        // Prevent MIME-type sniffing
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Enforce HTTPS
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        // Referrer policy for privacy
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Content Security Policy (strict)
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' https://cdn.jsdelivr.net https://js.tosspayments.com https://cdn.vercel.com https://blob:",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https: https://res.cloudinary.com",
            "media-src 'self' blob: https: https://res.cloudinary.com",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://*.sentry.io https://*.cloudinary.com https://api.tosspayments.com https://kapi.kakao.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "frame-src 'self' https://js.tosspayments.com https://www.youtube.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
        // Permission policy for browser features
        {
          key: 'Permissions-Policy',
          value: 'camera=(self), microphone=(self), geolocation=(), payment=()',
        },
        // Additional security headers
        { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    },
  ],

  // Redirects for deprecated routes
  redirects: async () => [
    {
      source: '/old-practice',
      destination: '/practice',
      permanent: true, // 301 redirect
    },
  ],

  // Custom webpack configuration for bundle analysis
  webpack: (config, options) => {
    // Add bundle analyzer in development if requested
    if (process.env.ANALYZE === 'true' && !options.isServer) {
      const BundleAnalyzerPlugin =
        require('@next/bundle-analyzer').BundleAnalyzerPlugin;
      config.plugins.push(
        new BundleAnalyzerPlugin({
          enabled: true,
          openAnalyzer: false,
          analyzerMode: 'static',
          reportFileName: '.next/bundle-report.html',
        })
      );
    }
    return config;
  },

  // Cache and TypeScript settings
  cacheMaxMemorySize: 50 * 1024 * 1024, // 50MB
  typescript: {
    // Skip type checking during build — validated separately via `pnpm typecheck`
    ignoreBuildErrors: true,
  },

  // Environment variable prefix for public variables
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',
  },

  // Logging configuration
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

// Apply Sentry configuration
module.exports = withSentryConfig(nextConfig, {
  // Sentry options
  silent: false, // Log Sentry initialization
  org: 'hellonext',
  project: 'hellonext-web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',

  // Only upload source maps in production
  skipSourceMaps: process.env.NODE_ENV !== 'production',

  // Suppress some warnings
  widenClientFileUpload: true,

  // Transpile source maps
  transpileClientSDK: true,
});
