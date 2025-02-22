/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Enable compression for better performance
  compress: true,

  // Configure poweredByHeader
  poweredByHeader: false,

  // Configure rewrites for API proxying
  async rewrites() {
    return process.env.NODE_ENV === 'production' ? [] : [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/sanctum/csrf-cookie',
        destination: 'http://localhost:8000/sanctum/csrf-cookie',
      },
      {
        source: '/storage/:path*',
        destination: 'http://localhost:8000/storage/:path*',
      }
    ];
  },

// Configure response headers
async headers() {
    return [
    {
        source: '/:path*',
        headers: [
        { key: 'Access-Control-Allow-Credentials', value: 'true' },
        { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
        { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        {
            key: 'Content-Security-Policy',
            value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self' http://localhost:8000",
            "frame-ancestors 'none'"
            ].join('; ')
        }
        ]
    }
    ];
},

// Configure webpack for development
webpack: (config, { dev, isServer }) => {
    // Enable polling in development for better hot reload in certain environments
    if (!isServer && dev) {
    config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
    };
    }
    
    return config;
},

// Optimize images
images: {
    domains: ['localhost'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    unoptimized: true
},

// Enable experimental features
experimental: {
    scrollRestoration: true,
},
};

module.exports = nextConfig;
