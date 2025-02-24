/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  compress: true,
  poweredByHeader: false,

  // Ensure environment variables are available
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://demo.medgnosis.app/api',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://demo.medgnosis.app',
  },
  
  // Configure module resolution
  webpack: (config, { isServer }) => {
    config.resolve.modules.push(__dirname)
    return config
  }
}

module.exports = nextConfig
