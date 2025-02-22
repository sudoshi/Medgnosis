/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static page generation for dynamic routes
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

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

// Configure webpack for development and production
webpack: (config, { dev, isServer }) => {
    // Add fallbacks for node modules
    if (!isServer) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
        };
    }

    // Enable polling in development
    if (!isServer && dev) {
        config.watchOptions = {
            ...config.watchOptions,
            poll: 1000,
            aggregateTimeout: 300,
        };
    }

    // Production optimizations
    if (!dev) {
        config.optimization = {
            ...config.optimization,
            minimize: true,
            splitChunks: {
                chunks: 'all',
                minSize: 20000,
                maxSize: 244000,
                minChunks: 1,
                maxAsyncRequests: 30,
                maxInitialRequests: 30,
                cacheGroups: {
                    defaultVendors: {
                        test: /[\\]node_modules[\\]/,
                        priority: -10,
                        reuseExistingChunk: true,
                    },
                    default: {
                        minChunks: 2,
                        priority: -20,
                        reuseExistingChunk: true,
                    },
                },
            },
        };
    }

    return config;
},

// Optimize images
images: {
    domains: ['localhost', 'demo.medgnosis.app'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60,
    formats: ['image/webp'],
    unoptimized: process.env.NODE_ENV === 'development',
},

// Enable experimental features
experimental: {
    scrollRestoration: true,
    optimizeCss: true,
    optimizeServerReact: true,
    serverActions: true,
},

// Configure build output
distDir: process.env.NODE_ENV === 'production' ? '.next/standalone' : '.next',
reactStrictMode: true,
swcMinify: true,
};

module.exports = nextConfig;
